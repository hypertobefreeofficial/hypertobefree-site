import type { MobileNavInboxRow, MobileNavPrivateReplyRow } from "./mobileNavBadgeCounts";

export type MobileNavBadgeReplySourceRow = {
  id: string;
  story_id: string | null;
  user_id: string | null;
  recipient_user_id: string | null;
  read_at: string | null;
  deleted_by_recipient?: boolean | null;
  deleted_by_sender?: boolean | null;
  is_demo?: boolean | null;
};

export type ParentStoryMetadataRow = {
  id: string;
  is_demo?: boolean | null;
  creation_mode?: string | null;
};

export type BadgeStoryQueryResult = {
  data: unknown[] | null;
  error: { code?: string; message?: string } | null;
};

export type BadgeStoryVideoReplyQuery = (
  select: string
) => Promise<BadgeStoryQueryResult>;

export type BadgeParentStoryQuery = (
  storyIds: string[],
  select: string
) => Promise<BadgeStoryQueryResult>;

const REPLY_BASE_SELECT =
  "id, story_id, user_id, recipient_user_id, read_at, deleted_by_recipient, deleted_by_sender";

const SYNTHETIC_CREATION_MODES = new Set(["loadtest", "load_test"]);

type ReplyIsDemoCapability = "unknown" | "supported" | "unsupported";
type ParentStoryLookupCapability =
  | "unknown"
  | "full"
  | "is_demo_only"
  | "unavailable";

let replyIsDemoCapability: ReplyIsDemoCapability = "unknown";
let parentStoryLookupCapability: ParentStoryLookupCapability = "unknown";

export function resetMobileNavBadgeSourceFilteringCaches() {
  replyIsDemoCapability = "unknown";
  parentStoryLookupCapability = "unknown";
}

export function getReplyIsDemoCapabilityForTests(): ReplyIsDemoCapability {
  return replyIsDemoCapability;
}

export function getParentStoryLookupCapabilityForTests(): ParentStoryLookupCapability {
  return parentStoryLookupCapability;
}

export function isMissingOptionalColumnError(
  error: unknown,
  column: string
): boolean {
  if (!error || typeof error !== "object") return false;

  const record = error as { code?: string; message?: string };
  const code = record.code ?? "";
  const message = (record.message ?? "").toLowerCase();
  const normalizedColumn = column.toLowerCase();

  if (code === "42703" || code === "PGRST204") {
    return message.includes(normalizedColumn);
  }

  return (
    message.includes(`column "${normalizedColumn}"`) ||
    message.includes(`column ${normalizedColumn}`) ||
    message.includes(`'${normalizedColumn}'`) ||
    message.includes(`"${normalizedColumn}" does not exist`)
  );
}

export function isSyntheticParentStory(row: ParentStoryMetadataRow): boolean {
  if (row.is_demo === true) return true;

  const creationMode = row.creation_mode?.trim().toLowerCase();
  if (creationMode && SYNTHETIC_CREATION_MODES.has(creationMode)) {
    return true;
  }

  return false;
}

export function collectParentStoryIds(
  inboxRows: MobileNavInboxRow[],
  replyRows: Pick<MobileNavBadgeReplySourceRow, "story_id">[]
): string[] {
  const ids = new Set<string>();

  for (const message of inboxRows) {
    for (const candidate of [message.story_id, message.prayer_request_id]) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        ids.add(candidate);
      }
    }
  }

  for (const reply of replyRows) {
    if (typeof reply.story_id === "string" && reply.story_id.trim().length > 0) {
      ids.add(reply.story_id);
    }
  }

  return Array.from(ids);
}

export function filterInboxRowsBySyntheticParentStories<
  T extends { story_id?: string | null; prayer_request_id?: string | null },
>(rows: T[], syntheticParentStoryIds: Set<string>): T[] {
  if (syntheticParentStoryIds.size === 0) return rows;

  return rows.filter((message) => {
    const parentId = message.story_id ?? message.prayer_request_id;
    if (!parentId) return true;
    return !syntheticParentStoryIds.has(parentId);
  });
}

export function filterReplyRowsBySyntheticParentStories(
  rows: MobileNavBadgeReplySourceRow[],
  syntheticParentStoryIds: Set<string>
): MobileNavBadgeReplySourceRow[] {
  if (syntheticParentStoryIds.size === 0) return rows;

  return rows.filter((reply) => {
    const storyId = reply.story_id?.trim();
    if (!storyId) return true;
    return !syntheticParentStoryIds.has(storyId);
  });
}

export function filterVisibleBadgePrivateReplies(
  rows: MobileNavBadgeReplySourceRow[],
  currentUserId: string,
  options?: { replyIsDemoSupported?: boolean }
): MobileNavBadgeReplySourceRow[] {
  const replyIsDemoSupported = options?.replyIsDemoSupported ?? false;

  return rows.filter((row) => {
    if (replyIsDemoSupported && row.is_demo === true) return false;

    if (row.recipient_user_id !== currentUserId) return false;

    const hiddenFromSender =
      row.user_id === currentUserId && row.deleted_by_sender === true;
    const hiddenFromRecipient =
      row.recipient_user_id === currentUserId &&
      row.deleted_by_recipient === true;

    return !hiddenFromSender && !hiddenFromRecipient;
  });
}

