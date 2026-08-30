/**
 * Account deletion storage classification policy (Phase 4C.7B.1D / 1D.1).
 * Canonical execution classifications shared with Phase 1A manifest dry-run.
 */

import {
  classifyStorageBucketAction,
  type AccountDeletionStorageAction,
  type AccountDeletionStorageBucket,
} from "./accountDeletionPolicy";
import {
  hasPublicPreservationReferenceFromSources,
  hasSharedSurvivingReferenceFromSources,
  isAuthoritativeTargetOwnedUuidPath,
  isLegacyStoryVideoPathWithoutTargetOwnership,
  isPrefixDiscoveryOwnershipSource,
  isPrayerVideoResponseOwnershipSource,
  isPublicStoryOwnershipSource,
  isRecipientOwnedInboxOwnershipSource,
  JOURNEY_REFERENCE_INVENTORY_INCOMPLETE_NOTE,
  LEGACY_STORY_VIDEO_PRESERVATION_NOTE,
  LEGACY_UNREFERENCED_AMBIGUITY_NOTE,
  PREFIX_DISCOVERY_NOT_DELETION_AUTHORITY_NOTE,
  PRAYER_VIDEO_RESPONSE_PRESERVATION_NOTE,
  PUBLIC_STORY_MEDIA_PRESERVATION_NOTE as REFERENCE_PUBLIC_NOTE,
  uuidEquals,
} from "./accountDeletionStorageReferenceRules";
import { normalizeStorageObjectPath } from "./accountDeletionStorageKeys";

export type AccountDeletionStorageClassification =
  | "DELETE_PRIVATE"
  | "PRESERVE_PUBLIC"
  | "PRESERVE_SHARED"
  | "SKIP_UNKNOWN"
  | "BLOCK_UNRESOLVED";

export type AccountDeletionStorageClassificationInput = {
  bucket: string;
  path: string;
  targetUserId: string;
  ownershipSources: string[];
  referencingTable?: string | null;
  journeyReferenceInventoryComplete?: boolean;
};

export const JOURNEY_REFERENCE_INVENTORY_INCOMPLETE_CODE =
  "JOURNEY_REFERENCE_INVENTORY_INCOMPLETE" as const;

const CLASSIFICATION_RESTRICTIVENESS: Record<
  AccountDeletionStorageClassification,
  number
> = {
  BLOCK_UNRESOLVED: 0,
  PRESERVE_SHARED: 1,
  PRESERVE_PUBLIC: 2,
  SKIP_UNKNOWN: 3,
  DELETE_PRIVATE: 4,
};

export function resolveMostRestrictiveStorageClassification(
  ...classifications: AccountDeletionStorageClassification[]
): AccountDeletionStorageClassification {
  if (classifications.length === 0) {
    return "BLOCK_UNRESOLVED";
  }

  return classifications.reduce((mostRestrictive, current) =>
    CLASSIFICATION_RESTRICTIVENESS[current] <
    CLASSIFICATION_RESTRICTIVENESS[mostRestrictive]
      ? current
      : mostRestrictive
  );
}

export type AccountDeletionStorageClassificationResult = {
  classification: AccountDeletionStorageClassification;
  reason: string;
  requiresReferencesCleared?: boolean;
};

export type AccountDeletionStorageDeletionPrecondition = {
  requiresReferencesCleared: boolean;
  referenceTables: string[];
  note: string;
};

export const ACCOUNT_DELETION_STORAGE_DELETE_ALLOWLIST = [
  "journey-private-media",
  "profile-avatars",
] as const;

export type AccountDeletionStorageDeleteBucket =
  (typeof ACCOUNT_DELETION_STORAGE_DELETE_ALLOWLIST)[number];

export const ACCOUNT_DELETION_STORAGE_PUBLIC_PRESERVE_BUCKETS = [
  "story-images",
  "story-videos",
  "story-thumbnails",
] as const;

export const ACCOUNT_DELETION_STORAGE_KNOWN_BUCKETS = [
  ...ACCOUNT_DELETION_STORAGE_DELETE_ALLOWLIST,
  ...ACCOUNT_DELETION_STORAGE_PUBLIC_PRESERVE_BUCKETS,
] as const;

