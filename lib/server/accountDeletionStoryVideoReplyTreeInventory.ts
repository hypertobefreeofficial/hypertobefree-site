/**
 * Authoritative read-only reply-tree safety inventory for story_video_replies
 * (Phase 4C.7B.1E.2B.3b).
 *
 * Architecture: paginated target discovery → seed graph → bidirectional fixed-point
 * closure (parent + child expansion with chunked/paginated SELECTs) until no new rows.
 * Non-participant replies do not receive top-level inventories, but MUST appear in the
 * loaded graph when they are ancestors or descendants of a target-associated reply.
 *
 * Query completeness is established by explicit page exhaustion — never PostgREST defaults.
 * Paginated application-level SELECTs do not provide transactional snapshot isolation
 * across the inventory run; future destructive orchestration must rebuild inventory after
 * write freeze (2B.3c review).
 *
 * Same-process authority: only the production DB-backed loader may register trusted batches.
 * Production code must call loadTargetReplyTreeInventoryBatch(targetUserId) only.
 *
 * Server-only SELECT queries — no mutations. Never authorizes deletion.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const REPLY_TREE_INVENTORY_ARCHITECTURE_NOTE =
  "Paginated target discovery → bidirectional fixed-point closure (chunked parent id + paginated child parent_reply_id expansion until fixed point) → O(V+E) analysis; same-process runtime authority only." as const;

export const REPLY_TREE_INVENTORY_FINGERPRINT_NOTE =
  "Fingerprint is a drift hint / integrity check only — not provenance and never deletion authority." as const;

export const REPLY_TREE_INVENTORY_SAME_PROCESS_AUTHORITY_NOTE =
  "Authoritative loader → trusted frozen object → consume in same server execution context; rehydrated copies fail validation." as const;

export const REPLY_TREE_QUERY_COMPLETENESS_NOTE =
  "Authoritative query completeness is established by explicit page exhaustion, never the API default row limit." as const;

export const REPLY_TREE_INVENTORY_SNAPSHOT_LIMITATION_NOTE =
  "Paginated read-only inventory SELECTs do not provide transactional snapshot isolation across the inventory run; future destructive orchestration must rebuild authoritative inventory in the same server execution after deletion write freeze — 2B.3c must address concurrent third-party writes before destructive reply handling." as const;

/** Explicit SELECT page size — below PostgREST default max-rows (1000). */
export const REPLY_TREE_QUERY_PAGE_SIZE = 500 as const;

/** Safe `.in(...)` chunk size for id / parent_reply_id filters. */
export const REPLY_TREE_ID_QUERY_CHUNK_SIZE = 100 as const;

/** Maximum pagination pages per query before fail-closed. */
export const REPLY_TREE_QUERY_PAGE_CAP = 10_000 as const;

/** Maximum supported ancestry/descendant hop count during analysis (inclusive). */
export const REPLY_TREE_DEPTH_SAFETY_CAP = 100 as const;

/** Maximum graph-closure expansion rounds — intentionally above depth cap. */
export const REPLY_TREE_GRAPH_CLOSURE_ROUND_CAP = 256 as const;

export type ReplyTreeParticipantRole = "sender" | "recipient";

export type ReplyTreeSafetyBlocker = {
  code: string;
  reason: string;
};

export type ReplyTreeNodeInventory = {
  replyId: string;
  storyId: string;
  userId: string | null;
  recipientUserId: string | null;
  parentReplyId: string | null;
  targetParticipantRoles: readonly ReplyTreeParticipantRole[];
  childReplyIds: readonly string[];
  descendantReplyIds: readonly string[];
  targetOnlyOrSelf: boolean;
  hasAmbiguousParticipant: boolean;
  hasSurvivingParticipant: boolean;
  directChildCount: number;
  descendantCount: number;
  hasCrossUserDescendant: boolean;
  hasAmbiguousDescendant: boolean;
  ancestryComplete: boolean;
  descendantsComplete: boolean;
  cycleDetected: boolean;
  crossStoryLinkDetected: boolean;
  orphanParentDetected: boolean;
  maxDescendantDepth: number;
  blockers: readonly ReplyTreeSafetyBlocker[];
  fingerprint: string;
};

export type TargetReplyTreeInventoryBatch = {
  ok: boolean;
  targetUserId: string;
  expectedTargetReplyIds: readonly string[];
  inventories: readonly ReplyTreeNodeInventory[];
  blockers: readonly ReplyTreeSafetyBlocker[];
  graphClosureComplete: boolean;
  fingerprint: string;
};

type TrustedReplyTreeBatchSnapshot = {
  targetUserId: string;
  canonicalExpectedTargetReplyIds: readonly string[];
  canonicalInventoryRefs: readonly ReplyTreeNodeInventory[];
  canonicalGraphFingerprint: string;
  graphClosureComplete: boolean;
  ok: boolean;
};

/** Loader-registered node inventories — not exported; cannot be forged externally. */
const authoritativeReplyTreeInventories = new WeakSet<ReplyTreeNodeInventory>();

/** Loader-registered batch snapshots — not exported; cannot be forged externally. */
const trustedReplyTreeBatchSnapshots = new WeakMap<
  TargetReplyTreeInventoryBatch,
  TrustedReplyTreeBatchSnapshot
>();

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REPLY_GRAPH_ROW_COLUMNS =
  "id, story_id, user_id, recipient_user_id, parent_reply_id" as const;

export type StoryVideoReplyGraphRow = {
  id: string;
  story_id: string;
  user_id: string | null;
  recipient_user_id: string | null;
  parent_reply_id: string | null;
};

type PaginatedFetchResult =
  | { ok: true; rows: StoryVideoReplyGraphRow[] }
  | { ok: false; blocker: ReplyTreeSafetyBlocker };

function getEffectiveQueryPageSize(): number {
  if (typeof process !== "undefined" && process.env.VITEST === "true") {
    const override = process.env.REPLY_TREE_TEST_QUERY_PAGE_SIZE;
    if (override != null) {
      const parsed = Number(override);
      if (Number.isInteger(parsed) && parsed >= 1) {
        return parsed;
      }
    }
  }
  return REPLY_TREE_QUERY_PAGE_SIZE;
}

function getEffectiveIdQueryChunkSize(): number {
  if (typeof process !== "undefined" && process.env.VITEST === "true") {
    const override = process.env.REPLY_TREE_TEST_ID_QUERY_CHUNK_SIZE;
    if (override != null) {
      const parsed = Number(override);
      if (Number.isInteger(parsed) && parsed >= 1) {
        return parsed;
      }
    }
  }
  return REPLY_TREE_ID_QUERY_CHUNK_SIZE;
}

function chunkIds(ids: readonly string[], chunkSize: number): string[][] {
  const sorted = [...new Set(ids)].sort();
  const chunks: string[][] = [];
  for (let index = 0; index < sorted.length; index += chunkSize) {
    chunks.push(sorted.slice(index, index + chunkSize));
  }
  return chunks;
}

function deepFreeze<T extends object>(value: T): T {
  Object.freeze(value);
  for (const property of Object.values(value)) {
    if (
      property &&
      typeof property === "object" &&
      !Object.isFrozen(property)
    ) {
      deepFreeze(property as object);
    }
  }
  return value;
}

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isValidUuid(value);
}

