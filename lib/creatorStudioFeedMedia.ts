import { getCreationCenterTemplate } from "./creationCenter";
import type { CreatorStudioDesign } from "./creationCenter";

export type CreatorStudioFeedStoryMedia = {
  signed_image_url?: string | null;
  signed_video_url?: string | null;
  video_url?: string | null;
  image_url?: string | null;
};

export function resolveCreatorStudioFeedMediaUrls(
  story: CreatorStudioFeedStoryMedia
) {
  return {
    photoPreviewUrl: story.signed_image_url ?? null,
    videoPreviewUrl: story.signed_video_url ?? story.video_url ?? null,
    hasPersistedPhoto: Boolean(story.image_url),
    hasPersistedVideo: Boolean(story.video_url),
  };
}

export function shouldRenderCreatorStudioGradientFallback(options: {
  photoPreviewUrl?: string | null;
  videoPreviewUrl?: string | null;
  generatedImageUrl?: string | null;
  templateId?: CreatorStudioDesign["templateId"];
}) {
  const templateImagePath = options.templateId
    ? getCreationCenterTemplate(options.templateId).imagePath
    : null;

  return !(
    options.photoPreviewUrl ||
    options.videoPreviewUrl ||
    options.generatedImageUrl ||
    templateImagePath
  );
}