export const PROFILE_AVATAR_DELETION_ORDERING_NOTE =
  "Delete profile-avatars only after DB anonymization clears profiles.avatar_url and other live references.";

export const PROFILE_AVATAR_DELETION_PRECONDITION: AccountDeletionStorageDeletionPrecondition =
  {
    requiresReferencesCleared: true,
    referenceTables: ["profiles.avatar_url"],
    note: PROFILE_AVATAR_DELETION_ORDERING_NOTE,
  };

export const PUBLIC_STORY_MEDIA_PRESERVATION_NOTE = REFERENCE_PUBLIC_NOTE;

export const JOURNEY_SHARED_MEDIA_PRESERVATION_NOTE =
  "Journey private media referenced by a surviving inbox copy in another user's inbox must be preserved until that reference is cleared.";

export function mapStorageActionToClassification(
  action: AccountDeletionStorageAction
): AccountDeletionStorageClassification {
  switch (action) {
    case "preserve_public":
      return "PRESERVE_PUBLIC";
    case "preserve_shared":
      return "PRESERVE_SHARED";
    case "delete_private":
      return "DELETE_PRIVATE";
    case "block_unresolved":
      return "BLOCK_UNRESOLVED";
    case "skip_unknown":
    default:
      return "SKIP_UNKNOWN";
  }
}

export function mapClassificationToStorageAction(
  classification: AccountDeletionStorageClassification
): AccountDeletionStorageAction {
  switch (classification) {
    case "PRESERVE_PUBLIC":
      return "preserve_public";
    case "PRESERVE_SHARED":
      return "preserve_shared";
    case "DELETE_PRIVATE":
      return "delete_private";
    case "BLOCK_UNRESOLVED":
      return "block_unresolved";
    case "SKIP_UNKNOWN":
    default:
      return "skip_unknown";
  }
}

export function isKnownAccountDeletionStorageBucket(
  bucket: string
): bucket is (typeof ACCOUNT_DELETION_STORAGE_KNOWN_BUCKETS)[number] {
  return (ACCOUNT_DELETION_STORAGE_KNOWN_BUCKETS as readonly string[]).includes(
    bucket
  );
}

export function isApprovedAccountDeletionDeleteBucket(
  bucket: string
): bucket is AccountDeletionStorageDeleteBucket {
  return (
    ACCOUNT_DELETION_STORAGE_DELETE_ALLOWLIST as readonly string[]
  ).includes(bucket);
}