function graphRowsEqual(
  left: StoryVideoReplyGraphRow,
  right: StoryVideoReplyGraphRow
): boolean {
  return (
    left.id === right.id &&
    left.story_id === right.story_id &&
    left.user_id === right.user_id &&
    left.recipient_user_id === right.recipient_user_id &&
    left.parent_reply_id === right.parent_reply_id
  );
}

function validateGraphRow(
  row: unknown,
  context: string
): { ok: true; row: StoryVideoReplyGraphRow } | { ok: false; blocker: ReplyTreeSafetyBlocker } {
  if (!row || typeof row !== "object") {
    return {
      ok: false,
      blocker: {
        code: "REPLY_TREE_GRAPH_MALFORMED",
        reason: `${context}: row is not an object.`,
      },
    };
  }

  const candidate = row as Record<string, unknown>;
  if (!isValidUuid(candidate.id)) {
    return {
      ok: false,
      blocker: {
        code: "REPLY_TREE_GRAPH_MALFORMED",
        reason: `${context}: missing or malformed id.`,
      },
    };
  }

  if (!isValidUuid(candidate.story_id)) {
    return {
      ok: false,
      blocker: {
        code: "REPLY_TREE_GRAPH_MALFORMED",
        reason: `${context}: missing or malformed story_id for reply ${candidate.id}.`,
      },
    };
  }

  if (!isNullableUuid(candidate.user_id)) {
    return {
      ok: false,
      blocker: {
        code: "REPLY_TREE_GRAPH_MALFORMED",
        reason: `${context}: malformed user_id for reply ${candidate.id}.`,
      },
    };
  }

  if (!isNullableUuid(candidate.recipient_user_id)) {
    return {
      ok: false,
      blocker: {
        code: "REPLY_TREE_GRAPH_MALFORMED",
        reason: `${context}: malformed recipient_user_id for reply ${candidate.id}.`,
      },
    };
  }

  if (!isNullableUuid(candidate.parent_reply_id)) {
    return {
      ok: false,
      blocker: {
        code: "REPLY_TREE_GRAPH_MALFORMED",
        reason: `${context}: malformed parent_reply_id for reply ${candidate.id}.`,
      },
    };
  }

  return {
    ok: true,
    row: {
      id: candidate.id,
      story_id: candidate.story_id,
      user_id: candidate.user_id,
      recipient_user_id: candidate.recipient_user_id,
      parent_reply_id: candidate.parent_reply_id,
    },
  };
}

function mergeGraphRow(input: {
  rowsById: Map<string, StoryVideoReplyGraphRow>;
  row: StoryVideoReplyGraphRow;
  context: string;
}):
  | { ok: true; added: boolean }
  | { ok: false; blocker: ReplyTreeSafetyBlocker } {
  const existing = input.rowsById.get(input.row.id);
  if (existing) {
    if (graphRowsEqual(existing, input.row)) {
      return { ok: true, added: false };
    }
    return {
      ok: false,
      blocker: {
        code: "REPLY_TREE_CONFLICTING_DUPLICATE_REPLY",
        reason: `${input.context}: conflicting duplicate reply id ${input.row.id}.`,
      },
    };
  }

  input.rowsById.set(input.row.id, input.row);
  return { ok: true, added: true };
}

function registerAuthoritativeReplyTreeInventory(
  inventory: ReplyTreeNodeInventory
): ReplyTreeNodeInventory {
  const registered = deepFreeze({
    ...inventory,
    targetParticipantRoles: Object.freeze([...inventory.targetParticipantRoles]),
    childReplyIds: Object.freeze([...inventory.childReplyIds]),
    descendantReplyIds: Object.freeze([...inventory.descendantReplyIds]),
    blockers: Object.freeze([...inventory.blockers]),
  });
  authoritativeReplyTreeInventories.add(registered);
  return registered;
}

function registerAuthoritativeReplyTreeBatch(input: {
  batch: TargetReplyTreeInventoryBatch;
  canonicalExpectedTargetReplyIds: readonly string[];
  canonicalGraphFingerprint: string;
  inventories: readonly ReplyTreeNodeInventory[];
}): TargetReplyTreeInventoryBatch {
  const registeredInventories = input.inventories.map((inventory) =>
    registerAuthoritativeReplyTreeInventory(inventory)
  );

  const frozenExpectedIds = Object.freeze([
    ...input.canonicalExpectedTargetReplyIds,
  ]) as readonly string[];

  const registered = Object.freeze({
    ...input.batch,
    inventories: Object.freeze(registeredInventories),
    blockers: Object.freeze([...input.batch.blockers]),
    expectedTargetReplyIds: frozenExpectedIds,
  }) as TargetReplyTreeInventoryBatch;

  const snapshot = Object.freeze({
    targetUserId: input.batch.targetUserId,
    canonicalExpectedTargetReplyIds: frozenExpectedIds,
    canonicalInventoryRefs: Object.freeze(registeredInventories),
    canonicalGraphFingerprint: input.canonicalGraphFingerprint,
    graphClosureComplete: input.batch.graphClosureComplete,
    ok: input.batch.ok,
  }) satisfies TrustedReplyTreeBatchSnapshot;

  trustedReplyTreeBatchSnapshots.set(registered, snapshot);
  return registered;
}

function buildUntrustedBatch(
  batch: Omit<TargetReplyTreeInventoryBatch, "expectedTargetReplyIds"> & {
    expectedTargetReplyIds: readonly string[];
  }
): TargetReplyTreeInventoryBatch {
  return Object.freeze({
    ...batch,
    expectedTargetReplyIds: Object.freeze([
      ...batch.expectedTargetReplyIds,
    ]) as readonly string[],
    inventories: Object.freeze([...batch.inventories]),
    blockers: Object.freeze([...batch.blockers]),
  }) as TargetReplyTreeInventoryBatch;
}

function inventoryRefsMatchSnapshot(input: {
  inventories: readonly ReplyTreeNodeInventory[];
  snapshot: TrustedReplyTreeBatchSnapshot;
}): boolean {
  if (input.inventories.length !== input.snapshot.canonicalInventoryRefs.length) {
    return false;
  }
  for (let index = 0; index < input.inventories.length; index += 1) {
    if (input.inventories[index] !== input.snapshot.canonicalInventoryRefs[index]) {
      return false;
    }
  }
  return true;
}

function classifyTargetParticipantRoles(input: {
  userId: string | null;
  recipientUserId: string | null;
  targetUserId: string;
}): ReplyTreeParticipantRole[] {
  const roles: ReplyTreeParticipantRole[] = [];
  if (input.userId === input.targetUserId) {
    roles.push("sender");
  }
  if (input.recipientUserId === input.targetUserId) {
    roles.push("recipient");
  }
  return roles;
}

function classifyTargetOnlyOrSelf(input: {
  userId: string | null;
  recipientUserId: string | null;
  targetUserId: string;
}): boolean {
  return (
    input.userId === input.targetUserId &&
    input.recipientUserId === input.targetUserId
  );
}

function replyHasAmbiguousParticipant(row: StoryVideoReplyGraphRow): boolean {
  return row.user_id == null || row.recipient_user_id == null;
}

function hasSurvivingParticipant(input: {
  userId: string | null;
  recipientUserId: string | null;
  targetUserId: string;
}): boolean {
  if (input.userId != null && input.userId !== input.targetUserId) {
    return true;
  }
  if (
    input.recipientUserId != null &&
    input.recipientUserId !== input.targetUserId
  ) {
    return true;
  }
  return false;
}

