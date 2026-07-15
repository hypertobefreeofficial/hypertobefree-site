import type { FeedStoryDisplay } from "./enrichFeedItems";

export type FeedMediaAspect = "portrait" | "landscape" | "auto";

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readFeedMediaAspectHint(
  aiSuggestions: unknown
): FeedMediaAspect | null {
  const metadata = readRecord(aiSuggestions);
  const aspect = metadata?.feedMediaAspect;

  if (aspect === "portrait" || aspect === "landscape" || aspect === "auto") {
    return aspect;
  }

  return null;
}

/** Chooses feed media framing without forcing photos into video ratios. */
export function getStoryFeedMediaAspect(
  story: Pick<
    FeedStoryDisplay,
    "signed_image_url" | "signed_video_url" | "ai_suggestions"
  >
): FeedMediaAspect {
  const hinted = readFeedMediaAspectHint(story.ai_suggestions);
  if (hinted) return hinted;

  if (story.signed_image_url && !story.signed_video_url) {
    return "auto";
  }

  if (story.signed_video_url) {
    return "portrait";
  }

  return "auto";
}

export function feedMediaAspectClassName(
  aspect: FeedMediaAspect,
  classes: {
    auto: string;
    portrait: string;
    landscape: string;
  }
) {
  if (aspect === "landscape") return classes.landscape;
  if (aspect === "portrait") return classes.portrait;
  return classes.auto;
}
