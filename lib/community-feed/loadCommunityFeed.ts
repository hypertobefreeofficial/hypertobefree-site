import { loadCommunityFeedItems } from "./aggregateFeedItems";
import { loadBidirectionalBlockedUserIds } from "./blockedUsers";
import { enrichFeedItems } from "./enrichFeedItems";
import type { FeedDisplayItem } from "./enrichFeedItems";

export type { FeedDisplayItem, FeedStoryDisplay, FeedVideoResponseDisplay } from "./enrichFeedItems";
export { filterFeedDisplayItems } from "./filterFeedItems";
export {
  COMMUNITY_FEED_PAGE_LIMIT_DEFAULT,
  COMMUNITY_FEED_RESPONSE_SOURCE_FETCH_MAX,
  COMMUNITY_FEED_STORY_SOURCE_FETCH_MIN,
} from "./aggregateFeedItems";

export type LoadCommunityFeedOptions = {
  limit?: number;
  /** Encoded composite cursor from the prior page. */
  cursor?: string | null;
  viewerUserId?: string | null;
  blockedUserIds?: string[];
  includeVideoResponses?: boolean;
  /** Skip re-signing media for items already present in the client cache. */
  existingItemsByKey?: Map<string, FeedDisplayItem>;
};

export type LoadCommunityFeedResult =
  | { ok: true; items: FeedDisplayItem[]; nextCursor: string | null }
  | { ok: false; message: string };

/**
 * Loads canonical Community Feed items and enriches them for display
 * (signed media URLs, reactions, parent context for video responses).
 */
export async function loadCommunityFeed(
  options: LoadCommunityFeedOptions = {}
): Promise<LoadCommunityFeedResult> {
  let blockedUserIds = options.blockedUserIds;
  if ((!blockedUserIds || blockedUserIds.length === 0) && options.viewerUserId) {
    blockedUserIds = await loadBidirectionalBlockedUserIds(options.viewerUserId);
  }

  const aggregated = await loadCommunityFeedItems({
    limit: options.limit ?? 40,
    cursor: options.cursor,
    viewerUserId: options.viewerUserId,
    blockedUserIds,
    includeVideoResponses: options.includeVideoResponses ?? true,
  });

  if (aggregated.ok === false) {
    return { ok: false, message: aggregated.message };
  }

  const items = await enrichFeedItems(aggregated.items, {
    viewerUserId: options.viewerUserId,
    blockedUserIds,
    existingItemsByKey: options.existingItemsByKey,
  });

  return {
    ok: true,
    items,
    nextCursor: aggregated.nextCursor,
  };
}