function descendantParticipantFlags(input: {
  row: StoryVideoReplyGraphRow;
  targetUserId: string;
}): { crossUser: boolean; ambiguous: boolean } {
  const { row, targetUserId } = input;

  if (row.user_id == null || row.recipient_user_id == null) {
    return { crossUser: false, ambiguous: true };
  }

  const senderIsTarget = row.user_id === targetUserId;
  const recipientIsTarget = row.recipient_user_id === targetUserId;

  if (senderIsTarget && recipientIsTarget) {
    return { crossUser: false, ambiguous: false };
  }

  return { crossUser: true, ambiguous: false };
}

function computeGraphFingerprint(input: {
  targetUserId: string;
  expectedTargetReplyIds: readonly string[];
  rowsById: ReadonlyMap<string, StoryVideoReplyGraphRow>;
  graphClosureComplete: boolean;
}): string {
  const rowSignatures = [...input.rowsById.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(
      (row) =>
        [
          row.id,
          row.story_id,
          row.user_id ?? "",
          row.recipient_user_id ?? "",
          row.parent_reply_id ?? "",
        ].join("|")
    )
    .join(";");

  const expectedIds = [...input.expectedTargetReplyIds].sort().join(",");

  return [
    "rtg1",
    input.targetUserId,
    input.graphClosureComplete ? "1" : "0",
    expectedIds,
    rowSignatures,
  ].join(":");
}

export function computeReplyTreeNodeFingerprint(input: {
  inventory: ReplyTreeNodeInventory;
}): string {
  const inv = input.inventory;
  const blockerCodes = inv.blockers
    .map((entry) => entry.code)
    .sort()
    .join(",");

  return [
    "rt1",
    inv.replyId,
    inv.storyId,
    inv.userId ?? "",
    inv.recipientUserId ?? "",
    inv.parentReplyId ?? "",
    inv.targetParticipantRoles.join("+"),
    inv.childReplyIds.join(","),
    inv.descendantReplyIds.join(","),
    inv.targetOnlyOrSelf ? "1" : "0",
    inv.hasAmbiguousParticipant ? "1" : "0",
    inv.hasSurvivingParticipant ? "1" : "0",
    inv.hasCrossUserDescendant ? "1" : "0",
    inv.hasAmbiguousDescendant ? "1" : "0",
    inv.ancestryComplete ? "1" : "0",
    inv.descendantsComplete ? "1" : "0",
    inv.cycleDetected ? "1" : "0",
    inv.crossStoryLinkDetected ? "1" : "0",
    inv.orphanParentDetected ? "1" : "0",
    String(inv.maxDescendantDepth),
    blockerCodes,
  ].join(":");
}

export function computeTargetReplyTreeInventoryBatchFingerprint(input: {
  targetUserId: string;
  expectedTargetReplyIds: readonly string[];
  inventories: readonly ReplyTreeNodeInventory[];
  blockers: readonly ReplyTreeSafetyBlocker[];
  ok: boolean;
  graphClosureComplete: boolean;
  graphFingerprint: string;
}): string {
  const inventoryFingerprints = input.inventories
    .map((entry) => entry.fingerprint)
    .sort()
    .join("|");
  const blockerCodes = input.blockers
    .map((entry) => entry.code)
    .sort()
    .join(",");
  const expectedIds = [...input.expectedTargetReplyIds].sort().join(",");

  return [
    "rtb1",
    input.targetUserId,
    input.ok ? "1" : "0",
    input.graphClosureComplete ? "1" : "0",
    expectedIds,
    input.graphFingerprint,
    inventoryFingerprints,
    blockerCodes,
  ].join(":");
}

function buildChildrenMap(
  rowsById: ReadonlyMap<string, StoryVideoReplyGraphRow>
): Map<string, readonly string[]> {
  const children = new Map<string, string[]>();

  for (const row of rowsById.values()) {
    if (row.parent_reply_id == null) {
      continue;
    }
    const siblings = children.get(row.parent_reply_id) ?? [];
    siblings.push(row.id);
    children.set(row.parent_reply_id, siblings);
  }

  return new Map(
    [...children.entries()].map(([parentId, childIds]) => [
      parentId,
      Object.freeze([...childIds].sort()) as readonly string[],
    ])
  );
}

function collectMissingParentReplyIds(
  rowsById: ReadonlyMap<string, StoryVideoReplyGraphRow>
): string[] {
  const missing = new Set<string>();
  for (const row of rowsById.values()) {
    if (row.parent_reply_id != null && !rowsById.has(row.parent_reply_id)) {
      missing.add(row.parent_reply_id);
    }
  }
  return [...missing];
}

async function fetchPaginatedRows(input: {
  serviceRoleClient: SupabaseClient;
  fetchPage: (
    offset: number,
    pageSize: number
  ) => Promise<{ data: unknown[] | null; error: unknown }>;
  queryFailureBlocker: ReplyTreeSafetyBlocker;
}): Promise<PaginatedFetchResult> {
  const pageSize = getEffectiveQueryPageSize();
  const rows: StoryVideoReplyGraphRow[] = [];

  for (let pageIndex = 0; pageIndex < REPLY_TREE_QUERY_PAGE_CAP; pageIndex += 1) {
    const offset = pageIndex * pageSize;
    const { data, error } = await input.fetchPage(offset, pageSize);

    if (error || !Array.isArray(data)) {
      return { ok: false, blocker: input.queryFailureBlocker };
    }

    rows.push(...(data as StoryVideoReplyGraphRow[]));

    if (data.length < pageSize) {
      return { ok: true, rows };
    }
  }

  return {
    ok: false,
    blocker: {
      code: "REPLY_TREE_QUERY_PAGINATION_LIMIT_EXCEEDED",
      reason: `Query exceeded ${REPLY_TREE_QUERY_PAGE_CAP} pages of ${pageSize} rows without reaching exhaustion.`,
    },
  };
}

async function fetchTargetAssociatedReplies(input: {
  serviceRoleClient: SupabaseClient;
  targetUserId: string;
}): Promise<PaginatedFetchResult> {
  return fetchPaginatedRows({
    serviceRoleClient: input.serviceRoleClient,
    queryFailureBlocker: {
      code: "TARGET_REPLY_LIST_QUERY_FAILED",
      reason:
        "Target-associated reply list query failed — inventory batch is not authoritative.",
    },
    fetchPage: async (offset, pageSize) =>
      input.serviceRoleClient
        .from("story_video_replies")
        .select(REPLY_GRAPH_ROW_COLUMNS)
        .or(
          `user_id.eq.${input.targetUserId},recipient_user_id.eq.${input.targetUserId}`
        )
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1),
  });
}

async function fetchReplyRowsByIds(input: {
  serviceRoleClient: SupabaseClient;
  replyIds: readonly string[];
}): Promise<PaginatedFetchResult> {
  if (input.replyIds.length === 0) {
    return { ok: true, rows: [] };
  }

  const requestedIds = new Set(input.replyIds);
  const mergedRows: StoryVideoReplyGraphRow[] = [];
  const chunkSize = getEffectiveIdQueryChunkSize();

  for (const idChunk of chunkIds(input.replyIds, chunkSize)) {
    const chunkResult = await fetchPaginatedRows({
      serviceRoleClient: input.serviceRoleClient,
      queryFailureBlocker: {
        code: "REPLY_TREE_PARENT_QUERY_FAILED",
        reason: "Parent reply expansion query failed — graph closure aborted.",
      },
      fetchPage: async (offset, pageSize) =>
        input.serviceRoleClient
          .from("story_video_replies")
          .select(REPLY_GRAPH_ROW_COLUMNS)
          .in("id", [...idChunk])
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1),
    });

    if (chunkResult.ok === false) {
      return chunkResult;
    }

    for (const rawRow of chunkResult.rows) {
      const validated = validateGraphRow(rawRow, "parent expansion");
      if (validated.ok === false) {
        return { ok: false, blocker: validated.blocker };
      }
      if (!requestedIds.has(validated.row.id)) {
        return {
          ok: false,
          blocker: {
            code: "REPLY_TREE_GRAPH_MALFORMED",
            reason: `Parent expansion returned unexpected reply id ${validated.row.id}.`,
          },
        };
      }
      mergedRows.push(validated.row);
    }
  }

  return { ok: true, rows: mergedRows };
}

