import {
  evaluateCommunityFeedResponseEligibility,
  evaluateCommunityFeedStoryEligibility,
} from "./eligibility";
import type { FeedDisplayItem } from "./enrichFeedItems";
import { removeFeedItemsByDedupeKeys, sortFeedDisplayItems } from "./mergeFeedState";
import { storyDedupeKey, videoResponseDedupeKey } from "./provenance";
import type {
  CommunityFeedStoryRecord,
  CommunityFeedVideoResponseRecord,
} from "./types";

export type RealtimeChangeEventType = "INSERT" | "UPDATE" | "DELETE";

export type RealtimeStoryChange = {
  eventType: RealtimeChangeEventType;
  record: Partial<CommunityFeedStoryRecord> | null;
  oldRecord?: Partial<CommunityFeedStoryRecord> | null;
};

export type RealtimeResponseChange = {
  eventType: RealtimeChangeEventType;
  record: Partial<CommunityFeedVideoResponseRecord> | null;
  oldRecord?: Partial<CommunityFeedVideoResponseRecord> | null;
};

export type RealtimeFeedSyncContext = {
  blockedUserIds: Set<string>;
  removedAtFilterAvailable: boolean;
};

function storyIdFromRecord(record: Partial<CommunityFeedStoryRecord> | null | undefined) {
  return typeof record?.id === "string" ? record.id : null;
}

function responseIdFromRecord(
  record: Partial<CommunityFeedVideoResponseRecord> | null | undefined
) {
  return typeof record?.id === "string" ? record.id : null;
}

export function isStoryRecordPubliclyIneligible(
  record: Partial<CommunityFeedStoryRecord> | null | undefined,
  context: RealtimeFeedSyncContext
) {
  if (!record || !storyIdFromRecord(record)) return true;

  if (
    record.status === undefined &&
    record.removed_at === undefined &&
    record.user_id === undefined
  ) {
    return null;
  }

  return !evaluateCommunityFeedStoryEligibility(
    {
      id: record.id as string,
      user_id: record.user_id ?? null,
      name: record.name ?? null,
      location: record.location ?? null,
      story_type: record.story_type ?? null,
      story_text: record.story_text ?? null,
      overlay_text: record.overlay_text ?? null,
      overlay_x: record.overlay_x ?? null,
      overlay_y: record.overlay_y ?? null,
      caption_style: record.caption_style ?? null,
      caption_font: record.caption_font ?? null,
      caption_background: record.caption_background ?? null,
      caption_template: record.caption_template ?? null,
      caption_color: record.caption_color ?? null,
      caption_size: record.caption_size ?? null,
      caption_align: record.caption_align ?? null,
      video_template: record.video_template ?? null,
      htbf_watermark_enabled: record.htbf_watermark_enabled ?? null,
      silhouette_watermark_enabled: record.silhouette_watermark_enabled ?? null,
      shared_htbf_intro_enabled: record.shared_htbf_intro_enabled ?? null,
      image_url: record.image_url ?? null,
      video_url: record.video_url ?? null,
      thumbnail_url: record.thumbnail_url ?? null,
      status: record.status ?? null,
      created_at: record.created_at ?? null,
      prayer_status: record.prayer_status ?? null,
      answered_at: record.answered_at ?? null,
      answered_text: record.answered_text ?? null,
      creation_mode: record.creation_mode ?? null,
      ai_suggestions: record.ai_suggestions ?? null,
      removed_at: record.removed_at ?? null,
    },
    {
      blockedUserIds: context.blockedUserIds,
      removedAtFilterAvailable: context.removedAtFilterAvailable,
    }
  );
}

export function isResponseRecordPubliclyIneligible(
  record: Partial<CommunityFeedVideoResponseRecord> | null | undefined,
  context: RealtimeFeedSyncContext
) {
  if (!record || !responseIdFromRecord(record)) return true;

  if (
    record.status === undefined &&
    record.removed_at === undefined &&
    record.user_id === undefined
  ) {
    return null;
  }

  return !evaluateCommunityFeedResponseEligibility(
    {
      status: record.status ?? null,
      removed_at: record.removed_at ?? null,
      user_id: record.user_id ?? "",
    },
    {
      blockedUserIds: context.blockedUserIds,
      removedAtFilterAvailable: context.removedAtFilterAvailable,
    }
  );
}

export function collectChildResponseDedupeKeys(
  loaded: FeedDisplayItem[],
  parentStoryId: string
) {
  const keys = new Set<string>();
  for (const item of loaded) {
    if (
      item.kind === "prayer_video_response" &&
      item.parentStoryId === parentStoryId
    ) {
      keys.add(item.dedupeKey);
    }
  }
  return keys;
}

export function collectRemovalKeysForStoryChange(
  change: RealtimeStoryChange,
  loaded: FeedDisplayItem[],
  context: RealtimeFeedSyncContext
) {
  const removalKeys = new Set<string>();
  const uncertainStoryIds = new Set<string>();

  const record =
    change.eventType === "DELETE" ? change.oldRecord ?? change.record : change.record;
  const storyId = storyIdFromRecord(record) ?? storyIdFromRecord(change.oldRecord);

  if (!storyId) return { removalKeys, uncertainStoryIds, needsHeadRefresh: false };

  const dedupeKey = storyDedupeKey(storyId);

  if (change.eventType === "DELETE") {
    removalKeys.add(dedupeKey);
    for (const key of collectChildResponseDedupeKeys(loaded, storyId)) {
      removalKeys.add(key);
    }
    return { removalKeys, uncertainStoryIds, needsHeadRefresh: false };
  }

  const ineligible = isStoryRecordPubliclyIneligible(record, context);
  if (ineligible === null) {
    uncertainStoryIds.add(storyId);
    return { removalKeys, uncertainStoryIds, needsHeadRefresh: false };
  }

  if (ineligible) {
    removalKeys.add(dedupeKey);
    for (const key of collectChildResponseDedupeKeys(loaded, storyId)) {
      removalKeys.add(key);
    }
    return { removalKeys, uncertainStoryIds, needsHeadRefresh: false };
  }

  const needsHeadRefresh = change.eventType === "INSERT";
  return { removalKeys, uncertainStoryIds, needsHeadRefresh };
}

