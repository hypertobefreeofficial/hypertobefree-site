import { getCreatorStudioSessionPreview } from "./creatorStudioSessionPreview";

export type CreatorStudioFeedStoryMedia = {
  id?: string;
  signed_image_url?: string | null;
  signed_video_url?: string | null;
  signed_thumbnail_url?: string | null;
  video_url?: string | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
};

export function resolveCreatorStudioFeedMediaUrls(
  story: CreatorStudioFeedStoryMedia
) {
  const sessionPreview = story.id
    ? getCreatorStudioSessionPreview(story.id)
    : null;

  const photoPreviewUrl =
    story.signed_image_url ?? sessionPreview?.photoUrl ?? null;
  const videoPreviewUrl =
    story.signed_video_url ??
    story.video_url ??
    sessionPreview?.videoUrl ??
    null;
  const videoPosterUrl = story.signed_thumbnail_url ?? story.thumbnail_url ?? null;

  return {
    photoPreviewUrl,
    videoPreviewUrl,
    videoPosterUrl,
    hasPersistedPhoto: Boolean(story.image_url),
    hasPersistedVideo: Boolean(story.video_url),
    expectsPhoto: Boolean(story.image_url || sessionPreview?.photoUrl),
    expectsVideo: Boolean(story.video_url || sessionPreview?.videoUrl),
  };
}

export { shouldRenderCreatorStudioGradientFallback } from "./creatorStudioMediaLayerState";
