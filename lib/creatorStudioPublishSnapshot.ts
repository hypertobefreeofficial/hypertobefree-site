import type { CreatorStudioDesign } from "./creationCenter";

export type CreatorStudioPublishSnapshot = {
  design: CreatorStudioDesign;
  photoPreviewUrl: string | null;
  videoPreviewUrl: string | null;
  expectsPhoto: boolean;
  expectsVideo: boolean;
};

function revokeBlobUrl(url: string | null | undefined) {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export function buildCreatorStudioPublishSnapshot(input: {
  design: CreatorStudioDesign;
  photoFile: File | null;
  videoFile: File | null;
  photoPreviewUrl: string | null;
  videoPreviewUrl: string | null;
}): CreatorStudioPublishSnapshot {
  const expectsPhoto = Boolean(input.photoFile || input.photoPreviewUrl);
  const expectsVideo = Boolean(input.videoFile || input.videoPreviewUrl);

  const photoPreviewUrl = input.photoFile
    ? URL.createObjectURL(input.photoFile)
    : input.photoPreviewUrl;
  const videoPreviewUrl = input.videoFile
    ? URL.createObjectURL(input.videoFile)
    : input.videoPreviewUrl;

  return {
    design: input.design,
    photoPreviewUrl,
    videoPreviewUrl,
    expectsPhoto,
    expectsVideo,
  };
}

export function revokeCreatorStudioPublishSnapshotMedia(
  snapshot: CreatorStudioPublishSnapshot | null | undefined
) {
  if (!snapshot) return;

  revokeBlobUrl(snapshot.photoPreviewUrl);
  revokeBlobUrl(snapshot.videoPreviewUrl);
}
