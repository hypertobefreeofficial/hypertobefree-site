import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { STORY_IMAGE_BUCKET, STORY_VIDEO_BUCKET } from "../journey/uploads/media";

export const PRAYER_MEDIA_LIMITS = {
  originalVideoSeconds: 120,
  publicResponseVideoSeconds: 30,
  privateResponseVideoSeconds: 30,
  updateVideoSeconds: 60,
  maxVideoBytes: 100 * 1024 * 1024,
  maxImageBytes: 10 * 1024 * 1024,
} as const;

const VIDEO_MIME_ALLOWLIST = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/3gpp",
  "video/3gp",
  "video/mpeg",
]);

const IMAGE_MIME_ALLOWLIST = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

export type ParsedStorageObject = {
  bucket: string;
  path: string;
};

export type StorageObjectMetadata = {
  sizeBytes: number;
  mimeType: string | null;
};

export type MediaValidationResult =
  | { ok: true; metadata: StorageObjectMetadata }
  | { ok: false; error: string; code: string };

/** Parse a Supabase public/signed URL or raw storage path into bucket + path. */
export function parseSupabaseStorageUrl(
  value: string,
  expectedBucket: string
): ParsedStorageObject | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!trimmed.startsWith("http")) {
    const path = trimmed.replace(/^\/+/, "");
    return path ? { bucket: expectedBucket, path } : null;
  }

  try {
    const url = new URL(trimmed);
    const marker = `/storage/v1/object/public/${expectedBucket}/`;
    const signedMarker = `/storage/v1/object/sign/${expectedBucket}/`;
    const pathIndex = url.pathname.includes(marker)
      ? url.pathname.indexOf(marker) + marker.length
      : url.pathname.includes(signedMarker)
        ? url.pathname.indexOf(signedMarker) + signedMarker.length
        : -1;

    if (pathIndex === -1) {
      // Legacy URLs may embed the bucket name in the path segment.
      const embedded = `${expectedBucket}/`;
      if (trimmed.includes(embedded)) {
        const after = trimmed.split(embedded)[1]?.split("?")[0];
        if (after) {
          return {
            bucket: expectedBucket,
            path: decodeURIComponent(after),
          };
        }
      }
      return null;
    }

    const path = decodeURIComponent(url.pathname.slice(pathIndex));
    return path ? { bucket: expectedBucket, path } : null;
  } catch {
    return null;
  }
}

function normalizeMime(value: string | null | undefined) {
  if (!value) return null;
  const lower = value.toLowerCase().split(";")[0]?.trim();
  return lower || null;
}

function inferMimeFromPath(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return null;
  }
}

/**
 * Read object metadata from Supabase Storage without downloading the file body.
 * Uses folder listing metadata (size, mimetype) — suitable for Vercel/serverless.
 */
export async function getStorageObjectMetadata(
  adminClient: SupabaseClient,
  bucket: string,
  path: string
): Promise<StorageObjectMetadata | null> {
  const normalizedPath = path.replace(/^\/+/, "");
  const slash = normalizedPath.lastIndexOf("/");
  const folder = slash >= 0 ? normalizedPath.slice(0, slash) : "";
  const filename =
    slash >= 0 ? normalizedPath.slice(slash + 1) : normalizedPath;

  const { data, error } = await adminClient.storage.from(bucket).list(folder, {
    limit: 100,
    search: filename,
  });

  if (error) {
    console.error("Storage metadata list failed:", error.message);
    return null;
  }

  const entry = (data ?? []).find((item) => item.name === filename);
  if (!entry) return null;

  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  const sizeRaw = meta.size ?? meta.contentLength ?? meta.ContentLength;
  const sizeBytes =
    typeof sizeRaw === "number"
      ? sizeRaw
      : typeof sizeRaw === "string"
        ? Number(sizeRaw)
        : 0;

  const mimeType =
    normalizeMime(
      typeof meta.mimetype === "string"
        ? meta.mimetype
        : typeof meta.contentType === "string"
          ? meta.contentType
          : null
    ) ?? inferMimeFromPath(filename);

  return {
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : 0,
    mimeType,
  };
}

export function assertStoragePathOwnedByUser(path: string, userId: string) {
  const normalized = path.replace(/^\/+/, "");
  return (
    normalized.startsWith(`${userId}/`) ||
    normalized.startsWith(`prayer-videos/${userId}/`)
  );
}