export function collectRemovalKeysForResponseChange(
  change: RealtimeResponseChange,
  context: RealtimeFeedSyncContext
) {
  const removalKeys = new Set<string>();
  const uncertainResponseIds = new Set<string>();

  const record =
    change.eventType === "DELETE" ? change.oldRecord ?? change.record : change.record;
  const responseId =
    responseIdFromRecord(record) ?? responseIdFromRecord(change.oldRecord);

  if (!responseId) {
    return { removalKeys, uncertainResponseIds, needsHeadRefresh: false };
  }

  const dedupeKey = videoResponseDedupeKey(responseId);

  if (change.eventType === "DELETE") {
    removalKeys.add(dedupeKey);
    return { removalKeys, uncertainResponseIds, needsHeadRefresh: false };
  }

  const ineligible = isResponseRecordPubliclyIneligible(record, context);
  if (ineligible === null) {
    uncertainResponseIds.add(responseId);
    return { removalKeys, uncertainResponseIds, needsHeadRefresh: false };
  }

  if (ineligible) {
    removalKeys.add(dedupeKey);
    return { removalKeys, uncertainResponseIds, needsHeadRefresh: false };
  }

  return {
    removalKeys,
    uncertainResponseIds,
    needsHeadRefresh: change.eventType === "INSERT",
  };
}

export type RealtimeFeedSyncBatch = {
  storyChanges: RealtimeStoryChange[];
  responseChanges: RealtimeResponseChange[];
  reactionStoryIds: string[];
};

export type RealtimeFeedSyncPlan = {
  removalKeys: Set<string>;
  uncertainStoryIds: Set<string>;
  uncertainResponseIds: Set<string>;
  needsHeadRefresh: boolean;
  reactionStoryIds: Set<string>;
};

export function planRealtimeFeedSync(
  batch: RealtimeFeedSyncBatch,
  loaded: FeedDisplayItem[],
  context: RealtimeFeedSyncContext
): RealtimeFeedSyncPlan {
  const removalKeys = new Set<string>();
  const uncertainStoryIds = new Set<string>();
  const uncertainResponseIds = new Set<string>();
  let needsHeadRefresh = false;

  for (const change of batch.storyChanges) {
    const result = collectRemovalKeysForStoryChange(change, loaded, context);
    for (const key of result.removalKeys) removalKeys.add(key);
    for (const id of result.uncertainStoryIds) uncertainStoryIds.add(id);
    needsHeadRefresh = needsHeadRefresh || result.needsHeadRefresh;
  }

  for (const change of batch.responseChanges) {
    const result = collectRemovalKeysForResponseChange(change, context);
    for (const key of result.removalKeys) removalKeys.add(key);
    for (const id of result.uncertainResponseIds) uncertainResponseIds.add(id);
    needsHeadRefresh = needsHeadRefresh || result.needsHeadRefresh;
  }

  const reactionStoryIds = new Set(batch.reactionStoryIds);

  return {
    removalKeys,
    uncertainStoryIds,
    uncertainResponseIds,
    needsHeadRefresh,
    reactionStoryIds,
  };
}

export function applyRemovalKeysToLoadedFeed(
  loaded: FeedDisplayItem[],
  removalKeys: Set<string>
) {
  if (removalKeys.size === 0) return loaded;
  return sortFeedDisplayItems(removeFeedItemsByDedupeKeys(loaded, removalKeys));
}

export function loadedStoryIdsFromFeed(items: FeedDisplayItem[]) {
  return items
    .filter((item): item is Extract<FeedDisplayItem, { kind: "story" }> => item.kind === "story")
    .map((item) => item.id);
}

export function loadedResponseIdsFromFeed(items: FeedDisplayItem[]) {
  return items
    .filter(
      (item): item is Extract<FeedDisplayItem, { kind: "prayer_video_response" }> =>
        item.kind === "prayer_video_response"
    )
    .map((item) => item.id);
}

export function mergeLoadedPagesAfterRealtime(
  loaded: FeedDisplayItem[],
  options: {
    removalKeys: Set<string>;
    refreshedHead?: FeedDisplayItem[];
    headSlotCount?: number;
  }
) {
  let next = applyRemovalKeysToLoadedFeed(loaded, options.removalKeys);

  if (!options.refreshedHead || options.refreshedHead.length === 0) {
    return next;
  }

  const headSlotCount = options.headSlotCount ?? options.refreshedHead.length;
  const sortedLoaded = sortFeedDisplayItems(next);
  const headKeys = new Set(options.refreshedHead.map((item) => item.dedupeKey));
  const tail = sortedLoaded
    .slice(Math.max(headSlotCount, options.refreshedHead.length))
    .filter((item) => !headKeys.has(item.dedupeKey));

  return sortFeedDisplayItems([...options.refreshedHead, ...tail]);
}
