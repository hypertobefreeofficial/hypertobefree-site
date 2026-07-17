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

export type FeedApprovedVideoResponsePreview = {
  id: string;
  user_id: string;
  authorName: string | null;
  signed_video_url: string | null;
  signed_thumbnail_url: string | null;
  created_at: string;
};

async function signVideoUrl(videoUrl: string | null): Promise<string | null> {
  if (!videoUrl) return null;
  const path = getVideoStoragePath(videoUrl);
  if (!path) return videoUrl.startsWith("http") ? videoUrl : null;
  const { data } = await supabase.storage
    .from(STORY_VIDEO_BUCKET)
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

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

export async function loadApprovedVideoResponsesByStoryIds(
  storyIds: string[]
): Promise<Map<string, FeedApprovedVideoResponsePreview[]>> {
  const grouped = new Map<string, FeedApprovedVideoResponsePreview[]>();
  if (storyIds.length === 0) return grouped;

  storyIds.forEach((id) => grouped.set(id, []));

  const capabilities = await getCommunityFeedSchemaCapabilities();
  let query = supabase
    .from("prayer_video_responses")
    .select("id, story_id, user_id, video_url, thumbnail_url, created_at, status, removed_at")
    .in("story_id", storyIds)
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  if (capabilities.prayerVideoResponses.hasRemovedAt) {
    query = query.is("removed_at", null);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Could not load approved parent video responses:", error);
    return grouped;
  }

  const rows = (data as {
    id: string;
    story_id: string;
    user_id: string;
    video_url: string | null;
    thumbnail_url: string | null;
    created_at: string;
  }[]) ?? [];

  const authorIds = [...new Set(rows.map((row) => row.user_id))];
  const authorNames = new Map<string, string>();

  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, username")
      .in("id", authorIds);

    ((profiles as { id: string; display_name: string | null; username: string | null }[]) ??
      []
    ).forEach((profile) => {
      authorNames.set(
        profile.id,
        profile.display_name?.trim() ||
          profile.username?.trim() ||
          "HTBF community member"
      );
    });
  }

  for (const row of rows) {
    const [signed_video_url, signed_thumbnail_url] = await Promise.all([
      signVideoUrl(row.video_url),
      signThumbnailUrl(row.thumbnail_url),
    ]);

    const preview: FeedApprovedVideoResponsePreview = {
      id: row.id,
      user_id: row.user_id,
      authorName: authorNames.get(row.user_id) ?? null,
      signed_video_url,
      signed_thumbnail_url,
      created_at: row.created_at,
    };

    const existing = grouped.get(row.story_id) ?? [];
    existing.push(preview);
    grouped.set(row.story_id, existing);
  }

  return grouped;
}

export function formatFeedVideoResponseCount(count: number): string {
  return `${count} video response${count === 1 ? "" : "s"}`;
}
