import type { CreatorStudioDesign } from "./creationCenter";

export type CreatorStudioPublishMediaMode = "photo" | "video" | "text";

export type CreatorStudioPublishMediaResolution = {
  hasPhoto: boolean;
  hasVideo: boolean;
  effectiveMediaMode: CreatorStudioPublishMediaMode;
  isMediaPost: boolean;
  contentType: "photo" | "video" | "testimony-card";
  sourceMode: CreatorStudioDesign["sourceMode"];
};

export function resolveCreatorStudioPublishMedia(input: {
  photoFile: File | null | undefined;
  videoFile: File | null | undefined;
  designSourceMode?: CreatorStudioDesign["sourceMode"];
}): CreatorStudioPublishMediaResolution {
  const hasPhoto = Boolean(input.photoFile);
  const hasVideo = Boolean(input.videoFile);

  const effectiveMediaMode: CreatorStudioPublishMediaMode = hasVideo
    ? "video"
    : hasPhoto
      ? "photo"
      : "text";

  const sourceMode: CreatorStudioDesign["sourceMode"] = hasVideo
    ? "upload-video"
    : hasPhoto
      ? "upload-photo"
      : input.designSourceMode ?? "build-ai";

  return {
    hasPhoto,
    hasVideo,
    effectiveMediaMode,
    isMediaPost: hasPhoto || hasVideo,
    contentType:
      effectiveMediaMode === "video"
        ? "video"
        : effectiveMediaMode === "photo"
          ? "photo"
          : "testimony-card",
    sourceMode,
  };
}