async function fetchReplyRowsByParentIds(input: {
  serviceRoleClient: SupabaseClient;
  parentReplyIds: readonly string[];
}): Promise<PaginatedFetchResult> {
  if (input.parentReplyIds.length === 0) {
    return { ok: true, rows: [] };
  }

  const requestedParentIds = new Set(input.parentReplyIds);
  const mergedRows: StoryVideoReplyGraphRow[] = [];
  const chunkSize = getEffectiveIdQueryChunkSize();

  for (const parentChunk of chunkIds(input.parentReplyIds, chunkSize)) {
    const requestedChunk = new Set(parentChunk);
    const chunkResult = await fetchPaginatedRows({
      serviceRoleClient: input.serviceRoleClient,
      queryFailureBlocker: {
        code: "REPLY_TREE_CHILD_QUERY_FAILED",
        reason: "Child reply expansion query failed — graph closure aborted.",
      },
      fetchPage: async (offset, pageSize) =>
        input.serviceRoleClient
          .from("story_video_replies")
          .select(REPLY_GRAPH_ROW_COLUMNS)
          .in("parent_reply_id", [...parentChunk])
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1),
    });

    if (chunkResult.ok === false) {
      return chunkResult;
    }

    for (const rawRow of chunkResult.rows) {
      const validated = validateGraphRow(rawRow, "child expansion");
      if (validated.ok === false) {
        return { ok: false, blocker: validated.blocker };
      }
      if (
        validated.row.parent_reply_id == null ||
        !requestedChunk.has(validated.row.parent_reply_id)
      ) {
        return {
          ok: false,
          blocker: {
            code: "REPLY_TREE_GRAPH_MALFORMED",
            reason: `Child expansion returned reply ${validated.row.id} with parent ${validated.row.parent_reply_id ?? "NULL"} outside requested parent chunk.`,
          },
        };
      }
      if (!requestedParentIds.has(validated.row.parent_reply_id)) {
        return {
          ok: false,
          blocker: {
            code: "REPLY_TREE_GRAPH_MALFORMED",
            reason: `Child expansion returned reply ${validated.row.id} referencing parent ${validated.row.parent_reply_id} outside loaded parent set.`,
          },
        };
      }
      mergedRows.push(validated.row);
    }
  }

  return { ok: true, rows: mergedRows };
}

async function runGraphClosureExpansion(input: {
  rowsById: Map<string, StoryVideoReplyGraphRow>;
  serviceRoleClient: SupabaseClient;
}): Promise<
  | { ok: true; graphClosureComplete: true; blockers: ReplyTreeSafetyBlocker[] }
  | { ok: false; graphClosureComplete: false; blockers: ReplyTreeSafetyBlocker[] }
> {
  const blockers: ReplyTreeSafetyBlocker[] = [];

  for (let round = 0; round < REPLY_TREE_GRAPH_CLOSURE_ROUND_CAP; round += 1) {
    let expanded = false;

    const missingParentIds = collectMissingParentReplyIds(input.rowsById);
    if (missingParentIds.length > 0) {
      const loaded = await fetchReplyRowsByIds({
        serviceRoleClient: input.serviceRoleClient,
        replyIds: missingParentIds,
      });
      if (loaded.ok === false) {
        return {
          ok: false,
          graphClosureComplete: false,
          blockers: [loaded.blocker],
        };
      }

      for (const row of loaded.rows) {
        const merged = mergeGraphRow({
          rowsById: input.rowsById,
          row,
          context: "parent expansion",
        });
        if (merged.ok === false) {
          return {
            ok: false,
            graphClosureComplete: false,
            blockers: [merged.blocker],
          };
        }
        if (merged.added) {
          expanded = true;
        }
      }
    }

    const parentIds = [...input.rowsById.keys()];
    if (parentIds.length > 0) {
      const loaded = await fetchReplyRowsByParentIds({
        serviceRoleClient: input.serviceRoleClient,
        parentReplyIds: parentIds,
      });
      if (loaded.ok === false) {
        return {
          ok: false,
          graphClosureComplete: false,
          blockers: [loaded.blocker],
        };
      }

      for (const row of loaded.rows) {
        const merged = mergeGraphRow({
          rowsById: input.rowsById,
          row,
          context: "child expansion",
        });
        if (merged.ok === false) {
          return {
            ok: false,
            graphClosureComplete: false,
            blockers: [merged.blocker],
          };
        }
        if (merged.added) {
          expanded = true;
        }
      }
    }

    if (blockers.length > 0) {
      return { ok: false, graphClosureComplete: false, blockers };
    }

    if (!expanded) {
      return { ok: true, graphClosureComplete: true, blockers: [] };
    }
  }

  return {
    ok: false,
    graphClosureComplete: false,
    blockers: [
      {
        code: "REPLY_TREE_GRAPH_CLOSURE_LIMIT_EXCEEDED",
        reason: `Graph closure exceeded ${REPLY_TREE_GRAPH_CLOSURE_ROUND_CAP} expansion rounds without reaching fixed point.`,
      },
    ],
  };
}

function analyzeAncestry(input: {
  replyId: string;
  rowsById: ReadonlyMap<string, StoryVideoReplyGraphRow>;
}): {
  cycleDetected: boolean;
  crossStoryLinkDetected: boolean;
  orphanParentDetected: boolean;
  ancestryComplete: boolean;
  blockers: ReplyTreeSafetyBlocker[];
} {
  const blockers: ReplyTreeSafetyBlocker[] = [];
  let cycleDetected = false;
  let crossStoryLinkDetected = false;
  let orphanParentDetected = false;

  const row = input.rowsById.get(input.replyId);
  if (!row) {
    blockers.push({
      code: "REPLY_TREE_GRAPH_MALFORMED",
      reason: `Target-associated reply ${input.replyId} missing from loaded graph.`,
    });
    return {
      cycleDetected,
      crossStoryLinkDetected,
      orphanParentDetected,
      ancestryComplete: false,
      blockers,
    };
  }

  const visited = new Set<string>();
  let current: StoryVideoReplyGraphRow | undefined = row;
  let steps = 0;

  while (current.parent_reply_id != null) {
    if (current.parent_reply_id === current.id) {
      cycleDetected = true;
      blockers.push({
        code: "REPLY_TREE_CYCLE_DETECTED",
        reason: `Reply ${current.id} is its own parent.`,
      });
      break;
    }

    if (visited.has(current.id)) {
      cycleDetected = true;
      blockers.push({
        code: "REPLY_TREE_CYCLE_DETECTED",
        reason: `Cycle detected in ancestry of reply ${input.replyId}.`,
      });
      break;
    }

    visited.add(current.id);
    steps += 1;

    if (steps > REPLY_TREE_DEPTH_SAFETY_CAP) {
      blockers.push({
        code: "REPLY_TREE_DEPTH_LIMIT_EXCEEDED",
        reason: `Ancestry walk for reply ${input.replyId} exceeded depth cap ${REPLY_TREE_DEPTH_SAFETY_CAP}.`,
      });
      break;
    }

    const parent = input.rowsById.get(current.parent_reply_id);
    if (!parent) {
      orphanParentDetected = true;
      blockers.push({
        code: "REPLY_TREE_ORPHAN_PARENT_DETECTED",
        reason: `Reply ${current.id} references missing parent ${current.parent_reply_id}.`,
      });
      break;
    }

    if (parent.story_id !== current.story_id) {
      crossStoryLinkDetected = true;
      blockers.push({
        code: "REPLY_TREE_CROSS_STORY_LINK_DETECTED",
        reason: `Reply ${current.id} parent ${parent.id} belongs to a different story.`,
      });
      break;
    }

    current = parent;
  }

  const ancestryComplete =
    blockers.length === 0 && current.parent_reply_id == null;

  return {
    cycleDetected,
    crossStoryLinkDetected,
    orphanParentDetected,
    ancestryComplete,
    blockers,
  };
}

