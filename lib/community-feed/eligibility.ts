import type { CommunityFeedFilter, CommunityFeedStoryRecord } from "./types";
import {
  COMMUNITY_FEED_RESPONSE_PUBLIC_STATUS,
  COMMUNITY_FEED_STORY_PUBLIC_STATUS,
} from "./invariant";

export {
  COMMUNITY_FEED_APPROVED_IS_PUBLIC,
  COMMUNITY_FEED_RESPONSE_PUBLIC_STATUS,
  COMMUNITY_FEED_STORY_PUBLIC_STATUS,
} from "./invariant";

/**
 * Community Feed story eligibility (fail closed).
 *
 * Authoritative public-distribution signal in the current schema:
 * - `stories.status = 'approved'` — moderation-approved for public Community Feed
 *   distribution (see `invariant.ts` audit note).
 *
 * There is NO separate feed_visible or profile-only flag on `stories`.
 *
 * Exclusion signals:
 * - `stories.status` not exactly `'approved'`
 * - `stories.removed_at` set (requires column; fail closed if unavailable)
 * - Blocked author (viewer-specific, bidirectional)
 *
 * NOT used for feed inclusion:
 * - `creation_mode`, `content_type`, `story_type` (format/routing metadata)
 * - `location_visibility` (location privacy only)
 * - `prayer_hidden_stories` (Prayer Connect per-user hide)
 */

export function isPrayerStory(story: Pick<CommunityFeedStoryRecord, "story_type">) {
  return (story.story_type || "").toLowerCase().includes("prayer");
}

export function isAnsweredPrayer(
  story: Pick<CommunityFeedStoryRecord, "story_type" | "prayer_status">
) {
  return isPrayerStory(story) && story.prayer_status === "answered";
}

export function isPraiseStory(story: Pick<CommunityFeedStoryRecord, "story_type">) {
  return (story.story_type || "").toLowerCase().includes("praise");
}

export function isTestimonyStory(
  story: Pick<CommunityFeedStoryRecord, "story_type">
) {
  const type = (story.story_type || "").toLowerCase();
  if (isPrayerStory(story) || isPraiseStory(story)) return false;
  return (
    type.includes("testimony") ||
    type.includes("deliverance") ||
    type.includes("healing") ||
    type.includes("story") ||
    type.includes("worship") ||
    type.includes("teaching") ||
    type.includes("encouragement")
  );
}

export function storyMatchesFeedFilter(
  story: CommunityFeedStoryRecord,
  filter: CommunityFeedFilter
) {
  switch (filter) {
    case "all":
      return true;
    case "videos":
      return Boolean(story.video_url);
    case "testimony":
      return isTestimonyStory(story);
    case "praise":
      return isPraiseStory(story);
    case "prayer":
      return isPrayerStory(story) && !isAnsweredPrayer(story);
    case "answered":
      return isAnsweredPrayer(story);
    default:
      return true;
  }
}

export type CommunityFeedEligibilityContext = {
  blockedUserIds?: Set<string>;
  removedAtFilterAvailable?: boolean;
  demoIsolationActive?: boolean;
};

/** Single authoritative story eligibility check for Community Feed aggregation. */
export function evaluateCommunityFeedStoryEligibility(
  story: CommunityFeedStoryRecord,
  context: CommunityFeedEligibilityContext = {}
) {
  return isStoryFeedEligible(story, context);
}

/** Single authoritative video-response eligibility check (responder only). */
export function evaluateCommunityFeedResponseEligibility(
  response: {
    status: string | null;
    removed_at?: string | null;
    user_id: string;
    is_demo?: boolean | null;
  },
  context: CommunityFeedEligibilityContext = {}
) {
  return isVideoResponseFeedEligible(response, context);
}

export function isStoryFeedEligible(
  story: CommunityFeedStoryRecord,
  options?: CommunityFeedEligibilityContext
) {
  if (options?.removedAtFilterAvailable === false) {
    return false;
  }

  if (
    (story.status || "").toLowerCase() !== COMMUNITY_FEED_STORY_PUBLIC_STATUS
  ) {
    return false;
  }

  if (story.removed_at) {
    return false;
  }

  if (story.user_id && options?.blockedUserIds?.has(story.user_id)) {
    return false;
  }

  if (options?.demoIsolationActive && story.is_demo === true) {
    return false;
  }

  return true;
}

export function isVideoResponseFeedEligible(
  response: {
    status: string | null;
    removed_at?: string | null;
    user_id: string;
    is_demo?: boolean | null;
  },
  options?: CommunityFeedEligibilityContext
) {
  if (options?.removedAtFilterAvailable === false) {
    return false;
  }

  if (
    (response.status || "").toLowerCase() !== COMMUNITY_FEED_RESPONSE_PUBLIC_STATUS
  ) {
    return false;
  }

  if (response.removed_at) {
    return false;
  }

  if (options?.blockedUserIds?.has(response.user_id)) {
    return false;
  }

  if (options?.demoIsolationActive && response.is_demo === true) {
    return false;
  }

  return true;
}
