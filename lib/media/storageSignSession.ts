import { supabase } from "../supabaseClient";
import {
  STORY_IMAGE_BUCKET,
  STORY_THUMBNAIL_BUCKET,
  STORY_VIDEO_BUCKET,
  resolveStoryMediaUrl,
} from "../journey/uploads/media";
import {
  getPhotoStoragePath,
  getThumbnailStoragePath,
  getVideoStoragePath,
} from "../community-feed/mediaPaths";

const DEFAULT_TTL_SECONDS = 60 * 60;

type BucketKey = typeof STORY_IMAGE_BUCKET | typeof STORY_VIDEO_BUCKET | typeof STORY_THUMBNAIL_BUCKET;

/**
 * Deduplicates storage signing within a single page load.
 * Each unique bucket+path pair is signed at most once.
 */
export class StorageSignSession {
  private readonly cache = new Map<string, Promise<string | null>>();
  private signOperations = 0;

  getSignOperationCount() {
    return this.signOperations;
  }

  private cacheKey(bucket: string, path: string) {
    return `${bucket}:${path}`;
  }

  private async signPath(
    bucket: BucketKey,
    path: string,
    ttlSeconds = DEFAULT_TTL_SECONDS
  ): Promise<string | null> {
    const key = this.cacheKey(bucket, path);
    const existing = this.cache.get(key);
    if (existing) return existing;

    this.signOperations += 1;
    const pending = (async () => {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, ttlSeconds);
      if (error) {
        console.error(`Could not create signed URL for ${bucket}:`, error.message);
        return null;
      }
      return data?.signedUrl ?? null;
    })();

    this.cache.set(key, pending);
    return pending;
  }

  async signImageUrl(imageUrl: string | null | undefined) {
    if (!imageUrl) return null;
    const path = getPhotoStoragePath(imageUrl);
    if (path) return this.signPath(STORY_IMAGE_BUCKET, path);
    return imageUrl.startsWith("http") ? imageUrl : null;
  }

  async signVideoUrl(videoUrl: string | null | undefined) {
    if (!videoUrl) return null;
    const path = getVideoStoragePath(videoUrl);
    if (path) return this.signPath(STORY_VIDEO_BUCKET, path);
    return videoUrl.startsWith("http") ? videoUrl : null;
  }

  async signThumbnailUrl(thumbnailUrl: string | null | undefined) {
    if (!thumbnailUrl) return null;
    const thumbPath = getThumbnailStoragePath(thumbnailUrl);
    if (thumbPath) {
      const signed = await this.signPath(STORY_THUMBNAIL_BUCKET, thumbPath);
      if (signed) return signed;
    }
    return (
      (await resolveStoryMediaUrl(thumbnailUrl, STORY_THUMBNAIL_BUCKET)) ??
      (await resolveStoryMediaUrl(thumbnailUrl, STORY_IMAGE_BUCKET)) ??
      (thumbnailUrl.startsWith("http") ? thumbnailUrl : null)
    );
  }
}

export async function attachResolvedMediaToRequestsWithSession<
  T extends {
    imageUrl?: string | null;
    videoUrl?: string | null;
    thumbnailUrl?: string | null;
  },
>(requests: T[], session = new StorageSignSession()) {
  return Promise.all(
    requests.map(async (request) => {
      const [imageUrl, posterUrl, videoUrl] = await Promise.all([
        session.signImageUrl(request.imageUrl),
        session.signThumbnailUrl(request.thumbnailUrl),
        session.signVideoUrl(request.videoUrl),
      ]);

      return {
        ...request,
        imageUrl,
        thumbnailUrl: posterUrl || imageUrl,
        videoUrl,
      };
    })
  );
}
