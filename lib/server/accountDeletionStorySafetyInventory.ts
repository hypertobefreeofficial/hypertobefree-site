/**
 * Authoritative read-only per-story deletion safety inventory (Phase 4C.7B.1E.2B.1).
 * Server-only SELECT queries — no mutations.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyStoryLifecycle,
  storySafetyInventoryToPlanningInput,
  type StoryAuthorClassificationCounts,
  type StoryDeletionChildInventory,
  type StoryDeletionDependencyInventory,
  type StoryDeletionSafetyBlocker,
  type StoryDeletionSafetyInventory,
  type StoryEngagementClassificationCounts,
  type StoryRowLifecycleInput,
  type StoryVideoReplyClassificationCounts,
} from "./accountDeletionStoryLifecycle";

export const STORY_SAFETY_INVENTORY_FINGERPRINT_NOTE =
  "Fingerprint is a drift hint only — future execution must rebuild authoritative inventory after write-freeze; fingerprint comparison alone can never authorize deletion." as const;

export type TargetStorySafetyInventoryBatch = {
  ok: boolean;
  targetUserId: string;
  expectedStoryIds: readonly string[];
  inventories: readonly StoryDeletionSafetyInventory[];
  blockers: readonly StoryDeletionSafetyBlocker[];
  fingerprint: string;
};

type TrustedBatchSnapshot = {
  targetUserId: string;
  canonicalExpectedStoryIds: readonly string[];
  canonicalInventoryRefs: readonly StoryDeletionSafetyInventory[];
  ok: boolean;
};

/** Loader-registered inventory instances — not exported; cannot be forged externally. */
const authoritativeInventories = new WeakSet<StoryDeletionSafetyInventory>();

/** Loader-registered batch snapshots — not exported; cannot be forged externally. */
const trustedBatchSnapshots = new WeakMap<
  TargetStorySafetyInventoryBatch,
  TrustedBatchSnapshot
>();

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

function registerAuthoritativeInventory(
  inventory: StoryDeletionSafetyInventory
): StoryDeletionSafetyInventory {
  const registered = deepFreeze({
    ...inventory,
    blockers: Object.freeze([...inventory.blockers]),
  });
  authoritativeInventories.add(registered);
  return registered;
}

function registerAuthoritativeBatch(
  batch: {
    ok: boolean;
    targetUserId: string;
    inventories: readonly StoryDeletionSafetyInventory[];
    blockers: readonly StoryDeletionSafetyBlocker[];
    fingerprint: string;
  },
  canonicalExpectedStoryIds: readonly string[]
): TargetStorySafetyInventoryBatch {
  const frozenExpectedStoryIds = Object.freeze([
    ...canonicalExpectedStoryIds,
  ]) as readonly string[];
  const frozenInventories = Object.freeze([
    ...batch.inventories,
  ]) as readonly StoryDeletionSafetyInventory[];
  const frozenBlockers = Object.freeze([
    ...batch.blockers,
  ]) as readonly StoryDeletionSafetyBlocker[];

  const registered = Object.freeze({
    ok: batch.ok,
    targetUserId: batch.targetUserId,
    expectedStoryIds: frozenExpectedStoryIds,
    inventories: frozenInventories,
    blockers: frozenBlockers,
    fingerprint: batch.fingerprint,
  }) as TargetStorySafetyInventoryBatch;

  const snapshot = Object.freeze({
    targetUserId: batch.targetUserId,
    canonicalExpectedStoryIds: frozenExpectedStoryIds,
    canonicalInventoryRefs: frozenInventories,
    ok: batch.ok,
  }) satisfies TrustedBatchSnapshot;

  trustedBatchSnapshots.set(registered, snapshot);
  return registered;
}

