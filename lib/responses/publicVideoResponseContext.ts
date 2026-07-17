import type { PublicVideoResponseSourceType } from "../server/submitPublicVideoResponse";

export type PublicVideoResponseContext =
  | "feed_post"
  | "prayer_request"
  | "video_post";

export function resolveResponseContextFromStory(story: {
  story_type: string | null;
}): PublicVideoResponseContext {
  const storyType = story.story_type?.toLowerCase() ?? "";
  if (storyType.includes("prayer")) return "prayer_request";
  if (storyType.includes("video")) return "video_post";
  return "feed_post";
}

export function responseContextFromSourceType(
  sourceType: PublicVideoResponseSourceType
): PublicVideoResponseContext {
  return sourceType === "prayer" ? "prayer_request" : "feed_post";
}

export function isPrayerResponseContext(
  context: PublicVideoResponseContext | string | null | undefined
): boolean {
  return context === "prayer_request";
}

export function isFeedResponseContext(
  context: PublicVideoResponseContext | string | null | undefined
): boolean {
  return context === "feed_post" || context === "video_post";
}

export function adminResponseTypeLabel(
  context: PublicVideoResponseContext | string | null | undefined
): string {
  switch (context) {
    case "prayer_request":
      return "Prayer response";
    case "video_post":
      return "Video response";
    case "feed_post":
    default:
      return "Feed response";
  }
}

export function adminParentContentLabel(
  context: PublicVideoResponseContext | string | null | undefined
): string {
  switch (context) {
    case "prayer_request":
      return "Parent Prayer";
    case "video_post":
      return "Parent Video Post";
    case "feed_post":
    default:
      return "Parent Feed Post";
  }
}

export function adminParentOwnerLabel(
  context: PublicVideoResponseContext | string | null | undefined
): string {
  switch (context) {
    case "prayer_request":
      return "Prayer Owner";
    case "video_post":
      return "Video Post Owner";
    case "feed_post":
    default:
      return "Feed Post Owner";
  }
}

export function feedParentHref(storyId: string): string {
  return `/feed?story=${storyId}`;
}

export function prayerParentHref(storyId: string): string {
  return `/prayer?story=${storyId}`;
}

export function parentHrefForResponseContext(
  storyId: string,
  context: PublicVideoResponseContext | string | null | undefined
): string {
  return isPrayerResponseContext(context)
    ? prayerParentHref(storyId)
    : feedParentHref(storyId);
}
