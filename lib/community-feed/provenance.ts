import type {
  CommunityFeedOriginSurface,
  CommunityFeedStoryRecord,
} from "./types";

/** Infer internal origin from story metadata — never shown publicly. */
export function inferStoryOriginSurface(
  story: Pick<
    CommunityFeedStoryRecord,
    "story_type" | "prayer_status" | "creation_mode" | "answered_at"
  >
): CommunityFeedOriginSurface {
  const type = (story.story_type || "").toLowerCase();

  if (story.prayer_status === "answered" && story.answered_at) {
    return "god_did_it_update";
  }

  if (type.includes("prayer")) {
    return "prayer_connect";
  }

  if (type.includes("praise")) {
    return "praise";
  }

  const mode = (story.creation_mode || "").toLowerCase();
  if (mode.includes("profile")) {
    return "profile_upload";
  }

  if (
    type.includes("testimony") ||
    type.includes("deliverance") ||
    type.includes("healing") ||
    type.includes("story")
  ) {
    return "share_your_story";
  }

  return "unknown";
}

export function storyDedupeKey(storyId: string) {
  return `story:${storyId}`;
}

export function videoResponseDedupeKey(responseId: string) {
  return `prayer_video_response:${responseId}`;
}
