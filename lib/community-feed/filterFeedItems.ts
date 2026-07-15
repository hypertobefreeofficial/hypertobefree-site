import {
  isAnsweredPrayer,
  isPrayerStory,
  isPraiseStory,
  isTestimonyStory,
} from "./eligibility";
import { isBlockedAuthor } from "./blockedUsers";
import type { CommunityFeedFilter } from "./types";
import type { FeedDisplayItem } from "./enrichFeedItems";

export function filterFeedDisplayItems(
  items: FeedDisplayItem[],
  filter: CommunityFeedFilter,
  blockedUserIds: string[]
): FeedDisplayItem[] {
  const blocked = new Set(blockedUserIds);

  const visible = items.filter((item) => {
    if (item.kind === "story") {
      return !isBlockedAuthor(item.user_id, blocked);
    }

    if (isBlockedAuthor(item.user_id, blocked)) return false;
    return !isBlockedAuthor(item.parentStoryUserId, blocked);
  });

  if (filter === "all") return visible;

  if (filter === "videos") {
    return visible.filter((item) => {
      if (item.kind === "prayer_video_response") return true;
      return Boolean(item.signed_video_url || item.video_url);
    });
  }

  if (filter === "testimony") {
    return visible.filter(
      (item) =>
        item.kind === "story" && isTestimonyStory(item)
    );
  }

  if (filter === "praise") {
    return visible.filter(
      (item) => item.kind === "story" && isPraiseStory(item)
    );
  }

  if (filter === "prayer") {
    return visible.filter((item) => {
      if (item.kind === "prayer_video_response") return true;
      return item.kind === "story" && isPrayerStory(item) && !isAnsweredPrayer(item);
    });
  }

  if (filter === "answered") {
    return visible.filter(
      (item) => item.kind === "story" && isAnsweredPrayer(item)
    );
  }

  return visible;
}
