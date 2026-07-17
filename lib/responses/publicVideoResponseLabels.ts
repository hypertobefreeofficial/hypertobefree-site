import type { PublicVideoResponseContext } from "./publicVideoResponseContext";
import { isPrayerResponseContext } from "./publicVideoResponseContext";

export function responseModuleTitle(
  context: PublicVideoResponseContext | string | null | undefined
): string {
  return isPrayerResponseContext(context) ? "Prayer Responses" : "Video Responses";
}

export function responseViewerTitle(): string {
  return "Faith Responses";
}

export function parentContextLine(options: {
  context: PublicVideoResponseContext | string | null | undefined;
  parentAuthorName: string | null;
}): string {
  const author = options.parentAuthorName?.trim() || "this post";
  if (isPrayerResponseContext(options.context)) {
    return `Prayer response for ${author}`;
  }
  if (options.context === "video_post") {
    return `Response to this video`;
  }
  return `Response to ${author}`;
}

export function parentContextShort(options: {
  context: PublicVideoResponseContext | string | null | undefined;
  parentAuthorName: string | null;
}): string {
  const author = options.parentAuthorName?.trim() || "their post";
  if (isPrayerResponseContext(options.context)) {
    return `Prayer response for ${author}`;
  }
  if (options.context === "video_post") {
    return "Response to this video";
  }
  return `Response to ${author}'s post`;
}

export function formatRelativeResponseTime(iso: string | null | undefined): string {
  if (!iso) return "Recently";
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return "Recently";
  const diffMs = Date.now() - created;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