function collectDescendants(input: {
  replyId: string;
  ancestorStoryId: string;
  childrenMap: ReadonlyMap<string, readonly string[]>;
  rowsById: ReadonlyMap<string, StoryVideoReplyGraphRow>;
  targetUserId: string;
}): {
  childReplyIds: readonly string[];
  descendantReplyIds: readonly string[];
  maxDescendantDepth: number;
  hasCrossUserDescendant: boolean;
  hasAmbiguousDescendant: boolean;
  cycleDetected: boolean;
  crossStoryLinkDetected: boolean;
  descendantsComplete: boolean;
  blockers: ReplyTreeSafetyBlocker[];
} {
  const blockers: ReplyTreeSafetyBlocker[] = [];
  const descendantIds: string[] = [];
  const queue: Array<{ replyId: string; depth: number }> = [
    { replyId: input.replyId, depth: 0 },
  ];
  const visited = new Set<string>();
  let maxDescendantDepth = 0;
  let hasCrossUserDescendant = false;
  let hasAmbiguousDescendant = false;
  let cycleDetected = false;
  let crossStoryLinkDetected = false;

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth > REPLY_TREE_DEPTH_SAFETY_CAP) {
      blockers.push({
        code: "REPLY_TREE_DEPTH_LIMIT_EXCEEDED",
        reason: `Descendant traversal from reply ${input.replyId} exceeded depth cap ${REPLY_TREE_DEPTH_SAFETY_CAP}.`,
      });
      break;
    }

    if (visited.has(current.replyId)) {
      cycleDetected = true;
      blockers.push({
        code: "REPLY_TREE_CYCLE_DETECTED",
        reason: `Cycle detected in descendant traversal from reply ${input.replyId}.`,
      });
      break;
    }

    visited.add(current.replyId);

    const childIds = input.childrenMap.get(current.replyId) ?? [];
    for (const childId of childIds) {
      const childRow = input.rowsById.get(childId);
      if (!childRow) {
        blockers.push({
          code: "REPLY_TREE_ORPHAN_PARENT_DETECTED",
          reason: `Child reply ${childId} referenced by ${current.replyId} is missing from loaded graph.`,
        });
        continue;
      }

      if (childRow.story_id !== input.ancestorStoryId) {
        crossStoryLinkDetected = true;
        blockers.push({
          code: "REPLY_TREE_CROSS_STORY_LINK_DETECTED",
          reason: `Child reply ${childId} belongs to story ${childRow.story_id}, ancestor ${input.replyId} belongs to ${input.ancestorStoryId}.`,
        });
      }

      descendantIds.push(childId);
      maxDescendantDepth = Math.max(maxDescendantDepth, current.depth + 1);

      const flags = descendantParticipantFlags({
        row: childRow,
        targetUserId: input.targetUserId,
      });
      if (flags.crossUser) {
        hasCrossUserDescendant = true;
      }
      if (flags.ambiguous) {
        hasAmbiguousDescendant = true;
      }

      queue.push({ replyId: childId, depth: current.depth + 1 });
    }
  }

  const directChildIds = [...(input.childrenMap.get(input.replyId) ?? [])].sort();
  const descendantsComplete =
    blockers.length === 0 && !cycleDetected && !crossStoryLinkDetected;

  return {
    childReplyIds: Object.freeze(directChildIds),
    descendantReplyIds: Object.freeze([...new Set(descendantIds)].sort()),
    maxDescendantDepth,
    hasCrossUserDescendant,
    hasAmbiguousDescendant,
    cycleDetected,
    crossStoryLinkDetected,
    descendantsComplete,
    blockers,
  };
}

function buildReplyTreeNodeInventory(input: {
  row: StoryVideoReplyGraphRow;
  targetUserId: string;
  rowsById: ReadonlyMap<string, StoryVideoReplyGraphRow>;
  childrenMap: ReadonlyMap<string, readonly string[]>;
}): ReplyTreeNodeInventory {
  const { row, targetUserId, rowsById, childrenMap } = input;
  const blockers: ReplyTreeSafetyBlocker[] = [];

  const targetParticipantRoles = classifyTargetParticipantRoles({
    userId: row.user_id,
    recipientUserId: row.recipient_user_id,
    targetUserId,
  });

  if (targetParticipantRoles.length === 0) {
    blockers.push({
      code: "REPLY_TREE_NOT_TARGET_ASSOCIATED",
      reason: `Reply ${row.id} is not associated with deletion target ${targetUserId}.`,
    });
  }

  const ambiguousParticipant = replyHasAmbiguousParticipant(row);
  if (row.user_id == null && row.recipient_user_id == null) {
    blockers.push({
      code: "REPLY_TREE_AMBIGUOUS_PARTICIPANTS",
      reason: `Reply ${row.id} has NULL sender and recipient — cannot treat as target-owned.`,
    });
  } else if (ambiguousParticipant) {
    blockers.push({
      code: "REPLY_TREE_AMBIGUOUS_PARTICIPANT",
      reason: `Reply ${row.id} has a NULL participant — cannot treat as conclusively target-only.`,
    });
  }

  const ancestry = analyzeAncestry({ replyId: row.id, rowsById });
  blockers.push(...ancestry.blockers);

  const descendants = collectDescendants({
    replyId: row.id,
    ancestorStoryId: row.story_id,
    childrenMap,
    rowsById,
    targetUserId,
  });
  blockers.push(...descendants.blockers);

  const baseInventory: ReplyTreeNodeInventory = {
    replyId: row.id,
    storyId: row.story_id,
    userId: row.user_id,
    recipientUserId: row.recipient_user_id,
    parentReplyId: row.parent_reply_id,
    targetParticipantRoles,
    childReplyIds: descendants.childReplyIds,
    descendantReplyIds: descendants.descendantReplyIds,
    targetOnlyOrSelf: classifyTargetOnlyOrSelf({
      userId: row.user_id,
      recipientUserId: row.recipient_user_id,
      targetUserId,
    }),
    hasAmbiguousParticipant: ambiguousParticipant,
    hasSurvivingParticipant: hasSurvivingParticipant({
      userId: row.user_id,
      recipientUserId: row.recipient_user_id,
      targetUserId,
    }),
    directChildCount: descendants.childReplyIds.length,
    descendantCount: descendants.descendantReplyIds.length,
    hasCrossUserDescendant: descendants.hasCrossUserDescendant,
    hasAmbiguousDescendant: descendants.hasAmbiguousDescendant,
    ancestryComplete: ancestry.ancestryComplete,
    descendantsComplete: descendants.descendantsComplete,
    cycleDetected: ancestry.cycleDetected || descendants.cycleDetected,
    crossStoryLinkDetected:
      ancestry.crossStoryLinkDetected || descendants.crossStoryLinkDetected,
    orphanParentDetected: ancestry.orphanParentDetected,
    maxDescendantDepth: descendants.maxDescendantDepth,
    blockers,
    fingerprint: "",
  };

  return {
    ...baseInventory,
    fingerprint: computeReplyTreeNodeFingerprint({ inventory: baseInventory }),
  };
}

function findDuplicateIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.add(id);
    }
    seen.add(id);
  }
  return [...duplicates];
}

function buildInventoriesFromLoadedGraph(input: {
  targetUserId: string;
  expectedTargetReplyIds: readonly string[];
  rowsById: ReadonlyMap<string, StoryVideoReplyGraphRow>;
}): {
  inventories: ReplyTreeNodeInventory[];
  batchBlockers: ReplyTreeSafetyBlocker[];
} {
  const childrenMap = buildChildrenMap(input.rowsById);
  const candidateInventories = input.expectedTargetReplyIds.map((replyId) => {
    const row = input.rowsById.get(replyId);
    if (!row) {
      const blocked: ReplyTreeNodeInventory = {
        replyId,
        storyId: "",
        userId: null,
        recipientUserId: null,
        parentReplyId: null,
        targetParticipantRoles: [],
        childReplyIds: [],
        descendantReplyIds: [],
        targetOnlyOrSelf: false,
        hasAmbiguousParticipant: true,
        hasSurvivingParticipant: false,
        directChildCount: 0,
        descendantCount: 0,
        hasCrossUserDescendant: false,
        hasAmbiguousDescendant: false,
        ancestryComplete: false,
        descendantsComplete: false,
        cycleDetected: false,
        crossStoryLinkDetected: false,
        orphanParentDetected: true,
        maxDescendantDepth: 0,
        blockers: [
          {
            code: "REPLY_TREE_ORPHAN_PARENT_DETECTED",
            reason: `Target-associated reply ${replyId} missing from loaded graph.`,
          },
        ],
        fingerprint: "",
      };
      return {
        ...blocked,
        fingerprint: computeReplyTreeNodeFingerprint({ inventory: blocked }),
      };
    }

    return buildReplyTreeNodeInventory({
      row,
      targetUserId: input.targetUserId,
      rowsById: input.rowsById,
      childrenMap,
    });
  });

  const batchBlockers: ReplyTreeSafetyBlocker[] = [];
  for (const inventory of candidateInventories) {
    if (
      inventory.blockers.length > 0 ||
      !inventory.ancestryComplete ||
      !inventory.descendantsComplete ||
      inventory.cycleDetected ||
      inventory.crossStoryLinkDetected ||
      inventory.orphanParentDetected ||
      inventory.hasAmbiguousParticipant
    ) {
      batchBlockers.push({
        code: "REPLY_TREE_INVENTORY_NOT_AUTHORITATIVE",
        reason: `Reply ${inventory.replyId} inventory is incomplete or blocked — entire batch is not execution-authoritative.`,
      });
    }
  }

  return { inventories: candidateInventories, batchBlockers };
}

/**
 * Pure untrusted candidate builder — never registers WeakSet/WeakMap authority.
 * Useful for graph-analysis unit tests only; validateTargetReplyTreeInventoryBatchForPlanning()
 * must reject the returned batch.
 */
export function buildUntrustedTargetReplyTreeInventoryBatchFromLoadedGraph(input: {
  targetUserId: string;
  rows: readonly StoryVideoReplyGraphRow[];
  graphClosureComplete: boolean;
}): TargetReplyTreeInventoryBatch {
  const rowsById = new Map<string, StoryVideoReplyGraphRow>();
  for (const row of input.rows) {
    rowsById.set(row.id, row);
  }

  const expectedTargetReplyIds = [...rowsById.values()]
    .filter(
      (row) =>
        row.user_id === input.targetUserId ||
        row.recipient_user_id === input.targetUserId
    )
    .map((row) => row.id)
    .sort();

  const { inventories, batchBlockers } = buildInventoriesFromLoadedGraph({
    targetUserId: input.targetUserId,
    expectedTargetReplyIds,
    rowsById,
  });

  const ok = batchBlockers.length === 0;
  const graphFingerprint = computeGraphFingerprint({
    targetUserId: input.targetUserId,
    expectedTargetReplyIds,
    rowsById,
    graphClosureComplete: input.graphClosureComplete,
  });

  return buildUntrustedBatch({
    ok,
    targetUserId: input.targetUserId,
    expectedTargetReplyIds,
    inventories,
    blockers: batchBlockers,
    graphClosureComplete: input.graphClosureComplete,
    fingerprint: computeTargetReplyTreeInventoryBatchFingerprint({
      targetUserId: input.targetUserId,
      expectedTargetReplyIds,
      inventories,
      blockers: batchBlockers,
      ok,
      graphClosureComplete: input.graphClosureComplete,
      graphFingerprint,
    }),
  });
}

export type TargetReplyTreeInventoryBatchValidationResult =
  | { ok: true }
  | {
      ok: false;
      blockers: ReplyTreeSafetyBlocker[];
      missingReplyIds: string[];
      extraReplyIds: string[];
      duplicateReplyIds: string[];
    };

