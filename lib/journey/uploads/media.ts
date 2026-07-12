import { supabase } from "../../supabaseClient";

/**
 * Follow-up: every uploaded video should eventually generate one optimized
 * thumbnail/poster during the upload pipeline.
 *
 * Recommended future thumbnail specification:
 * - WebP or JPEG
 * - approximately 480–720px wide
 * - optimized file size
 * - stored separately from the original video
 * - URL stored with the media/story record (e.g. thumbnail_url)
 * - deleted when the underlying upload is permanently deleted
 */

export const STORY_IMAGE_BUCKET = "story-images";
export const STORY_VIDEO_BUCKET = "story-videos";

function getStoragePath(value: string, bucket: string): string | null {
  if (!value || value.startsWith("http")) return null;

  if (value.includes(`${bucket}/`)) {
    const afterBucket = value.split(`${bucket}/`)[1];
    return decodeURIComponent(afterBucket.split("?")[0]);
  }

  return value;
}

export async function resolveStoryMediaUrl(
  value: string | null | undefined,
  bucket: string
): Promise<string | null> {
  if (!value) return null;
  if (value.startsWith("http")) return value;

  const storagePath = getStoragePath(value, bucket);
  if (!storagePath) return null;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60 * 60);

  if (error) {
    console.error(`Could not resolve ${bucket} media:`, error);
    return null;
  }

  return data.signedUrl;
}

export function getUploadPosterSource(upload: {
  thumbnail_url?: string | null;
  image_url?: string | null;
  signed_thumbnail_url?: string | null;
  signed_image_url?: string | null;
}) {
  return (
    upload.signed_thumbnail_url ||
    upload.thumbnail_url ||
    upload.signed_image_url ||
    upload.image_url ||
    null
  );
}

export function getUploadVideoSource(upload: {
  video_url?: string | null;
  signed_video_url?: string | null;
}) {
  return upload.signed_video_url || upload.video_url || null;
}

export function getUploadImageSource(upload: {
  image_url?: string | null;
  signed_image_url?: string | null;
}) {
  return upload.signed_image_url || upload.image_url || null;
}
