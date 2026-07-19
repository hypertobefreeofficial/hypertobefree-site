import { supabase } from "../supabaseClient";
import {
  applyGenuinePublicDemoFilter,
  filterGenuinePublicDemoRows,
  getDemoContentSchemaCapabilities,
} from "../demo-content/eligibility";
import { getCommunityFeedSchemaCapabilities } from "./schemaCapabilities";
import { StorageSignSession } from "../media/storageSignSession";

export type FeedApprovedVideoResponsePreview = {
  id: string;
  user_id: string;
  authorName: string | null;
  authorUsername: string | null;
  body: string | null;
  signed_video_url: string | null;
  signed_thumbnail_url: string | null;
  created_at: string;
  response_context?: string | null;
};

async function signVideoUrl(
  videoUrl: string | null,
  session: StorageSignSession
): Promise<string | null> {
  return session.signVideoUrl(videoUrl);
}

async function signThumbnailUrl(
  thumbnailUrl: string | null,
  session: StorageSignSession
): Promise<string | null> {
  return session.signThumbnailUrl(thumbnailUrl);
}

export async function loadApprovedVideoResponsesByStoryIds(
  storyIds: string[],
  session: StorageSignSession = new StorageSignSession()
): Promise<Map<string, FeedApprovedVideoResponsePreview[]>> {
  const grouped = new Map<string, FeedApprovedVideoResponsePreview[]>();
  if (storyIds.length === 0) return grouped;

  storyIds.forEach((id) => grouped.set(id, []));

  const capabilities = await getCommunityFeedSchemaCapabilities();
  const demoCapabilities = await getDemoContentSchemaCapabilities();
  let query = supabase
    .from("prayer_video_responses")
    .select(
      "id, story_id, user_id, video_url, thumbnail_url, body, created_at, status, removed_at, response_context, is_demo"
    )
    .in("story_id", storyIds)
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  query = applyGenuinePublicDemoFilter(
    query,
    "prayer_video_responses",
    demoCapabilities
  );

  if (capabilities.prayerVideoResponses.hasRemovedAt) {
    query = query.is("removed_at", null);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Could not load approved parent video responses:", error);
    return grouped;
  }

  const rows = filterGenuinePublicDemoRows(
    ((data as {
      id: string;
      story_id: string;
      user_id: string;
      video_url: string | null;
      thumbnail_url: string | null;
      body: string | null;
      created_at: string;
      response_context?: string | null;
      is_demo?: boolean | null;
    }[]) ?? []) as Array<{
      id: string;
      story_id: string;
      user_id: string;
      video_url: string | null;
      thumbnail_url: string | null;
      body: string | null;
      created_at: string;
      response_context?: string | null;
      is_demo?: boolean | null;
    }>
  );

  const authorIds = [...new Set(rows.map((row) => row.user_id))];
  const authorNames = new Map<string, string>();
  const authorUsernames = new Map<string, string>();

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
      if (profile.username?.trim()) {
        authorUsernames.set(profile.id, profile.username.trim());
      }
    });
  }

  for (const row of rows) {
    const [signed_video_url, signed_thumbnail_url] = await Promise.all([
      signVideoUrl(row.video_url, session),
      signThumbnailUrl(row.thumbnail_url, session),
    ]);

    const preview: FeedApprovedVideoResponsePreview = {
      id: row.id,
      user_id: row.user_id,
      authorName: authorNames.get(row.user_id) ?? null,
      authorUsername: authorUsernames.get(row.user_id) ?? null,
      body: row.body,
      signed_video_url,
      signed_thumbnail_url,
      created_at: row.created_at,
      response_context: row.response_context ?? null,
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
