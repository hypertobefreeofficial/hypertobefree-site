import { enrichFeedItems } from "./enrichFeedItems";
import type { FeedDisplayItem } from "./enrichFeedItems";
import { loadCommunityFeedItems } from "./aggregateFeedItems";
import { COMMUNITY_FEED_PAGE_LIMIT_DEFAULT } from "./aggregateFeedItems";
import {
  applyRemovalKeysToLoadedFeed,
  mergeLoadedPagesAfterRealtime,
  planRealtimeFeedSync,
  type RealtimeFeedSyncBatch,
  type RealtimeFeedSyncContext,
  type RealtimeStoryChange,
} from "./realtimeFeedSync";
import { patchFeedReactionCountsForStories } from "./patchFeedReactionCounts";
import { revalidateLoadedFeedEligibility } from "./revalidateLoadedFeed";

export function patchStoryAnsweredFieldsFromRealtime(
  loaded: FeedDisplayItem[],
  storyChanges: RealtimeStoryChange[]
) {
  if (storyChanges.length === 0) return loaded;

  let next = loaded;

  for (const change of storyChanges) {
    if (change.eventType !== "UPDATE") continue;

    const record = change.record;
    const storyId = typeof record?.id === "string" ? record.id : null;
    if (!storyId) continue;

    const hasAnsweredPatch =
      record?.prayer_status !== undefined ||
      record?.answered_at !== undefined ||
      record?.answered_text !== undefined;

    if (!hasAnsweredPatch) continue;

    next = next.map((item) => {
      if (item.kind !== "story" || item.id !== storyId) return item;

      return {
        ...item,
        prayer_status:
          record?.prayer_status !== undefined
            ? record.prayer_status
            : item.prayer_status,
        answered_at:
          record?.answered_at !== undefined
            ? record.answered_at
            : item.answered_at,
        answered_text:
          record?.answered_text !== undefined
            ? record.answered_text
            : item.answered_text,
      };
    });
  }

  return next;
}

export type ProcessRealtimeFeedUpdatesOptions = {
  loaded: FeedDisplayItem[];
  batch: RealtimeFeedSyncBatch;
  context: RealtimeFeedSyncContext;
  pagesLoaded: number;
  viewerUserId?: string | null;
  blockedUserIds?: string[];
  existingItemsByKey?: Map<string, FeedDisplayItem>;
};

export type ProcessRealtimeFeedUpdatesResult = {
  items: FeedDisplayItem[];
  nextCursor: string | null;
};

export function mergeReactionCountsAcrossLoadedPages(
  loaded: FeedDisplayItem[],
  refreshedHead: FeedDisplayItem[]
) {
  const headStories = new Map(
    refreshedHead
      .filter((item): item is Extract<FeedDisplayItem, { kind: "story" }> => item.kind === "story")
      .map((item) => [item.id, item])
  );

  if (headStories.size === 0) return loaded;

  return loaded.map((item) => {
    if (item.kind !== "story") return item;
    const refreshed = headStories.get(item.id);
    if (!refreshed) return item;
    return {
      ...item,
      reaction_counts: refreshed.reaction_counts,
      user_reactions: refreshed.user_reactions,
      approved_video_responses: refreshed.approved_video_responses,
      video_response_count: refreshed.video_response_count,
      viewer_pending_response: refreshed.viewer_pending_response,
    };
  });
}

/**
 * Applies global removals across all loaded pages, optionally revalidates uncertain
 * records, then refreshes the head window for inserts/reactions without dropping tail pages.
 */
export async function processRealtimeFeedUpdates(
  options: ProcessRealtimeFeedUpdatesOptions
): Promise<ProcessRealtimeFeedUpdatesResult> {
  const plan = planRealtimeFeedSync(
    options.batch,
    options.loaded,
    options.context
  );

  const removalKeys = new Set(plan.removalKeys);

  if (plan.uncertainStoryIds.size > 0 || plan.uncertainResponseIds.size > 0) {
    const revalidated = await revalidateLoadedFeedEligibility(
      options.loaded,
      {
        storyIds: [...plan.uncertainStoryIds],
        responseIds: [...plan.uncertainResponseIds],
      },
      options.context
    );
    for (const key of revalidated.removalKeys) removalKeys.add(key);
  }

  let nextItems = applyRemovalKeysToLoadedFeed(options.loaded, removalKeys);
  nextItems = patchStoryAnsweredFieldsFromRealtime(
    nextItems,
    options.batch.storyChanges
  );

  const shouldRefreshHead = plan.needsHeadRefresh;

  if (plan.reactionStoryIds.size > 0 && !shouldRefreshHead) {
    nextItems = await patchFeedReactionCountsForStories(
      nextItems,
      [...plan.reactionStoryIds],
      options.viewerUserId ?? null
    );
    return { items: nextItems, nextCursor: null };
  }

  if (!shouldRefreshHead) {
    return { items: nextItems, nextCursor: null };
  }

  const headSlotCount =
    COMMUNITY_FEED_PAGE_LIMIT_DEFAULT * Math.max(options.pagesLoaded, 1);

  const aggregated = await loadCommunityFeedItems({
    limit: headSlotCount,
    blockedUserIds: options.blockedUserIds,
    includeVideoResponses: true,
  });

  if (aggregated.ok === false) {
    return { items: nextItems, nextCursor: null };
  }

  const enrichedHead = await enrichFeedItems(aggregated.items, {
    viewerUserId: options.viewerUserId,
    blockedUserIds: options.blockedUserIds,
    existingItemsByKey: options.existingItemsByKey,
  });

  if (plan.reactionStoryIds.size > 0 && !plan.needsHeadRefresh) {
    nextItems = mergeReactionCountsAcrossLoadedPages(nextItems, enrichedHead);
    return { items: nextItems, nextCursor: null };
  }

  nextItems = mergeLoadedPagesAfterRealtime(nextItems, {
    removalKeys: new Set(),
    refreshedHead: enrichedHead,
    headSlotCount,
  });

  if (plan.reactionStoryIds.size > 0) {
    nextItems = mergeReactionCountsAcrossLoadedPages(nextItems, enrichedHead);
  }

  return { items: nextItems, nextCursor: aggregated.nextCursor };
}
