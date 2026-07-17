import { supabase } from "../supabaseClient";
import type { FaithResponsesViewerModel } from "../../components/public-video-responses/FaithResponsesViewer";
import { loadApprovedVideoResponsesByStoryIds } from "../community-feed/loadParentApprovedVideoResponses";
import { getThumbnailStoragePath } from "../community-feed/mediaPaths";
import {
  STORY_THUMBNAIL_BUCKET,
  resolveStoryMediaUrl,
} from "../journey/uploads/media";
import { resolveResponseContextFromStory } from "./publicVideoResponseContext";

async function signParentThumbnail(
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

export async function loadFaithResponsesViewerModel(
  parentStoryId: string,
  initialResponseId?: string | null
): Promise<FaithResponsesViewerModel | null> {
  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select("id, name, story_text, thumbnail_url, story_type, user_id")
    .eq("id", parentStoryId)
    .maybeSingle();

  if (storyError || !story) {
    console.error("Faith Responses: could not load parent story", storyError);
    return null;
  }

  const approvedMap = await loadApprovedVideoResponsesByStoryIds([parentStoryId]);
  const responses = approvedMap.get(parentStoryId) ?? [];
  const parentThumbnailUrl = await signParentThumbnail(story.thumbnail_url);

  return {
    parentStoryId,
    parentAuthorName: story.name ?? null,
    parentCaption: story.story_text ?? null,
    parentThumbnailUrl,
    parentOwnerUserId: story.user_id ?? null,
    responseContext: resolveResponseContextFromStory(story),
    responses,
    initialResponseId,
  };
}
