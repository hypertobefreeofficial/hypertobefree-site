import {
  STORY_IMAGE_BUCKET,
  STORY_THUMBNAIL_BUCKET,
  STORY_VIDEO_BUCKET,
  getUploadImageSource,
  getUploadPosterSource,
  getUploadVideoSource,
  resolveStoryMediaUrl,
} from "../journey/uploads/media";
import type { PrayerConnectMediaKind, PrayerConnectRequest } from "./types";
import { attachResolvedMediaToRequestsWithSession } from "../media/storageSignSession";
import {
  createVideoThumbnailFromFile,
  thumbnailFailureMessage,
} from "./videoThumbnail";

export {
  STORY_IMAGE_BUCKET,
  STORY_THUMBNAIL_BUCKET,
  STORY_VIDEO_BUCKET,
  resolveStoryMediaUrl,
};

export type PrayerVideoUploadResult = {
  videoUrl: string;
  thumbnailUrl: string | null;
  thumbnailFailed: boolean;
  thumbnailError: string | null;
};

export type ResolvedPrayerMedia = {
  posterUrl: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
};

async function resolveThumbnailUrl(
  thumbnailUrl: string | null | undefined
): Promise<string | null> {
  if (!thumbnailUrl) return null;

  for (const bucket of [
    STORY_THUMBNAIL_BUCKET,
    STORY_IMAGE_BUCKET,
    STORY_VIDEO_BUCKET,
  ]) {
    const resolved = await resolveStoryMediaUrl(thumbnailUrl, bucket);
    if (resolved) return resolved;
  }

  return null;
}

export async function resolvePrayerRequestMedia(
  request: Pick<
    PrayerConnectRequest,
    "imageUrl" | "videoUrl" | "thumbnailUrl" | "mediaKind"
  >
): Promise<ResolvedPrayerMedia> {
  const [signedImage, signedThumbnail, signedVideo] = await Promise.all([
    resolveStoryMediaUrl(request.imageUrl, STORY_IMAGE_BUCKET),
    resolveThumbnailUrl(request.thumbnailUrl),
    resolveStoryMediaUrl(request.videoUrl, STORY_VIDEO_BUCKET),
  ]);

  // The poster must always be an *image* URL. A video file URL must never be
  // used as an <img> source (it fails to load and falls back to the generic
  // placeholder). If a video has no thumbnail/image, we leave the poster null
  // and the card intentionally renders the branded video fallback.
  const posterUrl = signedThumbnail || signedImage || null;

  return {
    posterUrl,
    imageUrl: signedImage,
    videoUrl: signedVideo,
  };
}

export async function attachResolvedMediaToRequests(
  requests: PrayerConnectRequest[]
): Promise<PrayerConnectRequest[]> {
  return attachResolvedMediaToRequestsWithSession(requests);
}

export function getPrayerCardPoster(request: {
  mediaKind: PrayerConnectMediaKind;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
}) {
  return request.thumbnailUrl || request.imageUrl || null;
}

export function getPrayerDetailVideoSource(request: {
  videoUrl?: string | null;
  signed_video_url?: string | null;
}) {
  return getUploadVideoSource({
    video_url: request.videoUrl,
    signed_video_url: request.signed_video_url,
  });
}

export function getPrayerDetailImageSource(request: {
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  signed_image_url?: string | null;
  signed_thumbnail_url?: string | null;
}) {
  return (
    getUploadPosterSource({
      thumbnail_url: request.thumbnailUrl,
      image_url: request.imageUrl,
      signed_thumbnail_url: request.signed_thumbnail_url,
      signed_image_url: request.signed_image_url,
    }) || getUploadImageSource(request)
  );
}

export async function uploadPrayerThumbnail(
  userId: string,
  blob: Blob,
  mimeType: "image/webp" | "image/jpeg"
) {
  const extension = mimeType === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const { supabase } = await import("../supabaseClient");
  const { error } = await supabase.storage
    .from(STORY_THUMBNAIL_BUCKET)
    .upload(path, blob, {
      cacheControl: "3600",
      upsert: false,
      contentType: mimeType,
    });

  if (error) throw new Error(error.message);
  return path;
}

export async function uploadPrayerVideoWithThumbnail(
  userId: string,
  file: File
): Promise<PrayerVideoUploadResult> {
  const extension = file.name.split(".").pop()?.toLowerCase() || "mp4";
  const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const { supabase } = await import("../supabaseClient");
  const { error } = await supabase.storage.from(STORY_VIDEO_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "video/mp4",
  });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(STORY_VIDEO_BUCKET).getPublicUrl(path);
  const videoUrl = data.publicUrl;

  try {
    const thumbnail = await createVideoThumbnailFromFile(file);
    const thumbnailPath = await uploadPrayerThumbnail(
      userId,
      thumbnail.blob,
      thumbnail.mimeType
    );
    return {
      videoUrl,
      thumbnailUrl: thumbnailPath,
      thumbnailFailed: false,
      thumbnailError: null,
    };
  } catch (thumbnailError) {
    console.warn("Prayer video thumbnail generation failed:", thumbnailError);
    return {
      videoUrl,
      thumbnailUrl: null,
      thumbnailFailed: true,
      thumbnailError: thumbnailFailureMessage(thumbnailError),
    };
  }
}

/** @deprecated Prefer uploadPrayerVideoWithThumbnail for prayer uploads. */
export async function uploadPrayerVideo(userId: string, file: File) {
  const result = await uploadPrayerVideoWithThumbnail(userId, file);
  return result.videoUrl;
}

export async function uploadPrayerPhoto(userId: string, file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const { supabase } = await import("../supabaseClient");
  const { error } = await supabase.storage
    .from(STORY_IMAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });

  if (error) throw new Error(error.message);
  return path;
}