export async function validateUploadedVideoObject(options: {
  adminClient: SupabaseClient;
  videoUrl: string;
  ownerUserId: string;
  maxBytes: number;
}): Promise<MediaValidationResult> {
  const parsed = parseSupabaseStorageUrl(options.videoUrl, STORY_VIDEO_BUCKET);
  if (!parsed) {
    return {
      ok: false,
      error: "Video must be uploaded through HTBF storage.",
      code: "invalid_storage_url",
    };
  }

  if (!assertStoragePathOwnedByUser(parsed.path, options.ownerUserId)) {
    return {
      ok: false,
      error: "You can only attach videos you uploaded.",
      code: "ownership_mismatch",
    };
  }

  const metadata = await getStorageObjectMetadata(
    options.adminClient,
    parsed.bucket,
    parsed.path
  );

  if (!metadata) {
    return {
      ok: false,
      error: "Could not verify the uploaded video. Please upload again.",
      code: "metadata_unavailable",
    };
  }

  if (metadata.sizeBytes <= 0) {
    return {
      ok: false,
      error: "The uploaded video could not be verified.",
      code: "empty_object",
    };
  }

  if (metadata.sizeBytes > options.maxBytes) {
    return {
      ok: false,
      error: `Videos must be ${Math.round(options.maxBytes / (1024 * 1024))} MB or smaller.`,
      code: "file_too_large",
    };
  }

  const mime = metadata.mimeType;
  if (mime && !VIDEO_MIME_ALLOWLIST.has(mime) && !mime.startsWith("video/")) {
    return {
      ok: false,
      error: "This file type is not allowed for video prayers.",
      code: "mime_not_allowed",
    };
  }

  return { ok: true, metadata };
}

export async function validateUploadedImageObject(options: {
  adminClient: SupabaseClient;
  imagePathOrUrl: string;
  ownerUserId: string;
  maxBytes: number;
}): Promise<MediaValidationResult> {
  const parsed =
    parseSupabaseStorageUrl(options.imagePathOrUrl, STORY_IMAGE_BUCKET) ??
    (options.imagePathOrUrl.startsWith("http")
      ? null
      : {
          bucket: STORY_IMAGE_BUCKET,
          path: options.imagePathOrUrl.replace(/^\/+/, ""),
        });

  if (!parsed) {
    return {
      ok: false,
      error: "Image must be uploaded through HTBF storage.",
      code: "invalid_storage_url",
    };
  }

  if (!assertStoragePathOwnedByUser(parsed.path, options.ownerUserId)) {
    return {
      ok: false,
      error: "You can only attach images you uploaded.",
      code: "ownership_mismatch",
    };
  }

  const metadata = await getStorageObjectMetadata(
    options.adminClient,
    parsed.bucket,
    parsed.path
  );

  if (!metadata || metadata.sizeBytes <= 0) {
    return {
      ok: false,
      error: "Could not verify the uploaded image. Please upload again.",
      code: "metadata_unavailable",
    };
  }

  if (metadata.sizeBytes > options.maxBytes) {
    return {
      ok: false,
      error: `Images must be ${Math.round(options.maxBytes / (1024 * 1024))} MB or smaller.`,
      code: "file_too_large",
    };
  }

  const mime = metadata.mimeType;
  if (mime && !IMAGE_MIME_ALLOWLIST.has(mime) && !mime.startsWith("image/")) {
    return {
      ok: false,
      error: "This file type is not allowed for prayer photos.",
      code: "mime_not_allowed",
    };
  }

  return { ok: true, metadata };
}

/**
 * Trusted server-side video duration validation is NOT available in this stack.
 * Supabase Storage metadata does not include duration; probing requires a
 * worker with ffprobe (or similar) on the object without proxying through Vercel.
 *
 * Required infrastructure (future):
 * - Post-upload webhook / queue worker (Supabase Edge Function, Cloudflare Worker,
 *   or background job) that downloads object headers or streams to ffprobe
 * - Writes validated duration to a media registry row
 * - Only then may public prayer video responses be auto-approved
 */
export const VIDEO_DURATION_SERVER_PROBE_REQUIRED = true;

export { STORY_IMAGE_BUCKET, STORY_VIDEO_BUCKET, VIDEO_MIME_ALLOWLIST };
