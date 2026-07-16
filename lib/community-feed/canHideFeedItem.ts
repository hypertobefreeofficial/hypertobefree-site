import { isPrayerStory } from "./eligibility";
import type { FeedDisplayItem } from "./enrichFeedItems";

/**
 * Hide post is only offered when persistence is durable and truthful.
 * Prayer stories use `prayer_hidden_stories` (user-scoped, server-backed).
 */
export function canPersistentlyHideFeedItem(item: FeedDisplayItem): boolean {
  return item.kind === "story" && isPrayerStory(item);
}