export function isPublicPreserveAccountDeletionBucket(
  bucket: string
): bucket is (typeof ACCOUNT_DELETION_STORAGE_PUBLIC_PRESERVE_BUCKETS)[number] {
  return (
    ACCOUNT_DELETION_STORAGE_PUBLIC_PRESERVE_BUCKETS as readonly string[]
  ).includes(bucket);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateAccountDeletionStoragePath(input: {
  bucket: string;
  path: string;
  targetUserId: string;
}): { ok: true } | { ok: false; code: string; reason: string } {
  const path = normalizeStorageObjectPath(input.path);

  if (/[?#]/.test(path)) {
    return {
      ok: false,
      code: "malformed_path",
      reason: "Storage path must not contain query or fragment material.",
    };
  }

  if (!path) {
    return {
      ok: false,
      code: "empty_path",
      reason: "Storage path must not be empty.",
    };
  }

  if (path.startsWith("/") || path.includes("\\")) {
    return {
      ok: false,
      code: "malformed_path",
      reason: "Storage path must be bucket-relative without leading slashes.",
    };
  }

  if (path.includes("..") || path.includes("//")) {
    return {
      ok: false,
      code: "traversal_path",
      reason: "Storage path must not contain traversal segments.",
    };
  }

  const segments = path.split("/");
  if (segments.some((segment) => segment.length === 0)) {
    return {
      ok: false,
      code: "malformed_path",
      reason: "Storage path contains empty segments.",
    };
  }

  if (segments.some((segment) => segment.includes(":"))) {
    return {
      ok: false,
      code: "cross_bucket_injection",
      reason: "Storage path must not embed bucket names or URI schemes.",
    };
  }

  if (
    (ACCOUNT_DELETION_STORAGE_PUBLIC_PRESERVE_BUCKETS as readonly string[]).some(
      (bucket) => path.startsWith(`${bucket}/`)
    )
  ) {
    return {
      ok: false,
      code: "cross_bucket_injection",
      reason: "Storage path must not prefix another bucket name.",
    };
  }

  if (!isKnownAccountDeletionStorageBucket(input.bucket)) {
    return {
      ok: false,
      code: "unknown_bucket",
      reason: "Storage bucket is not recognized for account deletion.",
    };
  }

  if (input.bucket === "profile-avatars") {
    const ownerSegment = segments[0];
    if (!UUID_PATTERN.test(ownerSegment)) {
      return {
        ok: false,
        code: "ownership_unresolved",
        reason: "Profile avatar owner segment must be a UUID.",
      };
    }

    if (!uuidEquals(ownerSegment, input.targetUserId)) {
      return {
        ok: false,
        code: "ownership_mismatch",
        reason: "Profile avatar path is not owned by the deletion target.",
      };
    }

    const fileName = segments[segments.length - 1] ?? "";
    if (!/^avatar\.(png|webp|jpg|jpeg)$/i.test(fileName)) {
      return {
        ok: false,
        code: "malformed_avatar_path",
        reason: "Profile avatar paths must match {userId}/avatar.{ext}.",
      };
    }

    return { ok: true };
  }

  if (input.bucket === "journey-private-media") {
    const ownerSegment = segments[0];
    if (!UUID_PATTERN.test(ownerSegment) || !uuidEquals(ownerSegment, input.targetUserId)) {
      return {
        ok: false,
        code: "ownership_mismatch",
        reason: "Journey private media path is not owned by the deletion target.",
      };
    }

    if (segments.length < 3) {
      return {
        ok: false,
        code: "malformed_private_media_path",
        reason:
          "Journey private media paths must match {ownerUserId}/{threadId}/{objectId}.ext.",
      };
    }

    return { ok: true };
  }

  if (!isAuthoritativeTargetOwnedUuidPath(path, input.targetUserId)) {
    if (isLegacyStoryVideoPathWithoutTargetOwnership(path, input.targetUserId)) {
      return {
        ok: false,
        code: "legacy_ownership_unresolved",
        reason: LEGACY_UNREFERENCED_AMBIGUITY_NOTE,
      };
    }

    return {
      ok: false,
      code: "ownership_mismatch",
      reason: "Storage path is not owned exclusively by the deletion target.",
    };
  }

  return { ok: true };
}

export function canClassifyAsDeletePrivate(input: {
  bucket: string;
  path: string;
  targetUserId: string;
  ownershipSources: string[];
  referencingTable?: string | null;
  journeyReferenceInventoryComplete?: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (!isApprovedAccountDeletionDeleteBucket(input.bucket)) {
    return {
      ok: false,
      reason: `Bucket ${input.bucket} is not approved for private deletion.`,
    };
  }

  const pathValidation = validateAccountDeletionStoragePath({
    bucket: input.bucket,
    path: input.path,
    targetUserId: input.targetUserId,
  });
  if (pathValidation.ok === false) {
    return { ok: false, reason: pathValidation.reason };
  }

  if (input.ownershipSources.some((source) => source === "ambiguous_reference")) {
    return {
      ok: false,
      reason: "Ownership could not be resolved authoritatively.",
    };
  }

  if (hasSharedSurvivingReferenceFromSources(input.ownershipSources)) {
    return {
      ok: false,
      reason: JOURNEY_SHARED_MEDIA_PRESERVATION_NOTE,
    };
  }

  if (hasPublicPreservationReferenceFromSources(input.ownershipSources)) {
    return {
      ok: false,
      reason: "Object is referenced by preserved public testimony or prayer response content.",
    };
  }

  if (input.bucket === "journey-private-media") {
    if (input.journeyReferenceInventoryComplete === false) {
      return {
        ok: false,
        reason: JOURNEY_REFERENCE_INVENTORY_INCOMPLETE_NOTE,
      };
    }

    const hasRecipientOwned = input.ownershipSources.some(
      isRecipientOwnedInboxOwnershipSource
    );

    if (!hasRecipientOwned) {
      return {
        ok: false,
        reason: input.ownershipSources.some(isPrefixDiscoveryOwnershipSource)
          ? PREFIX_DISCOVERY_NOT_DELETION_AUTHORITY_NOTE
          : "Journey private media lacks recipient-owned authoritative inbox references.",
      };
    }

    if (input.ownershipSources.some(isPrefixDiscoveryOwnershipSource)) {
      const hasOnlyDiscoverySources = input.ownershipSources.every(
        (source) =>
          isPrefixDiscoveryOwnershipSource(source) ||
          source === "ambiguous_reference"
      );
      if (hasOnlyDiscoverySources) {
        return {
          ok: false,
          reason: PREFIX_DISCOVERY_NOT_DELETION_AUTHORITY_NOTE,
        };
      }
    }
  }

  const bucketPolicy = classifyStorageBucketAction(
    input.bucket as AccountDeletionStorageBucket
  );
  if (bucketPolicy !== "delete_private") {
    return {
      ok: false,
      reason: `Bucket policy ${bucketPolicy} does not allow private deletion.`,
    };
  }

  return { ok: true };
}

export function classifyAccountDeletionStorageObject(
  input: AccountDeletionStorageClassificationInput
): AccountDeletionStorageClassificationResult {
  if (
    input.bucket === "journey-private-media" &&
    input.journeyReferenceInventoryComplete === false
  ) {
    return {
      classification: "BLOCK_UNRESOLVED",
      reason: JOURNEY_REFERENCE_INVENTORY_INCOMPLETE_NOTE,
    };
  }

  if (!isKnownAccountDeletionStorageBucket(input.bucket)) {
    return {
      classification: "BLOCK_UNRESOLVED",
      reason: `Unknown bucket '${input.bucket}'.`,
    };
  }

  if (input.ownershipSources.some((source) => source === "ambiguous_reference")) {
    return {
      classification: "BLOCK_UNRESOLVED",
      reason: "Ownership could not be resolved authoritatively.",
    };
  }

  if (isPublicPreserveAccountDeletionBucket(input.bucket)) {
    if (hasPublicPreservationReferenceFromSources(input.ownershipSources)) {
      if (input.ownershipSources.some(isPrayerVideoResponseOwnershipSource)) {
        return {
          classification: "PRESERVE_PUBLIC",
          reason: PRAYER_VIDEO_RESPONSE_PRESERVATION_NOTE,
        };
      }

      return {
        classification: "PRESERVE_PUBLIC",
        reason: PUBLIC_STORY_MEDIA_PRESERVATION_NOTE,
      };
    }

    if (isAuthoritativeTargetOwnedUuidPath(input.path, input.targetUserId)) {
      return {
        classification: "PRESERVE_PUBLIC",
        reason: PUBLIC_STORY_MEDIA_PRESERVATION_NOTE,
      };
    }

    if (
      input.bucket === "story-videos" &&
      isLegacyStoryVideoPathWithoutTargetOwnership(input.path, input.targetUserId) &&
      hasPublicPreservationReferenceFromSources(input.ownershipSources)
    ) {
      return {
        classification: "PRESERVE_PUBLIC",
        reason: LEGACY_STORY_VIDEO_PRESERVATION_NOTE,
      };
    }

    if (
      input.bucket === "story-videos" &&
      isLegacyStoryVideoPathWithoutTargetOwnership(input.path, input.targetUserId)
    ) {
      return {
        classification: "BLOCK_UNRESOLVED",
        reason: LEGACY_UNREFERENCED_AMBIGUITY_NOTE,
      };
    }

    return {
      classification: "BLOCK_UNRESOLVED",
      reason: "Public story media path lacks authoritative preservation evidence.",
    };
  }

  if (hasPublicPreservationReferenceFromSources(input.ownershipSources)) {
    if (input.ownershipSources.some(isPrayerVideoResponseOwnershipSource)) {
      return {
        classification: "PRESERVE_PUBLIC",
        reason: PRAYER_VIDEO_RESPONSE_PRESERVATION_NOTE,
      };
    }

    return {
      classification: "PRESERVE_PUBLIC",
      reason: PUBLIC_STORY_MEDIA_PRESERVATION_NOTE,
    };
  }

  if (hasSharedSurvivingReferenceFromSources(input.ownershipSources)) {
    return {
      classification: "PRESERVE_SHARED",
      reason: JOURNEY_SHARED_MEDIA_PRESERVATION_NOTE,
    };
  }

  const deleteEligibility = canClassifyAsDeletePrivate(input);
  if (deleteEligibility.ok === false) {
    if (
      deleteEligibility.reason.includes("not approved") ||
      deleteEligibility.reason.includes("Bucket policy")
    ) {
      return {
        classification: "BLOCK_UNRESOLVED",
        reason: deleteEligibility.reason,
      };
    }

    return {
      classification: "BLOCK_UNRESOLVED",
      reason: deleteEligibility.reason,
    };
  }

  if (input.bucket === "profile-avatars") {
    return {
      classification: "DELETE_PRIVATE",
      reason: `Exclusive account avatar object. ${PROFILE_AVATAR_DELETION_ORDERING_NOTE}`,
      requiresReferencesCleared: true,
    };
  }

  if (input.bucket === "journey-private-media") {
    if (input.ownershipSources.some(isPrefixDiscoveryOwnershipSource)) {
      const hasRecipientOwned = input.ownershipSources.some(
        isRecipientOwnedInboxOwnershipSource
      );
      if (!hasRecipientOwned) {
        return {
          classification: "BLOCK_UNRESOLVED",
          reason: PREFIX_DISCOVERY_NOT_DELETION_AUTHORITY_NOTE,
        };
      }
    }

    return {
      classification: "DELETE_PRIVATE",
      reason:
        "Journey private media is exclusively referenced by recipient-owned inbox rows for the deletion target with a complete Journey reference inventory.",
    };
  }

  return {
    classification: "SKIP_UNKNOWN",
    reason: "No explicit deletion policy matched this object.",
  };
}

export function assertDeleteClassificationConsistent(input: {
  bucket: string;
  path: string;
  classifications: AccountDeletionStorageClassification[];
}): { ok: true } | { ok: false; reason: string } {
  const unique = new Set(input.classifications);
  if (unique.size <= 1) {
    return { ok: true };
  }

  if (unique.has("DELETE_PRIVATE") && unique.has("PRESERVE_PUBLIC")) {
    return {
      ok: false,
      reason: `Conflicting public preservation and delete intent for ${input.bucket}/${input.path}.`,
    };
  }

  if (unique.has("DELETE_PRIVATE") && unique.has("PRESERVE_SHARED")) {
    return {
      ok: false,
      reason: `Conflicting shared preservation and delete intent for ${input.bucket}/${input.path}.`,
    };
  }

  if (unique.has("DELETE_PRIVATE") && unique.has("BLOCK_UNRESOLVED")) {
    return {
      ok: false,
      reason: `Unresolved ownership conflicts with delete intent for ${input.bucket}/${input.path}.`,
    };
  }

  return { ok: true };
}

export function assertManifestPlanContract(input: {
  manifestClassification: AccountDeletionStorageClassification;
  planClassification: AccountDeletionStorageClassification;
  bucket: string;
  path: string;
}): { ok: true } | { ok: false; reason: string } {
  const nonEscalatable: AccountDeletionStorageClassification[] = [
    "PRESERVE_PUBLIC",
    "PRESERVE_SHARED",
    "BLOCK_UNRESOLVED",
    "SKIP_UNKNOWN",
  ];

  if (
    nonEscalatable.includes(input.manifestClassification) &&
    input.planClassification === "DELETE_PRIVATE"
  ) {
    return {
      ok: false,
      reason: `Policy escalation blocked for ${input.bucket}/${input.path}: manifest=${input.manifestClassification}, plan=${input.planClassification}.`,
    };
  }

  if (
    input.manifestClassification === "PRESERVE_SHARED" &&
    input.planClassification === "PRESERVE_PUBLIC"
  ) {
    return {
      ok: false,
      reason: `Shared Journey media must not be labeled public for ${input.bucket}/${input.path}.`,
    };
  }

  return { ok: true };
}

export function isNonDeletableClassification(
  classification: AccountDeletionStorageClassification
): boolean {
  return classification !== "DELETE_PRIVATE";
}
