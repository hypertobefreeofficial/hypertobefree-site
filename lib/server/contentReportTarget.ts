/**
 * Pure helpers for content-report target resolution (unit-tested).
 */

export type ContentReportStoryRecord = {
  id: string;
  user_id: string | null;
  story_text: string | null;
  video_url: string | null;
  image_url: string | null;
  status: string | null;
  removed_at: string | null;
  story_type: string | null;
};

export function isVideoResponseReport(
  contentType: string,
  responseId: string | null
) {
  return contentType === "video_response" && Boolean(responseId);
}

export function isPrayerStoryType(storyType: string | null | undefined) {
  return (storyType || "").toLowerCase().includes("prayer");
}

/** Prayer/story reports require an approved, non-removed prayer parent. */
export function isPrayerStoryReportTargetUnavailable(
  story: ContentReportStoryRecord | null
) {
  if (!story) return true;
  if (story.removed_at) return true;
  if (story.status !== "approved") return true;
  if (!isPrayerStoryType(story.story_type)) return true;
  return false;
}

/**
 * Video-response reports derive the reported user from the response row.
 * Parent story is evidence context only and must not replace the response author.
 */
export function mergeVideoResponseParentStoryContext(options: {
  story: ContentReportStoryRecord | null;
  contentSnapshot: string | null;
  mediaReference: string | null;
}) {
  let resolvedStoryId: string | null = options.story?.id ?? null;
  let contentSnapshot = options.contentSnapshot;
  const mediaReference = options.mediaReference;

  if (!options.story) {
    resolvedStoryId = null;
    return { resolvedStoryId, contentSnapshot, mediaReference };
  }

  if (!contentSnapshot) {
    contentSnapshot =
      options.story.story_text?.trim()?.slice(0, 4000) || null;
  }

  return { resolvedStoryId, contentSnapshot, mediaReference };
}