export function validateTargetReplyTreeInventoryBatchForPlanning(input: {
  batch: TargetReplyTreeInventoryBatch;
  manifestTargetUserId: string;
}): TargetReplyTreeInventoryBatchValidationResult {
  const blockers: ReplyTreeSafetyBlocker[] = [];
  const { batch, manifestTargetUserId } = input;

  const snapshot = trustedReplyTreeBatchSnapshots.get(batch);
  if (!snapshot) {
    blockers.push({
      code: "REPLY_TREE_INVENTORY_BATCH_UNTRUSTED",
      reason:
        "Reply-tree inventory batch is not a loader-registered trusted instance — cannot plan reply deletion.",
    });
  }

  if (snapshot) {
    if (batch.targetUserId !== snapshot.targetUserId) {
      blockers.push({
        code: "REPLY_TREE_INVENTORY_BATCH_TAMPERED",
        reason:
          "Reply-tree inventory batch targetUserId was mutated after loader registration.",
      });
    }

    if (batch.expectedTargetReplyIds !== snapshot.canonicalExpectedTargetReplyIds) {
      blockers.push({
        code: "REPLY_TREE_INVENTORY_BATCH_TAMPERED",
        reason:
          "Reply-tree inventory batch expectedTargetReplyIds was mutated after loader registration.",
      });
    }

    if (!inventoryRefsMatchSnapshot({ inventories: batch.inventories, snapshot })) {
      blockers.push({
        code: "REPLY_TREE_INVENTORY_BATCH_TAMPERED",
        reason:
          "Reply-tree inventory batch inventories were swapped or mutated after loader registration.",
      });
    }

    if (batch.ok !== snapshot.ok) {
      blockers.push({
        code: "REPLY_TREE_INVENTORY_BATCH_TAMPERED",
        reason:
          "Reply-tree inventory batch ok flag was mutated after loader registration.",
      });
    }

    if (batch.graphClosureComplete !== snapshot.graphClosureComplete) {
      blockers.push({
        code: "REPLY_TREE_INVENTORY_BATCH_TAMPERED",
        reason:
          "Reply-tree inventory batch graphClosureComplete was mutated after loader registration.",
      });
    }
  }

  const canonicalExpectedReplyIds =
    snapshot?.canonicalExpectedTargetReplyIds ?? batch.expectedTargetReplyIds;

  if (batch.targetUserId !== manifestTargetUserId) {
    blockers.push({
      code: "REPLY_TREE_INVENTORY_BATCH_TARGET_MISMATCH",
      reason:
        "Reply-tree inventory batch targetUserId does not match manifest deletion target.",
    });
  }

  if (batch.ok !== true) {
    blockers.push({
      code: "REPLY_TREE_INVENTORY_BATCH_NOT_OK",
      reason:
        "Reply-tree inventory batch is not authoritative — discovery or graph analysis failed.",
    });
  }

  if (batch.graphClosureComplete !== true) {
    blockers.push({
      code: "REPLY_TREE_GRAPH_CLOSURE_INCOMPLETE",
      reason:
        "Reply-tree graph closure is incomplete — inventory cannot authorize planning.",
    });
  }

  blockers.push(...batch.blockers);

  const expectedDuplicates = findDuplicateIds(canonicalExpectedReplyIds);
  if (expectedDuplicates.length > 0) {
    blockers.push({
      code: "REPLY_TREE_INVENTORY_EXPECTED_DUPLICATES",
      reason: `Expected target reply id list contains duplicates: ${expectedDuplicates.join(", ")}`,
    });
  }

  const inventoryReplyIds = batch.inventories.map((entry) => entry.replyId);
  const inventoryDuplicates = findDuplicateIds(inventoryReplyIds);
  if (inventoryDuplicates.length > 0) {
    blockers.push({
      code: "REPLY_TREE_INVENTORY_DUPLICATE_REPLY_IDS",
      reason: `Inventory batch contains duplicate reply ids: ${inventoryDuplicates.join(", ")}`,
    });
  }

  const expectedSet = new Set(canonicalExpectedReplyIds);
  const inventorySet = new Set(inventoryReplyIds);
  const missingReplyIds = canonicalExpectedReplyIds.filter(
    (replyId) => !inventorySet.has(replyId)
  );
  const extraReplyIds = inventoryReplyIds.filter(
    (replyId) => !expectedSet.has(replyId)
  );

  if (missingReplyIds.length > 0) {
    blockers.push({
      code: "REPLY_TREE_INVENTORY_MISSING_COVERAGE",
      reason: `Missing authoritative inventory for reply ids: ${missingReplyIds.join(", ")}`,
    });
  }

  if (extraReplyIds.length > 0) {
    blockers.push({
      code: "REPLY_TREE_INVENTORY_EXTRA_COVERAGE",
      reason: `Unexpected inventory for non-expected reply ids: ${extraReplyIds.join(", ")}`,
    });
  }

  for (const inventory of batch.inventories) {
    if (!authoritativeReplyTreeInventories.has(inventory)) {
      blockers.push({
        code: "REPLY_TREE_INVENTORY_UNTRUSTED",
        reason: `Reply ${inventory.replyId} inventory is not a loader-registered trusted instance.`,
      });
    }

    if (inventory.blockers.length > 0) {
      blockers.push({
        code: "REPLY_TREE_INVENTORY_HAS_BLOCKERS",
        reason: `Reply ${inventory.replyId} inventory has blockers: ${inventory.blockers.map((entry) => entry.code).join(", ")}`,
      });
    }

    if (inventory.hasAmbiguousParticipant) {
      blockers.push({
        code: "REPLY_TREE_AMBIGUOUS_PARTICIPANT",
        reason: `Reply ${inventory.replyId} has ambiguous NULL participant state.`,
      });
    }

    if (!inventory.ancestryComplete) {
      blockers.push({
        code: "REPLY_TREE_ANCESTRY_INCOMPLETE",
        reason: `Reply ${inventory.replyId} ancestry is incomplete.`,
      });
    }

    if (!inventory.descendantsComplete) {
      blockers.push({
        code: "REPLY_TREE_DESCENDANTS_INCOMPLETE",
        reason: `Reply ${inventory.replyId} descendant analysis is incomplete.`,
      });
    }

    if (inventory.cycleDetected) {
      blockers.push({
        code: "REPLY_TREE_CYCLE_DETECTED",
        reason: `Reply ${inventory.replyId} participates in a reply-tree cycle.`,
      });
    }

    if (inventory.crossStoryLinkDetected) {
      blockers.push({
        code: "REPLY_TREE_CROSS_STORY_LINK_DETECTED",
        reason: `Reply ${inventory.replyId} has a cross-story link.`,
      });
    }

    if (inventory.orphanParentDetected) {
      blockers.push({
        code: "REPLY_TREE_ORPHAN_PARENT_DETECTED",
        reason: `Reply ${inventory.replyId} has an orphan parent reference.`,
      });
    }

    const recomputedFingerprint = computeReplyTreeNodeFingerprint({ inventory });
    if (inventory.fingerprint !== recomputedFingerprint) {
      blockers.push({
        code: "REPLY_TREE_INVENTORY_FINGERPRINT_MISMATCH",
        reason: `Reply ${inventory.replyId} fingerprint does not match recomputed inventory state.`,
      });
    }
  }

  const recomputedBatchFingerprint = computeTargetReplyTreeInventoryBatchFingerprint({
    targetUserId: batch.targetUserId,
    expectedTargetReplyIds: canonicalExpectedReplyIds,
    inventories: batch.inventories,
    blockers: batch.blockers,
    ok: batch.ok,
    graphClosureComplete: batch.graphClosureComplete,
    graphFingerprint: snapshot?.canonicalGraphFingerprint ?? "",
  });

  if (batch.fingerprint !== recomputedBatchFingerprint) {
    blockers.push({
      code: "REPLY_TREE_INVENTORY_BATCH_FINGERPRINT_MISMATCH",
      reason:
        "Reply-tree inventory batch fingerprint does not match recomputed batch state.",
    });
  }

  if (blockers.length > 0) {
    return {
      ok: false,
      blockers,
      missingReplyIds,
      extraReplyIds,
      duplicateReplyIds: [...expectedDuplicates, ...inventoryDuplicates],
    };
  }

  return { ok: true };
}

