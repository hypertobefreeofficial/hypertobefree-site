/**
 * Pure storage reference rules shared by Phase 1A manifest and Phase 1D execution.
 * Principles adapted from legacy inbox migration collision analysis — no migration imports.
 */

import { normalizeStorageObjectPath } from "./accountDeletionStorageKeys";

export const LEGACY_STORY_VIDEO_PREFIXES = [
  "prayer-videos/",
  "prayer-video-replies/",
  "prayer-public-responses/",
] as const;

export type LegacyStoryVideoPrefix =
  (typeof LEGACY_STORY_VIDEO_PREFIXES)[number];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UUID_PREFIX_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\//i;

export const JOURNEY_REFERENCE_INVENTORY_INCOMPLETE_NOTE =
  "Journey inbox media reference inventory is incomplete. Private Journey storage cleanup is blocked until all target-related inbox media URLs resolve canonically.";

export const PREFIX_DISCOVERY_NOT_DELETION_AUTHORITY_NOTE =
  "Storage prefix discovery alone does not authorize private deletion. Authoritative inbox DB references are required.";

export const PATH_PREFIX_DISCOVERY_SOURCE_PREFIX = "path_prefix_discovery:";

const SUPABASE_OBJECT_MARKERS = [
  "/storage/v1/object/public/",
  "/storage/v1/object/sign/",
  "/storage/v1/object/authenticated/",
] as const;

export function normalizeUuidForComparison(value: string): string {
  return value.trim().toLowerCase();
}

export function uuidEquals(left: string, right: string): boolean {
  return normalizeUuidForComparison(left) === normalizeUuidForComparison(right);
}

export function decodeStoragePathSegmentOnce(segment: string): string | null {
  if (!segment) {
    return null;
  }

  if (!segment.includes("%")) {
    return segment;
  }

  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export function parseSupabaseStorageObjectUrl(input: {
  value: string;
  expectedBucket?: string;
}): { bucket: string | null; objectPath: string | null; ownershipSource: string } {
  const trimmed = input.value.trim();
  if (!trimmed) {
    return { bucket: null, objectPath: null, ownershipSource: "missing_reference" };
  }

  if (!trimmed.startsWith("http")) {
    return { bucket: null, objectPath: null, ownershipSource: "ambiguous_reference" };
  }

  let pathname: string;
  try {
    pathname = new URL(trimmed).pathname;
  } catch {
    return { bucket: null, objectPath: null, ownershipSource: "ambiguous_reference" };
  }

  for (const marker of SUPABASE_OBJECT_MARKERS) {
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex === -1) {
      continue;
    }

    const afterMarker = pathname.slice(markerIndex + marker.length);
    const slashIndex = afterMarker.indexOf("/");
    if (slashIndex === -1) {
      return { bucket: null, objectPath: null, ownershipSource: "ambiguous_reference" };
    }

    const bucket = afterMarker.slice(0, slashIndex);
    const encodedPath = afterMarker.slice(slashIndex + 1);
    const objectPath = decodeStoragePathSegmentOnce(encodedPath);

    if (!bucket || !objectPath) {
      return { bucket: null, objectPath: null, ownershipSource: "ambiguous_reference" };
    }

    if (input.expectedBucket && bucket !== input.expectedBucket) {
      return { bucket, objectPath: null, ownershipSource: "ambiguous_reference" };
    }

    const ownershipSource =
      marker === "/storage/v1/object/public/"
        ? "https_public_storage_url"
        : marker === "/storage/v1/object/sign/"
          ? "https_signed_storage_url"
          : "https_authenticated_storage_url";

    return { bucket, objectPath: normalizeStorageObjectPath(objectPath), ownershipSource };
  }

  return { bucket: null, objectPath: null, ownershipSource: "ambiguous_reference" };
}

export function parsePublicStorageUrl(value: string): {
  bucket: string | null;
  objectPath: string | null;
} {
  const parsed = parseSupabaseStorageObjectUrl({ value });
  if (parsed.ownershipSource !== "https_public_storage_url") {
    return { bucket: parsed.bucket, objectPath: parsed.objectPath };
  }

  return { bucket: parsed.bucket, objectPath: parsed.objectPath };
}

export function classifyStoryVideoObjectPath(
  objectPath: string | null | undefined
):
  | "user_uuid_root"
  | "legacy_prayer_videos"
  | "legacy_prayer_video_replies"
  | "legacy_prayer_public_responses"
  | "other_legacy"
  | "unparseable" {
  if (!objectPath) {
    return "unparseable";
  }

  if (objectPath.startsWith("prayer-videos/")) {
    return "legacy_prayer_videos";
  }
  if (objectPath.startsWith("prayer-video-replies/")) {
    return "legacy_prayer_video_replies";
  }
  if (objectPath.startsWith("prayer-public-responses/")) {
    return "legacy_prayer_public_responses";
  }
  if (UUID_PREFIX_PATTERN.test(objectPath)) {
    return "user_uuid_root";
  }

  return "other_legacy";
}

export function isAuthoritativeTargetOwnedUuidPath(
  objectPath: string,
  targetUserId: string
): boolean {
  const segments = normalizeStorageObjectPath(objectPath).split("/");
  const ownerSegment = segments[0];
  if (!ownerSegment || !UUID_PATTERN.test(ownerSegment)) {
    return false;
  }

  return uuidEquals(ownerSegment, targetUserId);
}