export function toMobileNavPrivateReplyRow(
  row: MobileNavBadgeReplySourceRow
): MobileNavPrivateReplyRow {
  return {
    id: row.id,
    story_id: row.story_id,
    user_id: row.user_id,
    recipient_user_id: row.recipient_user_id,
    read_at: row.read_at,
    deleted_by_recipient: row.deleted_by_recipient,
  };
}

export async function fetchBadgeStoryVideoReplies(
  query: BadgeStoryVideoReplyQuery
): Promise<MobileNavBadgeReplySourceRow[]> {
  if (replyIsDemoCapability === "unsupported") {
    const result = await query(REPLY_BASE_SELECT);
    if (result.error) {
      throw new Error(result.error.message ?? "Could not load badge replies.");
    }
    return (result.data ?? []) as MobileNavBadgeReplySourceRow[];
  }

  if (replyIsDemoCapability === "supported") {
    const result = await query(`${REPLY_BASE_SELECT}, is_demo`);
    if (result.error) {
      throw new Error(result.error.message ?? "Could not load badge replies.");
    }
    return (result.data ?? []) as MobileNavBadgeReplySourceRow[];
  }

  let result = await query(`${REPLY_BASE_SELECT}, is_demo`);

  if (result.error && isMissingOptionalColumnError(result.error, "is_demo")) {
    replyIsDemoCapability = "unsupported";
    result = await query(REPLY_BASE_SELECT);
    if (result.error) {
      throw new Error(result.error.message ?? "Could not load badge replies.");
    }
    return (result.data ?? []) as MobileNavBadgeReplySourceRow[];
  }

  if (result.error) {
    throw new Error(result.error.message ?? "Could not load badge replies.");
  }

  replyIsDemoCapability = "supported";
  return (result.data ?? []) as MobileNavBadgeReplySourceRow[];
}

export async function resolveSyntheticParentStoryIds(
  storyIds: string[],
  query: BadgeParentStoryQuery
): Promise<Set<string>> {
  const uniqueIds = Array.from(
    new Set(
      storyIds.filter(
        (storyId): storyId is string =>
          typeof storyId === "string" && storyId.trim().length > 0
      )
    )
  );

  if (uniqueIds.length === 0) return new Set();

  if (parentStoryLookupCapability === "unavailable") {
    return new Set();
  }

  const selectForCapability = (): string => {
    if (parentStoryLookupCapability === "full") {
      return "id, is_demo, creation_mode";
    }
    if (parentStoryLookupCapability === "is_demo_only") {
      return "id, is_demo";
    }
    return "id, is_demo, creation_mode";
  };

  let result = await query(uniqueIds, selectForCapability());

  if (parentStoryLookupCapability === "unknown") {
    if (result.error) {
      if (isMissingOptionalColumnError(result.error, "creation_mode")) {
        parentStoryLookupCapability = "is_demo_only";
        result = await query(uniqueIds, "id, is_demo");

        if (result.error) {
          if (isMissingOptionalColumnError(result.error, "is_demo")) {
            parentStoryLookupCapability = "unavailable";
            return new Set();
          }
          return new Set();
        }
      } else if (isMissingOptionalColumnError(result.error, "is_demo")) {
        parentStoryLookupCapability = "unavailable";
        return new Set();
      } else {
        return new Set();
      }
    } else {
      parentStoryLookupCapability = "full";
    }
  } else if (result.error) {
    return new Set();
  }

  const rows = (result.data ?? []) as ParentStoryMetadataRow[];
  const syntheticIds = new Set<string>();

  for (const row of rows) {
    if (isSyntheticParentStory(row)) {
      syntheticIds.add(row.id);
    }
  }

  return syntheticIds;
}

export async function filterBadgeSourceRows(
  inboxRows: MobileNavInboxRow[],
  replyRows: MobileNavBadgeReplySourceRow[],
  currentUserId: string,
  queryParentStories: BadgeParentStoryQuery
): Promise<{
  inboxRows: MobileNavInboxRow[];
  privateReplyRows: MobileNavPrivateReplyRow[];
}> {
  const parentStoryIds = collectParentStoryIds(inboxRows, replyRows);
  const syntheticParentStoryIds = await resolveSyntheticParentStoryIds(
    parentStoryIds,
    queryParentStories
  );

  const filteredInbox = filterInboxRowsBySyntheticParentStories(
    inboxRows,
    syntheticParentStoryIds
  );

  const filteredReplies = filterVisibleBadgePrivateReplies(
    filterReplyRowsBySyntheticParentStories(replyRows, syntheticParentStoryIds),
    currentUserId,
    { replyIsDemoSupported: replyIsDemoCapability === "supported" }
  );

  return {
    inboxRows: filteredInbox,
    privateReplyRows: filteredReplies.map(toMobileNavPrivateReplyRow),
  };
}