function inventoryRefsMatchSnapshot(input: {
  inventories: readonly StoryDeletionSafetyInventory[];
  snapshot: TrustedBatchSnapshot;
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

export type TargetStorySafetyInventoryBatchValidationResult =
  | { ok: true; planningInputs: StoryRowLifecycleInput[] }
  | {
      ok: false;
      blockers: StoryDeletionSafetyBlocker[];
      missingStoryIds: string[];
      extraStoryIds: string[];
      duplicateStoryIds: string[];
    };

/** Tables with FK story_id → stories.id discovered in Production baseline. */
export const STORY_LINKED_DEPENDENCY_TABLES = [
  "prayer_video_responses",
  "prayer_written_responses",
  "prayer_updates",
  "story_video_replies",
  "story_reactions",
  "saved_content",
  "prayer_follows",
  "content_reports",
] as const;

type StoryOwnershipRow = {
  id: string;
  user_id: string | null;
  status: string | null;
  removed_at: string | null;
};

type QueryResult<T> =
  | { ok: true; rows: T[] }
  | { ok: false; error: true };

export type StorySafetyInventoryQueryDeps = {
  loadStoryOwnership: (
    storyId: string
  ) => Promise<
    | { ok: true; row: StoryOwnershipRow }
    | { ok: false; reason: "not_found" | "query_error" }
  >;
  loadPrayerVideoResponses: (
    storyId: string
  ) => Promise<QueryResult<{ user_id: string | null }>>;
  loadPrayerWrittenResponses: (
    storyId: string
  ) => Promise<QueryResult<{ author_user_id: string | null }>>;
  loadPrayerUpdates: (
    storyId: string
  ) => Promise<QueryResult<{ author_user_id: string | null }>>;
  loadStoryVideoReplies: (
    storyId: string
  ) => Promise<
    QueryResult<{ user_id: string | null; recipient_user_id: string | null }>
  >;
  loadContentReports: (storyId: string) => Promise<QueryResult<{ id: string }>>;
  loadStoryReactions: (
    storyId: string
  ) => Promise<QueryResult<{ user_id: string | null }>>;
  loadSavedContent: (
    storyId: string
  ) => Promise<QueryResult<{ user_id: string | null }>>;
  loadPrayerFollows: (
    storyId: string
  ) => Promise<QueryResult<{ user_id: string | null }>>;
  listTargetOwnedStoryIds: (
    targetUserId: string
  ) => Promise<{ ok: true; storyIds: string[] } | { ok: false }>;
};

function emptyAuthorClassification(
  querySucceeded: boolean
): StoryAuthorClassificationCounts {
  return {
    total: 0,
    targetAuthored: 0,
    thirdPartyAuthored: 0,
    nullAuthor: 0,
    querySucceeded,
  };
}

function emptyReplyClassification(
  querySucceeded: boolean
): StoryVideoReplyClassificationCounts {
  return {
    total: 0,
    targetOnly: 0,
    crossUser: 0,
    ambiguousParticipant: 0,
    querySucceeded,
  };
}

function emptyEngagementClassification(
  querySucceeded: boolean
): StoryEngagementClassificationCounts {
  return {
    total: 0,
    targetOwned: 0,
    thirdPartyOwned: 0,
    nullOwner: 0,
    querySucceeded,
  };
}

function emptyDependencies(querySucceeded: boolean): StoryDeletionDependencyInventory {
  return {
    prayerVideoResponses: emptyAuthorClassification(querySucceeded),
    prayerWrittenResponses: emptyAuthorClassification(querySucceeded),
    prayerUpdates: emptyAuthorClassification(querySucceeded),
    storyVideoReplies: emptyReplyClassification(querySucceeded),
    contentReports: { total: 0, querySucceeded },
    storyReactions: emptyEngagementClassification(querySucceeded),
    savedContent: emptyEngagementClassification(querySucceeded),
    prayerFollows: emptyEngagementClassification(querySucceeded),
  };
}

function classifyAuthorRows(
  rows: readonly { authorId: string | null }[],
  targetUserId: string,
  querySucceeded: boolean
): StoryAuthorClassificationCounts {
  if (!querySucceeded) {
    return emptyAuthorClassification(false);
  }

  let targetAuthored = 0;
  let thirdPartyAuthored = 0;
  let nullAuthor = 0;

  for (const row of rows) {
    if (row.authorId == null) {
      nullAuthor += 1;
    } else if (row.authorId === targetUserId) {
      targetAuthored += 1;
    } else {
      thirdPartyAuthored += 1;
    }
  }

  return {
    total: rows.length,
    targetAuthored,
    thirdPartyAuthored,
    nullAuthor,
    querySucceeded: true,
  };
}

function classifyEngagementRows(
  rows: readonly { ownerId: string | null }[],
  targetUserId: string,
  querySucceeded: boolean
): StoryEngagementClassificationCounts {
  if (!querySucceeded) {
    return emptyEngagementClassification(false);
  }

  let targetOwned = 0;
  let thirdPartyOwned = 0;
  let nullOwner = 0;

  for (const row of rows) {
    if (row.ownerId == null) {
      nullOwner += 1;
    } else if (row.ownerId === targetUserId) {
      targetOwned += 1;
    } else {
      thirdPartyOwned += 1;
    }
  }

  return {
    total: rows.length,
    targetOwned,
    thirdPartyOwned,
    nullOwner,
    querySucceeded: true,
  };
}

function classifyStoryVideoReplies(
  rows: readonly {
    user_id: string | null;
    recipient_user_id: string | null;
  }[],
  targetUserId: string,
  querySucceeded: boolean
): StoryVideoReplyClassificationCounts {
  if (!querySucceeded) {
    return emptyReplyClassification(false);
  }

  let targetOnly = 0;
  let crossUser = 0;
  let ambiguousParticipant = 0;

  for (const row of rows) {
    const sender = row.user_id;
    const recipient = row.recipient_user_id;

    if (sender == null || recipient == null) {
      ambiguousParticipant += 1;
      continue;
    }

    const senderIsTarget = sender === targetUserId;
    const recipientIsTarget = recipient === targetUserId;

    if (senderIsTarget && recipientIsTarget) {
      targetOnly += 1;
      continue;
    }

    if (!senderIsTarget || !recipientIsTarget) {
      crossUser += 1;
    }
  }

  return {
    total: rows.length,
    targetOnly,
    crossUser,
    ambiguousParticipant,
    querySucceeded: true,
  };
}

export function buildChildInventoryFromDependencies(input: {
  targetUserId: string;
  dependencies: StoryDeletionDependencyInventory;
  queriesComplete: boolean;
  ownershipVerified: boolean;
}): StoryDeletionChildInventory {
  const { dependencies: deps } = input;
  const inventoryComplete = input.queriesComplete && input.ownershipVerified;

  return {
    inventoryComplete,
    prayerVideoResponseCount: deps.prayerVideoResponses.total,
    prayerWrittenResponseCount: deps.prayerWrittenResponses.total,
    storyVideoReplyCount: deps.storyVideoReplies.total,
    contentReportCount: deps.contentReports.total,
    prayerUpdateCount: deps.prayerUpdates.total,
    reactionCount: deps.storyReactions.total,
    followCount: deps.prayerFollows.total,
    savedContentCount: deps.savedContent.total,
    reportEvidencePreservedBeforeStoryDelete: deps.contentReports.total === 0,
    thirdPartyPrayerVideoResponseCount: deps.prayerVideoResponses.thirdPartyAuthored,
    thirdPartyPrayerWrittenResponseCount:
      deps.prayerWrittenResponses.thirdPartyAuthored,
    thirdPartyPrayerUpdateCount: deps.prayerUpdates.thirdPartyAuthored,
    crossUserStoryVideoReplyCount: deps.storyVideoReplies.crossUser,
    ambiguousStoryVideoReplyCount: deps.storyVideoReplies.ambiguousParticipant,
    nullAuthorPrayerVideoResponseCount: deps.prayerVideoResponses.nullAuthor,
    nullAuthorPrayerWrittenResponseCount: deps.prayerWrittenResponses.nullAuthor,
    nullAuthorPrayerUpdateCount: deps.prayerUpdates.nullAuthor,
    thirdPartyReactionCount: deps.storyReactions.thirdPartyOwned,
    thirdPartySavedContentCount: deps.savedContent.thirdPartyOwned,
    thirdPartyFollowCount: deps.prayerFollows.thirdPartyOwned,
    nullOwnerReactionCount: deps.storyReactions.nullOwner,
    nullOwnerSavedContentCount: deps.savedContent.nullOwner,
    nullOwnerFollowCount: deps.prayerFollows.nullOwner,
  };
}

export function computeStorySafetyInventoryFingerprint(input: {
  inventory: StoryDeletionSafetyInventory;
  dependencyRowSignatures?: string;
}): string {
  const inv = input.inventory;
  const d = inv.dependencies;
  const child = inv.childInventory;
  const blockerCodes = inv.blockers
    .map((entry) => entry.code)
    .sort()
    .join(",");

  return [
    "sv2",
    inv.storyId,
    inv.targetUserId,
    inv.status ?? "",
    inv.removedAt ?? "",
    inv.lifecycle,
    inv.ownershipVerified ? "1" : "0",
    inv.queriesComplete ? "1" : "0",
    child.inventoryComplete ? "1" : "0",
    blockerCodes,
    d.prayerVideoResponses.total,
    d.prayerVideoResponses.targetAuthored,
    d.prayerVideoResponses.thirdPartyAuthored,
    d.prayerVideoResponses.nullAuthor,
    d.prayerWrittenResponses.total,
    d.prayerWrittenResponses.targetAuthored,
    d.prayerWrittenResponses.thirdPartyAuthored,
    d.prayerWrittenResponses.nullAuthor,
    d.prayerUpdates.total,
    d.prayerUpdates.targetAuthored,
    d.prayerUpdates.thirdPartyAuthored,
    d.prayerUpdates.nullAuthor,
    d.storyVideoReplies.total,
    d.storyVideoReplies.targetOnly,
    d.storyVideoReplies.crossUser,
    d.storyVideoReplies.ambiguousParticipant,
    d.contentReports.total,
    d.storyReactions.total,
    d.storyReactions.targetOwned,
    d.storyReactions.thirdPartyOwned,
    d.storyReactions.nullOwner,
    d.savedContent.total,
    d.savedContent.targetOwned,
    d.savedContent.thirdPartyOwned,
    d.savedContent.nullOwner,
    d.prayerFollows.total,
    d.prayerFollows.targetOwned,
    d.prayerFollows.thirdPartyOwned,
    d.prayerFollows.nullOwner,
    input.dependencyRowSignatures ?? "",
  ].join(":");
}

export function computeTargetStorySafetyInventoryBatchFingerprint(input: {
  targetUserId: string;
  expectedStoryIds: readonly string[];
  inventories: readonly StoryDeletionSafetyInventory[];
  blockers: readonly StoryDeletionSafetyBlocker[];
  ok: boolean;
}): string {
  const inventoryFingerprints = input.inventories
    .map((entry) => entry.fingerprint)
    .sort()
    .join("|");
  const blockerCodes = input.blockers
    .map((entry) => entry.code)
    .sort()
    .join(",");
  const expectedIds = [...input.expectedStoryIds].sort().join(",");

  return [
    "sb2",
    input.targetUserId,
    input.ok ? "1" : "0",
    expectedIds,
    inventoryFingerprints,
    blockerCodes,
  ].join(":");
}

function ownershipBlockers(
  ownership:
    | { ok: true; row: StoryOwnershipRow }
    | { ok: false; reason: "not_found" | "query_error" },
  targetUserId: string
): StoryDeletionSafetyBlocker[] {
  if (ownership.ok === false) {
    if (ownership.reason === "not_found") {
      return [
        {
          code: "STORY_NOT_FOUND",
          reason: "Story row not found — cannot verify ownership.",
        },
      ];
    }
    return [
      {
        code: "STORY_OWNERSHIP_QUERY_FAILED",
        reason: "Story ownership query failed — inventory blocked.",
      },
    ];
  }

  if (ownership.row.user_id == null) {
    return [
      {
        code: "STORY_NULL_OWNER",
        reason: "Story user_id is NULL — ownership cannot be verified.",
      },
    ];
  }

  if (ownership.row.user_id !== targetUserId) {
    return [
      {
        code: "STORY_OWNERSHIP_MISMATCH",
        reason: "Story is not owned by the deletion target.",
      },
    ];
  }

  return [];
}

function dependencyQueryBlockers(
  dependencies: StoryDeletionDependencyInventory
): StoryDeletionSafetyBlocker[] {
  const blockers: StoryDeletionSafetyBlocker[] = [];
  const checks: Array<[string, boolean]> = [
    ["prayer_video_responses", dependencies.prayerVideoResponses.querySucceeded],
    [
      "prayer_written_responses",
      dependencies.prayerWrittenResponses.querySucceeded,
    ],
    ["prayer_updates", dependencies.prayerUpdates.querySucceeded],
    ["story_video_replies", dependencies.storyVideoReplies.querySucceeded],
    ["content_reports", dependencies.contentReports.querySucceeded],
    ["story_reactions", dependencies.storyReactions.querySucceeded],
    ["saved_content", dependencies.savedContent.querySucceeded],
    ["prayer_follows", dependencies.prayerFollows.querySucceeded],
  ];

  for (const [table, succeeded] of checks) {
    if (!succeeded) {
      blockers.push({
        code: "STORY_CHILD_QUERY_FAILED",
        reason: `${table} inventory query failed — cannot authorize deletion.`,
      });
    }
  }

  return blockers;
}

function buildBlockedInventory(input: {
  storyId: string;
  targetUserId: string;
  status: string | null;
  removedAt: string | null;
  ownershipVerified: boolean;
  dependencies: StoryDeletionDependencyInventory;
  blockers: StoryDeletionSafetyBlocker[];
}): StoryDeletionSafetyInventory {
  const lifecycle = classifyStoryLifecycle({
    status: input.status,
    removedAt: input.removedAt,
  });
  const queriesComplete =
    input.ownershipVerified &&
    dependencyQueryBlockers(input.dependencies).length === 0;

  const childInventory = buildChildInventoryFromDependencies({
    targetUserId: input.targetUserId,
    dependencies: input.dependencies,
    queriesComplete,
    ownershipVerified: input.ownershipVerified,
  });

  const baseInventory: StoryDeletionSafetyInventory = {
    storyId: input.storyId,
    targetUserId: input.targetUserId,
    ownershipVerified: input.ownershipVerified,
    status: input.status,
    removedAt: input.removedAt,
    lifecycle,
    queriesComplete,
    blockers: input.blockers,
    dependencies: input.dependencies,
    fingerprint: "",
    childInventory,
  };

  const fingerprint = computeStorySafetyInventoryFingerprint({
    inventory: baseInventory,
  });

  return registerAuthoritativeInventory({
    ...baseInventory,
    fingerprint,
  });
}

export async function loadStoryDeletionSafetyInventory(
  storyId: string,
  targetUserId: string,
  deps: StorySafetyInventoryQueryDeps
): Promise<StoryDeletionSafetyInventory> {
  const ownership = await deps.loadStoryOwnership(storyId);
  const ownershipBlockerList = ownershipBlockers(ownership, targetUserId);
  const ownershipVerified = ownershipBlockerList.length === 0;

  if (!ownershipVerified || ownership.ok === false) {
    const status = ownership.ok ? ownership.row.status : null;
    const removedAt = ownership.ok ? ownership.row.removed_at : null;
    return buildBlockedInventory({
      storyId,
      targetUserId,
      status,
      removedAt,
      ownershipVerified: false,
      dependencies: emptyDependencies(false),
      blockers: ownershipBlockerList,
    });
  }

  const row = ownership.row;

  const [
    prayerVideo,
    prayerWritten,
    prayerUpdates,
    storyReplies,
    contentReports,
    reactions,
    savedContent,
    follows,
  ] = await Promise.all([
    deps.loadPrayerVideoResponses(storyId),
    deps.loadPrayerWrittenResponses(storyId),
    deps.loadPrayerUpdates(storyId),
    deps.loadStoryVideoReplies(storyId),
    deps.loadContentReports(storyId),
    deps.loadStoryReactions(storyId),
    deps.loadSavedContent(storyId),
    deps.loadPrayerFollows(storyId),
  ]);

  const dependencies: StoryDeletionDependencyInventory = {
    prayerVideoResponses: classifyAuthorRows(
      prayerVideo.ok
        ? prayerVideo.rows.map((entry) => ({ authorId: entry.user_id }))
        : [],
      targetUserId,
      prayerVideo.ok
    ),
    prayerWrittenResponses: classifyAuthorRows(
      prayerWritten.ok
        ? prayerWritten.rows.map((entry) => ({
            authorId: entry.author_user_id,
          }))
        : [],
      targetUserId,
      prayerWritten.ok
    ),
    prayerUpdates: classifyAuthorRows(
      prayerUpdates.ok
        ? prayerUpdates.rows.map((entry) => ({ authorId: entry.author_user_id }))
        : [],
      targetUserId,
      prayerUpdates.ok
    ),
    storyVideoReplies: classifyStoryVideoReplies(
      storyReplies.ok ? storyReplies.rows : [],
      targetUserId,
      storyReplies.ok
    ),
    contentReports: {
      total: contentReports.ok ? contentReports.rows.length : 0,
      querySucceeded: contentReports.ok,
    },
    storyReactions: classifyEngagementRows(
      reactions.ok
        ? reactions.rows.map((entry) => ({ ownerId: entry.user_id }))
        : [],
      targetUserId,
      reactions.ok
    ),
    savedContent: classifyEngagementRows(
      savedContent.ok
        ? savedContent.rows.map((entry) => ({ ownerId: entry.user_id }))
        : [],
      targetUserId,
      savedContent.ok
    ),
    prayerFollows: classifyEngagementRows(
      follows.ok
        ? follows.rows.map((entry) => ({ ownerId: entry.user_id }))
        : [],
      targetUserId,
      follows.ok
    ),
  };

  const blockers = [
    ...dependencyQueryBlockers(dependencies),
    ...(dependencies.contentReports.total > 0
      ? [
          {
            code: "STORY_REPORT_DETACH_REQUIRED",
            reason:
              "content_reports reference this story — parent HARD_DELETE requires explicit story_id detach before deletion.",
          },
        ]
      : []),
  ];

  return buildBlockedInventory({
    storyId,
    targetUserId,
    status: row.status,
    removedAt: row.removed_at,
    ownershipVerified: true,
    dependencies,
    blockers,
  });
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

export function validateTargetStorySafetyInventoryBatchForPlanning(input: {
  batch: TargetStorySafetyInventoryBatch;
  manifestTargetUserId: string;
}): TargetStorySafetyInventoryBatchValidationResult {
  const blockers: StoryDeletionSafetyBlocker[] = [];
  const { batch, manifestTargetUserId } = input;

  const snapshot = trustedBatchSnapshots.get(batch);
  if (!snapshot) {
    blockers.push({
      code: "STORY_INVENTORY_BATCH_UNTRUSTED",
      reason:
        "Story safety inventory batch is not a loader-registered trusted instance — cannot plan HARD_DELETE.",
    });
  }

  if (snapshot) {
    if (batch.targetUserId !== snapshot.targetUserId) {
      blockers.push({
        code: "STORY_INVENTORY_BATCH_TAMPERED",
        reason:
          "Story safety inventory batch targetUserId was mutated after loader registration.",
      });
    }

    if (batch.expectedStoryIds !== snapshot.canonicalExpectedStoryIds) {
      blockers.push({
        code: "STORY_INVENTORY_BATCH_TAMPERED",
        reason:
          "Story safety inventory batch expectedStoryIds was mutated after loader registration.",
      });
    }

    if (!inventoryRefsMatchSnapshot({ inventories: batch.inventories, snapshot })) {
      blockers.push({
        code: "STORY_INVENTORY_BATCH_TAMPERED",
        reason:
          "Story safety inventory batch inventories were swapped or mutated after loader registration.",
      });
    }

    if (batch.ok !== snapshot.ok) {
      blockers.push({
        code: "STORY_INVENTORY_BATCH_TAMPERED",
        reason:
          "Story safety inventory batch ok flag was mutated after loader registration.",
      });
    }
  }

  const canonicalExpectedStoryIds =
    snapshot?.canonicalExpectedStoryIds ?? batch.expectedStoryIds;

  if (batch.targetUserId !== manifestTargetUserId) {
    blockers.push({
      code: "STORY_INVENTORY_BATCH_TARGET_MISMATCH",
      reason:
        "Story safety inventory batch targetUserId does not match manifest deletion target.",
    });
  }

  if (batch.ok !== true) {
    blockers.push({
      code: "STORY_INVENTORY_BATCH_NOT_OK",
      reason:
        "Story safety inventory batch is not authoritative — list or per-story inventory failed.",
    });
  }

  blockers.push(...batch.blockers);

  const expectedDuplicates = findDuplicateIds(canonicalExpectedStoryIds);
  if (expectedDuplicates.length > 0) {
    blockers.push({
      code: "STORY_INVENTORY_EXPECTED_DUPLICATES",
      reason: `Expected story id list contains duplicates: ${expectedDuplicates.join(", ")}`,
    });
  }

  const inventoryStoryIds = batch.inventories.map((entry) => entry.storyId);
  const inventoryDuplicates = findDuplicateIds(inventoryStoryIds);
  if (inventoryDuplicates.length > 0) {
    blockers.push({
      code: "STORY_INVENTORY_DUPLICATE_STORY_IDS",
      reason: `Inventory batch contains duplicate story ids: ${inventoryDuplicates.join(", ")}`,
    });
  }

  const expectedSet = new Set(canonicalExpectedStoryIds);
  const inventorySet = new Set(inventoryStoryIds);
  const missingStoryIds = canonicalExpectedStoryIds.filter(
    (storyId) => !inventorySet.has(storyId)
  );
  const extraStoryIds = inventoryStoryIds.filter(
    (storyId) => !expectedSet.has(storyId)
  );

  if (missingStoryIds.length > 0) {
    blockers.push({
      code: "STORY_INVENTORY_MISSING_COVERAGE",
      reason: `Missing authoritative inventory for story ids: ${missingStoryIds.join(", ")}`,
    });
  }

  if (extraStoryIds.length > 0) {
    blockers.push({
      code: "STORY_INVENTORY_EXTRA_COVERAGE",
      reason: `Unexpected inventory for non-expected story ids: ${extraStoryIds.join(", ")}`,
    });
  }

  for (const inventory of batch.inventories) {
    if (!authoritativeInventories.has(inventory)) {
      blockers.push({
        code: "STORY_INVENTORY_UNTRUSTED",
        reason: `Story ${inventory.storyId} inventory is not a loader-registered trusted instance.`,
      });
    }

    if (inventory.targetUserId !== manifestTargetUserId) {
      blockers.push({
        code: "STORY_INVENTORY_TARGET_MISMATCH",
        reason: `Story ${inventory.storyId} inventory targetUserId mismatch.`,
      });
    }

    if (!inventory.ownershipVerified) {
      blockers.push({
        code: "STORY_INVENTORY_OWNERSHIP_UNVERIFIED",
        reason: `Story ${inventory.storyId} ownership is not verified.`,
      });
    }

    if (!inventory.queriesComplete) {
      blockers.push({
        code: "STORY_INVENTORY_QUERIES_INCOMPLETE",
        reason: `Story ${inventory.storyId} dependency queries are incomplete.`,
      });
    }

    if (inventory.blockers.length > 0) {
      blockers.push({
        code: "STORY_INVENTORY_HAS_BLOCKERS",
        reason: `Story ${inventory.storyId} inventory has blockers: ${inventory.blockers.map((entry) => entry.code).join(", ")}`,
      });
    }

    if (!inventory.childInventory.inventoryComplete) {
      blockers.push({
        code: "STORY_INVENTORY_CHILD_INCOMPLETE",
        reason: `Story ${inventory.storyId} child inventory is incomplete.`,
      });
    }

    const expectedLifecycle = classifyStoryLifecycle({
      status: inventory.status,
      removedAt: inventory.removedAt,
    });
    if (inventory.lifecycle !== expectedLifecycle) {
      blockers.push({
        code: "STORY_INVENTORY_LIFECYCLE_MISMATCH",
        reason: `Story ${inventory.storyId} lifecycle field does not match status/removed_at classifier.`,
      });
    }

    const recomputedFingerprint = computeStorySafetyInventoryFingerprint({
      inventory,
    });
    if (inventory.fingerprint !== recomputedFingerprint) {
      blockers.push({
        code: "STORY_INVENTORY_FINGERPRINT_MISMATCH",
        reason: `Story ${inventory.storyId} fingerprint does not match recomputed inventory state.`,
      });
    }
  }

  if (blockers.length > 0) {
    return {
      ok: false,
      blockers,
      missingStoryIds,
      extraStoryIds,
      duplicateStoryIds: [...expectedDuplicates, ...inventoryDuplicates],
    };
  }

  return {
    ok: true,
    planningInputs: batch.inventories.map(storySafetyInventoryToPlanningInput),
  };
}

export async function loadTargetOwnedStorySafetyInventories(
  targetUserId: string,
  deps: StorySafetyInventoryQueryDeps
): Promise<TargetStorySafetyInventoryBatch> {
  const listed = await deps.listTargetOwnedStoryIds(targetUserId);
  if (listed.ok === false) {
    return registerAuthoritativeBatch(
      {
        ok: false,
        targetUserId,
        inventories: [],
        blockers: [
          {
            code: "TARGET_STORY_LIST_QUERY_FAILED",
            reason:
              "Target-owned story list query failed — inventory batch is not authoritative.",
          },
        ],
        fingerprint: computeTargetStorySafetyInventoryBatchFingerprint({
          targetUserId,
          expectedStoryIds: [],
          inventories: [],
          blockers: [{ code: "TARGET_STORY_LIST_QUERY_FAILED", reason: "" }],
          ok: false,
        }),
      },
      []
    );
  }

  const canonicalExpectedStoryIds = listed.storyIds;
  const inventories = await Promise.all(
    canonicalExpectedStoryIds.map((storyId) =>
      loadStoryDeletionSafetyInventory(storyId, targetUserId, deps)
    )
  );

  const batchBlockers: StoryDeletionSafetyBlocker[] = [];
  for (const inventory of inventories) {
    if (
      !inventory.ownershipVerified ||
      !inventory.queriesComplete ||
      inventory.blockers.length > 0 ||
      !inventory.childInventory.inventoryComplete
    ) {
      batchBlockers.push({
        code: "STORY_INVENTORY_NOT_AUTHORITATIVE",
        reason: `Story ${inventory.storyId} inventory is incomplete or blocked — entire batch is not execution-authoritative.`,
      });
    }
  }

  const ok = batchBlockers.length === 0;

  return registerAuthoritativeBatch(
    {
      ok,
      targetUserId,
      inventories,
      blockers: batchBlockers,
      fingerprint: computeTargetStorySafetyInventoryBatchFingerprint({
        targetUserId,
        expectedStoryIds: canonicalExpectedStoryIds,
        inventories,
        blockers: batchBlockers,
        ok,
      }),
    },
    canonicalExpectedStoryIds
  );
}

async function selectRows<T>(
  client: SupabaseClient,
  table: string,
  storyId: string,
  columns: string
): Promise<QueryResult<T>> {
  const { data, error } = await client
    .from(table)
    .select(columns)
    .eq("story_id", storyId);

  if (error || !Array.isArray(data)) {
    return { ok: false, error: true };
  }

  return { ok: true, rows: data as T[] };
}

export function createStorySafetyInventoryQueryDeps(
  serviceRoleClient: SupabaseClient
): StorySafetyInventoryQueryDeps {
  return {
    async loadStoryOwnership(storyId) {
      const { data, error } = await serviceRoleClient
        .from("stories")
        .select("id, user_id, status, removed_at")
        .eq("id", storyId)
        .maybeSingle();

      if (error) {
        return { ok: false, reason: "query_error" };
      }

      if (!data) {
        return { ok: false, reason: "not_found" };
      }

      return { ok: true, row: data as StoryOwnershipRow };
    },

    loadPrayerVideoResponses(storyId) {
      return selectRows<{ user_id: string | null }>(
        serviceRoleClient,
        "prayer_video_responses",
        storyId,
        "user_id"
      );
    },

    loadPrayerWrittenResponses(storyId) {
      return selectRows<{ author_user_id: string | null }>(
        serviceRoleClient,
        "prayer_written_responses",
        storyId,
        "author_user_id"
      );
    },

    loadPrayerUpdates(storyId) {
      return selectRows<{ author_user_id: string | null }>(
        serviceRoleClient,
        "prayer_updates",
        storyId,
        "author_user_id"
      );
    },

    loadStoryVideoReplies(storyId) {
      return selectRows<{
        user_id: string | null;
        recipient_user_id: string | null;
      }>(serviceRoleClient, "story_video_replies", storyId, "user_id, recipient_user_id");
    },

    loadContentReports(storyId) {
      return selectRows<{ id: string }>(
        serviceRoleClient,
        "content_reports",
        storyId,
        "id"
      );
    },

    loadStoryReactions(storyId) {
      return selectRows<{ user_id: string | null }>(
        serviceRoleClient,
        "story_reactions",
        storyId,
        "user_id"
      );
    },

    loadSavedContent(storyId) {
      return selectRows<{ user_id: string | null }>(
        serviceRoleClient,
        "saved_content",
        storyId,
        "user_id"
      );
    },

    loadPrayerFollows(storyId) {
      return selectRows<{ user_id: string | null }>(
        serviceRoleClient,
        "prayer_follows",
        storyId,
        "user_id"
      );
    },

    async listTargetOwnedStoryIds(targetUserId) {
      const { data, error } = await serviceRoleClient
        .from("stories")
        .select("id")
        .eq("user_id", targetUserId);

      if (error || !Array.isArray(data)) {
        return { ok: false };
      }

      return {
        ok: true,
        storyIds: data.map((row) => (row as { id: string }).id),
      };
    },
  };
}

export async function loadStoryDeletionSafetyInventoryWithClient(
  storyId: string,
  targetUserId: string,
  serviceRoleClient: SupabaseClient
): Promise<StoryDeletionSafetyInventory> {
  return loadStoryDeletionSafetyInventory(
    storyId,
    targetUserId,
    createStorySafetyInventoryQueryDeps(serviceRoleClient)
  );
}

export async function loadTargetOwnedStorySafetyInventoriesWithClient(
  targetUserId: string,
  serviceRoleClient: SupabaseClient
): Promise<TargetStorySafetyInventoryBatch> {
  return loadTargetOwnedStorySafetyInventories(
    targetUserId,
    createStorySafetyInventoryQueryDeps(serviceRoleClient)
  );
}