function createReplyTreeInventoryServiceRoleClient():
  | { ok: true; client: SupabaseClient }
  | { ok: false; blocker: ReplyTreeSafetyBlocker } {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      blocker: {
        code: "REPLY_TREE_GRAPH_QUERY_FAILED",
        reason:
          "Reply-tree inventory requires Supabase service role configuration.",
      },
    };
  }

  return {
    ok: true,
    client: createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

async function loadTargetReplyTreeInventoryBatchInternal(
  targetUserId: string,
  serviceRoleClient: SupabaseClient
): Promise<TargetReplyTreeInventoryBatch> {
  const buildFingerprint = (input: {
    expectedTargetReplyIds: readonly string[];
    inventories: readonly ReplyTreeNodeInventory[];
    blockers: readonly ReplyTreeSafetyBlocker[];
    ok: boolean;
    graphClosureComplete: boolean;
    rowsById: ReadonlyMap<string, StoryVideoReplyGraphRow>;
  }) =>
    computeTargetReplyTreeInventoryBatchFingerprint({
      targetUserId,
      expectedTargetReplyIds: input.expectedTargetReplyIds,
      inventories: input.inventories,
      blockers: input.blockers,
      ok: input.ok,
      graphClosureComplete: input.graphClosureComplete,
      graphFingerprint: computeGraphFingerprint({
        targetUserId,
        expectedTargetReplyIds: input.expectedTargetReplyIds,
        rowsById: input.rowsById,
        graphClosureComplete: input.graphClosureComplete,
      }),
    });

  if (!isValidUuid(targetUserId)) {
    return buildUntrustedBatch({
      ok: false,
      targetUserId,
      expectedTargetReplyIds: [],
      inventories: [],
      blockers: [
        {
          code: "REPLY_TREE_GRAPH_MALFORMED",
          reason: "targetUserId is not a valid UUID.",
        },
      ],
      graphClosureComplete: false,
      fingerprint: buildFingerprint({
        expectedTargetReplyIds: [],
        inventories: [],
        blockers: [{ code: "REPLY_TREE_GRAPH_MALFORMED", reason: "" }],
        ok: false,
        graphClosureComplete: false,
        rowsById: new Map(),
      }),
    });
  }

  const listed = await fetchTargetAssociatedReplies({
    serviceRoleClient,
    targetUserId,
  });
  if (listed.ok === false) {
    return buildUntrustedBatch({
      ok: false,
      targetUserId,
      expectedTargetReplyIds: [],
      inventories: [],
      blockers: [listed.blocker],
      graphClosureComplete: false,
      fingerprint: buildFingerprint({
        expectedTargetReplyIds: [],
        inventories: [],
        blockers: [listed.blocker],
        ok: false,
        graphClosureComplete: false,
        rowsById: new Map(),
      }),
    });
  }

  const rowsById = new Map<string, StoryVideoReplyGraphRow>();
  const listBlockers: ReplyTreeSafetyBlocker[] = [];

  for (const rawRow of listed.rows) {
    const validated = validateGraphRow(rawRow, "target reply list");
    if (validated.ok === false) {
      listBlockers.push(validated.blocker);
      continue;
    }

    const associated =
      validated.row.user_id === targetUserId ||
      validated.row.recipient_user_id === targetUserId;

    if (!associated) {
      listBlockers.push({
        code: "REPLY_TREE_GRAPH_MALFORMED",
        reason: `Target reply list returned unrelated reply ${validated.row.id}.`,
      });
      continue;
    }

    const merged = mergeGraphRow({
      rowsById,
      row: validated.row,
      context: "target reply list",
    });
    if (merged.ok === false) {
      listBlockers.push(merged.blocker);
      continue;
    }
  }

  const canonicalExpectedTargetReplyIds = [...rowsById.keys()].sort();

  if (listBlockers.length > 0) {
    return buildUntrustedBatch({
      ok: false,
      targetUserId,
      expectedTargetReplyIds: canonicalExpectedTargetReplyIds,
      inventories: [],
      blockers: listBlockers,
      graphClosureComplete: false,
      fingerprint: buildFingerprint({
        expectedTargetReplyIds: canonicalExpectedTargetReplyIds,
        inventories: [],
        blockers: listBlockers,
        ok: false,
        graphClosureComplete: false,
        rowsById,
      }),
    });
  }

  if (canonicalExpectedTargetReplyIds.length === 0) {
    const emptyBatch = {
      ok: true,
      targetUserId,
      expectedTargetReplyIds: canonicalExpectedTargetReplyIds,
      inventories: [] as ReplyTreeNodeInventory[],
      blockers: [] as ReplyTreeSafetyBlocker[],
      graphClosureComplete: true,
    };

    const fingerprint = buildFingerprint({
      expectedTargetReplyIds: canonicalExpectedTargetReplyIds,
      inventories: [],
      blockers: [],
      ok: true,
      graphClosureComplete: true,
      rowsById,
    });

    const batch = buildUntrustedBatch({
      ...emptyBatch,
      fingerprint,
    });

    return registerAuthoritativeReplyTreeBatch({
      batch,
      canonicalExpectedTargetReplyIds,
      canonicalGraphFingerprint: computeGraphFingerprint({
        targetUserId,
        expectedTargetReplyIds: canonicalExpectedTargetReplyIds,
        rowsById,
        graphClosureComplete: true,
      }),
      inventories: [],
    });
  }

  const closure = await runGraphClosureExpansion({ rowsById, serviceRoleClient });
  if (!closure.ok) {
    return buildUntrustedBatch({
      ok: false,
      targetUserId,
      expectedTargetReplyIds: canonicalExpectedTargetReplyIds,
      inventories: [],
      blockers: closure.blockers,
      graphClosureComplete: false,
      fingerprint: buildFingerprint({
        expectedTargetReplyIds: canonicalExpectedTargetReplyIds,
        inventories: [],
        blockers: closure.blockers,
        ok: false,
        graphClosureComplete: false,
        rowsById,
      }),
    });
  }

  const { inventories: candidateInventories, batchBlockers } =
    buildInventoriesFromLoadedGraph({
      targetUserId,
      expectedTargetReplyIds: canonicalExpectedTargetReplyIds,
      rowsById,
    });

  const ok = batchBlockers.length === 0;
  const graphFingerprint = computeGraphFingerprint({
    targetUserId,
    expectedTargetReplyIds: canonicalExpectedTargetReplyIds,
    rowsById,
    graphClosureComplete: true,
  });

  const batchCandidate = buildUntrustedBatch({
    ok,
    targetUserId,
    expectedTargetReplyIds: canonicalExpectedTargetReplyIds,
    inventories: candidateInventories,
    blockers: batchBlockers,
    graphClosureComplete: true,
    fingerprint: buildFingerprint({
      expectedTargetReplyIds: canonicalExpectedTargetReplyIds,
      inventories: candidateInventories,
      blockers: batchBlockers,
      ok,
      graphClosureComplete: true,
      rowsById,
    }),
  });

  if (!ok) {
    return batchCandidate;
  }

  return registerAuthoritativeReplyTreeBatch({
    batch: batchCandidate,
    canonicalExpectedTargetReplyIds,
    canonicalGraphFingerprint: graphFingerprint,
    inventories: candidateInventories,
  });
}

/**
 * Production authoritative loader — obtains service-role client internally.
 * targetUserId must come from trusted server orchestration (manifest/request context).
 */
export async function loadTargetReplyTreeInventoryBatch(
  targetUserId: string
): Promise<TargetReplyTreeInventoryBatch> {
  const clientResult = createReplyTreeInventoryServiceRoleClient();
  if (clientResult.ok === false) {
    return buildUntrustedBatch({
      ok: false,
      targetUserId,
      expectedTargetReplyIds: [],
      inventories: [],
      blockers: [clientResult.blocker],
      graphClosureComplete: false,
      fingerprint: computeTargetReplyTreeInventoryBatchFingerprint({
        targetUserId,
        expectedTargetReplyIds: [],
        inventories: [],
        blockers: [clientResult.blocker],
        ok: false,
        graphClosureComplete: false,
        graphFingerprint: "",
      }),
    });
  }

  return loadTargetReplyTreeInventoryBatchInternal(
    targetUserId,
    clientResult.client
  );
}
