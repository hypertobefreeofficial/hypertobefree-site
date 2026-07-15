import {
  isStoryFeedEligible,
  isVideoResponseFeedEligible,
} from "./eligibility";
import {
  buildPageCursor,
  compareFeedOrderDesc,
  encodeFeedCursor,
  filterItemsAfterCursor,
  type FeedCompositeCursor,
} from "./cursor";
import {
  inferStoryOriginSurface,
  storyDedupeKey,
  videoResponseDedupeKey,
} from "./provenance";
import type {
  CommunityFeedItem,
  CommunityFeedStoryRecord,
  CommunityFeedVideoResponseRecord,
} from "./types";

export function mapStoryToFeedItem(
  story: CommunityFeedStoryRecord
): CommunityFeedItem {
  return {
    dedupeKey: storyDedupeKey(story.id),
    canonicalType: "story",
    canonicalId: story.id,
    creatorUserId: story.user_id,
    originSurface: inferStoryOriginSurface(story),
    parentCanonicalType: null,
    parentCanonicalId: null,
    publishedAt: story.created_at || new Date(0).toISOString(),
    story,
    videoResponse: null,
  };
}

export function mapVideoResponseToFeedItem(
  response: CommunityFeedVideoResponseRecord,
  parentStory: CommunityFeedStoryRecord
): CommunityFeedItem {
  return {
    dedupeKey: videoResponseDedupeKey(response.id),
    canonicalType: "prayer_video_response",
    canonicalId: response.id,
    creatorUserId: response.user_id,
    originSurface: "public_video_response",
    parentCanonicalType: "story",
    parentCanonicalId: parentStory.id,
    publishedAt: response.created_at,
    story: null,
    videoResponse: response,
  };
}

export function comparePublishedAtDesc(
  a: CommunityFeedItem,
  b: CommunityFeedItem
) {
  return compareFeedOrderDesc(a, b);
}

export function dedupeFeedItems(items: CommunityFeedItem[]) {
  const deduped: CommunityFeedItem[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (seen.has(item.dedupeKey)) continue;
    seen.add(item.dedupeKey);
    deduped.push(item);
  }

  return deduped;
}

export function mergeFeedItems(
  storyItems: CommunityFeedItem[],
  responseItems: CommunityFeedItem[]
) {
  return dedupeFeedItems(
    [...storyItems, ...responseItems].sort(comparePublishedAtDesc)
  );
}

export function paginateFeedItems(
  items: CommunityFeedItem[],
  pageLimit: number,
  priorCursor: Pick<
    FeedCompositeCursor,
    "story" | "prayerVideoResponse"
  > | null = null,
  options?: { hasMore?: boolean }
) {
  const page = items.slice(0, pageLimit);
  const last = page[page.length - 1];
  const hasMore = options?.hasMore ?? items.length > pageLimit;
  const nextCursor =
    page.length === pageLimit && hasMore && last
      ? encodeFeedCursor(buildPageCursor(page, priorCursor))
      : null;

  return { page, nextCursor };
}

export { filterItemsAfterCursor, type FeedCompositeCursor };

export function filterEligibleStories(
  stories: CommunityFeedStoryRecord[],
  options: {
    blockedUserIds: Set<string>;
    removedAtFilterAvailable: boolean;
  }
) {
  return stories.filter((story) => isStoryFeedEligible(story, options));
}

export function indexStoriesById(stories: CommunityFeedStoryRecord[]) {
  return new Map(stories.map((story) => [story.id, story]));
}

export function findMissingParentStoryIds(
  responseRows: CommunityFeedVideoResponseRecord[],
  storyById: Map<string, CommunityFeedStoryRecord>
) {
  return [
    ...new Set(
      responseRows
        .map((row) => row.story_id)
        .filter((id) => id && !storyById.has(id))
    ),
  ] as string[];
}

export function buildEligibleResponseFeedItems(
  responseRows: CommunityFeedVideoResponseRecord[],
  storyById: Map<string, CommunityFeedStoryRecord>,
  options: {
    blockedUserIds: Set<string>;
    removedAtFilterAvailable: boolean;
  }
) {
  const items: CommunityFeedItem[] = [];

  for (const response of responseRows) {
    if (!isVideoResponseFeedEligible(response, options)) continue;

    const parent = storyById.get(response.story_id) ?? null;
    if (!parent) continue;

    if (
      !isStoryFeedEligible(parent, {
        blockedUserIds: options.blockedUserIds,
        removedAtFilterAvailable: options.removedAtFilterAvailable,
      })
    ) {
      continue;
    }

    items.push(mapVideoResponseToFeedItem(response, parent));
  }

  return items;
}