export function isLegacyStoryVideoPathWithoutTargetOwnership(
  objectPath: string,
  targetUserId: string
): boolean {
  if (isAuthoritativeTargetOwnedUuidPath(objectPath, targetUserId)) {
    return false;
  }

  const legacyKind = classifyStoryVideoObjectPath(objectPath);
  return legacyKind !== "user_uuid_root" && legacyKind !== "unparseable";
}

export function resolveStorageReference(input: {
  value: string | null | undefined;
  bucket: string;
}): { path: string | null; ownershipSource: string } {
  if (!input.value || typeof input.value !== "string") {
    return { path: null, ownershipSource: "missing_reference" };
  }

  const trimmed = input.value.trim();
  if (!trimmed) {
    return { path: null, ownershipSource: "missing_reference" };
  }

  if (trimmed.startsWith("http")) {
    const parsed = parseSupabaseStorageObjectUrl({
      value: trimmed,
      expectedBucket: input.bucket,
    });
    if (parsed.bucket === input.bucket && parsed.objectPath) {
      return {
        path: parsed.objectPath,
        ownershipSource: parsed.ownershipSource,
      };
    }

    return { path: null, ownershipSource: "ambiguous_reference" };
  }

  if (trimmed.includes(`${input.bucket}/`)) {
    const afterBucket = trimmed.split(`${input.bucket}/`)[1]?.split(/[?#]/)[0];
    if (!afterBucket) {
      return { path: null, ownershipSource: "ambiguous_reference" };
    }

    const decoded = decodeStoragePathSegmentOnce(afterBucket);
    if (!decoded) {
      return { path: null, ownershipSource: "ambiguous_reference" };
    }

    return {
      path: normalizeStorageObjectPath(decoded),
      ownershipSource: `bucket_reference:${input.bucket}`,
    };
  }

  if (trimmed.includes("/")) {
    const rawPath = trimmed.replace(/^\/+/, "").split(/[?#]/)[0];
    if (!rawPath || rawPath.includes("://")) {
      return { path: null, ownershipSource: "ambiguous_reference" };
    }

    return {
      path: normalizeStorageObjectPath(rawPath),
      ownershipSource: "raw_storage_path",
    };
  }

  return { path: null, ownershipSource: "ambiguous_reference" };
}

export function isPrefixDiscoveryOwnershipSource(ownershipSource: string): boolean {
  return ownershipSource.startsWith(PATH_PREFIX_DISCOVERY_SOURCE_PREFIX);
}

export function isPrayerVideoResponseOwnershipSource(
  ownershipSource: string
): boolean {
  return ownershipSource.startsWith("prayer_video_responses.");
}

export function isSentInboxCopyOwnershipSource(ownershipSource: string): boolean {
  return ownershipSource.includes(
    "inbox_messages.sender_user_id (sent copy in other inbox)"
  );
}

export function isRecipientOwnedInboxOwnershipSource(
  ownershipSource: string
): boolean {
  return ownershipSource.includes("inbox_messages.user_id (recipient-owned)");
}

export function isPublicStoryOwnershipSource(ownershipSource: string): boolean {
  return (
    ownershipSource.startsWith("stories.") ||
    ownershipSource === "path_prefix_story_media"
  );
}

export function isUnresolvedJourneyReferenceOwnershipSource(
  ownershipSource: string
): boolean {
  return ownershipSource === "ambiguous_reference";
}

export function hasSharedSurvivingReferenceFromSources(
  ownershipSources: string[]
): boolean {
  return ownershipSources.some(isSentInboxCopyOwnershipSource);
}

export function hasPublicPreservationReferenceFromSources(
  ownershipSources: string[]
): boolean {
  return ownershipSources.some(
    (source) =>
      isPublicStoryOwnershipSource(source) ||
      isPrayerVideoResponseOwnershipSource(source)
  );
}

export function resolveInboxJourneyOwnershipSource(input: {
  rowUserId: string;
  senderUserId: string | null;
  targetUserId: string;
}): string {
  if (uuidEquals(input.rowUserId, input.targetUserId)) {
    return "inbox_messages.user_id (recipient-owned)";
  }

  if (
    input.senderUserId &&
    uuidEquals(input.senderUserId, input.targetUserId)
  ) {
    return "inbox_messages.sender_user_id (sent copy in other inbox)";
  }

  return "ambiguous_reference";
}

export const PRAYER_VIDEO_RESPONSE_PRESERVATION_NOTE =
  "prayer_video_responses rows are anonymized, not deleted. Response media remains visible and must be preserved.";

export const PUBLIC_STORY_MEDIA_PRESERVATION_NOTE =
  "Public stories/testimonies are anonymized in DB while media URLs remain reachable. story-images, story-videos, and story-thumbnails must be preserved for surviving testimony content.";

export const LEGACY_STORY_VIDEO_PRESERVATION_NOTE =
  "Legacy story-videos paths referenced by surviving public testimony or prayer responses must be preserved.";

export const LEGACY_UNREFERENCED_AMBIGUITY_NOTE =
  "Legacy or unreferenced story-videos paths without authoritative target ownership must not be deleted.";
