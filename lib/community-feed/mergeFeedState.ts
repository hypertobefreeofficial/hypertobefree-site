import { compareFeedOrderDesc } from "./cursor";
import type { FeedDisplayItem } from "./enrichFeedItems";

export function sortFeedDisplayItems(items: FeedDisplayItem[]) {
  return [...items].sort((a, b) => {
    const aPublished = a.kind === "story" ? a.created_at : a.created_at;
    const bPublished = b.kind === "story" ? b.created_at : b.created_at;
    return compareFeedOrderDesc(
      {
        publishedAt: aPublished || new Date(0).toISOString(),
        dedupeKey: a.dedupeKey,
      },
      {
        publishedAt: bPublished || new Date(0).toISOString(),
        dedupeKey: b.dedupeKey,
      }
    );
  });
}

/** Append a later page without replacing earlier items. */
export function mergeFeedDisplayPages(
  existing: FeedDisplayItem[],
  nextPage: FeedDisplayItem[]
) {
  const byKey = new Map<string, FeedDisplayItem>();
  for (const item of existing) byKey.set(item.dedupeKey, item);
  for (const item of nextPage) byKey.set(item.dedupeKey, item);
  return sortFeedDisplayItems([...byKey.values()]);
}

/**
 * Refresh the loaded head window while preserving tail pages.
 * `headSlotCount` = pagesLoaded * pageSize (items expected in refreshed head).
 */
export function mergeRealtimeHeadRefresh(
  loaded: FeedDisplayItem[],
  refreshedHead: FeedDisplayItem[],
  headSlotCount: number
) {
  const sortedLoaded = sortFeedDisplayItems(loaded);
  const headKeys = new Set(refreshedHead.map((item) => item.dedupeKey));
  const tail = sortedLoaded.slice(Math.max(headSlotCount, refreshedHead.length)).filter(
    (item) => !headKeys.has(item.dedupeKey)
  );

  return sortFeedDisplayItems([...refreshedHead, ...tail]);
}

export function removeFeedItemsByDedupeKeys(
  items: FeedDisplayItem[],
  keys: Set<string>
) {
  return items.filter((item) => !keys.has(item.dedupeKey));
}

export function upsertFeedDisplayItem(
  items: FeedDisplayItem[],
  nextItem: FeedDisplayItem
) {
  const byKey = new Map(items.map((item) => [item.dedupeKey, item]));
  byKey.set(nextItem.dedupeKey, nextItem);
  return sortFeedDisplayItems([...byKey.values()]);
}
