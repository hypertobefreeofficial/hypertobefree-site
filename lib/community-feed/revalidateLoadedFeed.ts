import { supabase } from "../supabaseClient";
import {
  evaluateCommunityFeedResponseEligibility,
  evaluateCommunityFeedStoryEligibility,
} from "./eligibility";
import type { FeedDisplayItem } from "./enrichFeedItems";
import {
  collectChildResponseDedupeKeys,
  type RealtimeFeedSyncContext,
} from "./realtimeFeedSync";
import { storyDedupeKey, videoResponseDedupeKey } from "./provenance";
import type {
  CommunityFeedStoryRecord,
  CommunityFeedVideoResponseRecord,
} from "./types";

export const REALTIME_REVALIDATION_CHUNK_SIZE = 50;

export type RevalidationTargets = {
  storyIds: string[];
  responseIds: string[];
};

export type RevalidationResult = {
  removalKeys: Set<string>;
  /** Fail closed — omit records that could not be verified. */
  failedClosed: boolean;
};

function chunkIds(ids: string[], chunkSize = REALTIME_REVALIDATION_CHUNK_SIZE) {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += chunkSize) {
    chunks.push(ids.slice(index, index + chunkSize));
  }
  return chunks;
}

export function collectLoadedIdsForRevalidation(
  loaded: FeedDisplayItem[],
  targets: RevalidationTargets
) {
  const loadedStoryIds = new Set(
    loaded
      .filter((item) => item.kind === "story")
      .map((item) => item.id)
  );
  const loadedResponseIds = new Set(
    loaded
      .filter((item) => item.kind === "prayer_video_response")
      .map((item) => item.id)
  );

  return {
    storyIds: targets.storyIds.filter((id) => loadedStoryIds.has(id)),
    responseIds: targets.responseIds.filter((id) => loadedResponseIds.has(id)),
  };
}

export async function revalidateLoadedFeedEligibility(
  loaded: FeedDisplayItem[],
  targets: RevalidationTargets,
  context: RealtimeFeedSyncContext
): Promise<RevalidationResult> {
  const scoped = collectLoadedIdsForRevalidation(loaded, targets);
  const removalKeys = new Set<string>();
  let failedClosed = false;

  if (!context.removedAtFilterAvailable) {
    for (const id of scoped.storyIds) removalKeys.add(storyDedupeKey(id));
    for (const id of scoped.responseIds) {
      removalKeys.add(videoResponseDedupeKey(id));
    }
    return { removalKeys, failedClosed: true };
  }

  for (const storyChunk of chunkIds(scoped.storyIds)) {
    const { data, error } = await supabase
      .from("stories")
      .select("id, user_id, status, removed_at")
      .in("id", storyChunk);

    if (error) {
      console.error(
        "[community-feed] Could not revalidate loaded stories:",
        error.message
      );
      for (const id of storyChunk) removalKeys.add(storyDedupeKey(id));
      failedClosed = true;
      continue;
    }

    const rows = (data ?? []) as Pick<
      CommunityFeedStoryRecord,
      "id" | "user_id" | "status" | "removed_at"
    >[];
    const rowById = new Map(rows.map((row) => [row.id, row]));

    for (const storyId of storyChunk) {
      const row = rowById.get(storyId);
      if (
        !row ||
        !evaluateCommunityFeedStoryEligibility(
          {
            ...row,
            name: null,
            location: null,
            story_type: null,
            story_text: null,
            overlay_text: null,
            overlay_x: null,
            overlay_y: null,
            caption_style: null,
            caption_font: null,
            caption_background: null,
            caption_template: null,
            caption_color: null,
            caption_size: null,
            caption_align: null,
            video_template: null,
            htbf_watermark_enabled: null,
            silhouette_watermark_enabled: null,
            shared_htbf_intro_enabled: null,
            image_url: null,
            video_url: null,
            thumbnail_url: null,
            created_at: null,
            prayer_status: null,
            answered_at: null,
            answered_text: null,
            creation_mode: null,
            ai_suggestions: null,
          },
          context
        )
      ) {
        removalKeys.add(storyDedupeKey(storyId));
        for (const key of collectChildResponseDedupeKeys(loaded, storyId)) {
          removalKeys.add(key);
        }
      }
    }
  }

  for (const responseChunk of chunkIds(scoped.responseIds)) {
    const { data, error } = await supabase
      .from("prayer_video_responses")
      .select("id, story_id, user_id, status, removed_at")
      .in("id", responseChunk);

    if (error) {
      console.error(
        "[community-feed] Could not revalidate loaded responses:",
        error.message
      );
      for (const id of responseChunk) removalKeys.add(videoResponseDedupeKey(id));
      failedClosed = true;
      continue;
    }

    const rows = (data ?? []) as Pick<
      CommunityFeedVideoResponseRecord,
      "id" | "story_id" | "user_id" | "status" | "removed_at"
    >[];
    const rowById = new Map(rows.map((row) => [row.id, row]));

    for (const responseId of responseChunk) {
      const row = rowById.get(responseId);
      if (
        !row ||
        !evaluateCommunityFeedResponseEligibility(row, context)
      ) {
        removalKeys.add(videoResponseDedupeKey(responseId));
        continue;
      }

      const parentId = row.story_id;
      const parentInFeed = loaded.some(
        (item) => item.kind === "story" && item.id === parentId
      );

      if (parentInFeed) continue;

      const { data: parentData, error: parentError } = await supabase
        .from("stories")
        .select("id, user_id, status, removed_at")
        .eq("id", parentId)
        .maybeSingle();

      if (parentError || !parentData) {
        removalKeys.add(videoResponseDedupeKey(responseId));
        continue;
      }

      if (
        !evaluateCommunityFeedStoryEligibility(
          {
            ...(parentData as CommunityFeedStoryRecord),
            name: null,
            location: null,
            story_type: null,
            story_text: null,
            overlay_text: null,
            overlay_x: null,
            overlay_y: null,
            caption_style: null,
            caption_font: null,
            caption_background: null,
            caption_template: null,
            caption_color: null,
            caption_size: null,
            caption_align: null,
            video_template: null,
            htbf_watermark_enabled: null,
            silhouette_watermark_enabled: null,
            shared_htbf_intro_enabled: null,
            image_url: null,
            video_url: null,
            thumbnail_url: null,
            created_at: null,
            prayer_status: null,
            answered_at: null,
            answered_text: null,
            creation_mode: null,
            ai_suggestions: null,
          },
          context
        )
      ) {
        removalKeys.add(videoResponseDedupeKey(responseId));
      }
    }
  }

  return { removalKeys, failedClosed };
}
