import { supabase } from "../supabaseClient";
import { getCommunityFeedSchemaCapabilities } from "./schemaCapabilities";
import {
  getThumbnailStoragePath,
  getVideoStoragePath,
} from "./mediaPaths";
import {
  STORY_THUMBNAIL_BUCKET,
  STORY_VIDEO_BUCKET,
  resolveStoryMediaUrl,
} from "../journey/uploads/media";

export type FeedPendingVideoResponsePreview = {
  id: string;
  story_id: string;
  status: string;
  signed_thumbnail_url: string | null;
  created_at: string;
  ai_review_status: string | null;
};

async function signThumbnailUrl(
  thumbnailUrl: string | null
): Promise<string | null> {
  if (!thumbnailUrl) return null;
  const path = getThumbnailStoragePath(thumbnailUrl);
  if (!path) {
    return resolveStoryMediaUrl(thumbnailUrl, STORY_THUMBNAIL_BUCKET);
  }
  const { data } = await supabase.storage
    .from(STORY_THUMBNAIL_BUCKET)
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function loadViewerPendingVideoResponsesByStoryIds(
  storyIds: string[],
  viewerUserId: string | null
): Promise<Map<string, FeedPendingVideoResponsePreview | null>> {
  const grouped = new Map<string, FeedPendingVideoResponsePreview | null>();
  if (storyIds.length === 0 || !viewerUserId) {
    storyIds.forEach((id) => grouped.set(id, null));
    return grouped;
  }

  storyIds.forEach((id) => grouped.set(id, null));

  const capabilities = await getCommunityFeedSchemaCapabilities();
  let query = supabase
    .from("prayer_video_responses")
    .select(
      "id, story_id, status, thumbnail_url, created_at, ai_review_status, removed_at"
    )
    .in("story_id", storyIds)
    .eq("user_id", viewerUserId)
    .in("status", ["submitted", "pending", "rejected"])
    .order("created_at", { ascending: false });

  if (capabilities.prayerVideoResponses.hasRemovedAt) {
    query = query.is("removed_at", null);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Could not load viewer pending video responses:", error);
    return grouped;
  }

  for (const row of (data as {
    id: string;
    story_id: string;
    status: string;
    thumbnail_url: string | null;
    created_at: string;
    ai_review_status: string | null;
  }[]) ?? []) {
    if (grouped.get(row.story_id)) continue;
    const signed_thumbnail_url = await signThumbnailUrl(row.thumbnail_url);
    grouped.set(row.story_id, {
      id: row.id,
      story_id: row.story_id,
      status: row.status,
      signed_thumbnail_url,
      created_at: row.created_at,
      ai_review_status: row.ai_review_status,
    });
  }

  return grouped;
}
