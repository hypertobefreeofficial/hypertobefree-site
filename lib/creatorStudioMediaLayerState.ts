import { getCreationCenterTemplate } from "./creationCenter";
import type { CreatorStudioDesign } from "./creationCenter";

export type CreatorStudioMediaLayerRenderState =
  | "photo"
  | "video"
  | "loading-photo"
  | "loading-video"
  | "generated-image"
  | "template-image"
  | "fallback";

export function resolveCreatorStudioMediaLayerRenderState(options: {
  photoPreviewUrl?: string | null;
  videoPreviewUrl?: string | null;
  generatedImageUrl?: string | null;
  templateId?: CreatorStudioDesign["templateId"];
  expectsPhoto?: boolean;
  expectsVideo?: boolean;
  photoFailed?: boolean;
  videoFailed?: boolean;
}): CreatorStudioMediaLayerRenderState {
  if (options.photoPreviewUrl) return "photo";
  if (options.videoPreviewUrl) return "video";

  if (options.expectsPhoto && !options.photoFailed) return "loading-photo";
  if (options.expectsVideo && !options.videoFailed) return "loading-video";

  if (options.generatedImageUrl) return "generated-image";

  const templateImagePath = options.templateId
    ? getCreationCenterTemplate(options.templateId).imagePath
    : null;
  if (templateImagePath) return "template-image";

  return "fallback";
}

export function shouldRenderCreatorStudioGradientFallback(options: {
  photoPreviewUrl?: string | null;
  videoPreviewUrl?: string | null;
  generatedImageUrl?: string | null;
  templateId?: CreatorStudioDesign["templateId"];
  expectsPhoto?: boolean;
  expectsVideo?: boolean;
  photoFailed?: boolean;
  videoFailed?: boolean;
}) {
  return (
    resolveCreatorStudioMediaLayerRenderState(options) === "fallback"
  );
}
