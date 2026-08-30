import { describe, expect, it } from "vitest";
import {
  classifyAccountDeletionStorageObject,
  resolveMostRestrictiveStorageClassification,
  validateAccountDeletionStoragePath,
  isApprovedAccountDeletionDeleteBucket,
  PROFILE_AVATAR_DELETION_PRECONDITION,
  PUBLIC_STORY_MEDIA_PRESERVATION_NOTE,
  JOURNEY_SHARED_MEDIA_PRESERVATION_NOTE,
} from "./accountDeletionStoragePolicy";
import {
  PATH_PREFIX_DISCOVERY_SOURCE_PREFIX,
  PREFIX_DISCOVERY_NOT_DELETION_AUTHORITY_NOTE,
} from "./accountDeletionStorageReferenceRules";

const TARGET = "11111111-1111-4111-8111-111111111111";
const TARGET_UPPER = "11111111-1111-4111-8111-111111111111".toUpperCase();

describe("accountDeletionStoragePolicy", () => {
  it("preserves public story media buckets by default", () => {
    for (const bucket of ["story-images", "story-videos", "story-thumbnails"] as const) {
      const result = classifyAccountDeletionStorageObject({
        bucket,
        path: `${TARGET}/2026-photo.png`,
        targetUserId: TARGET,
        ownershipSources: [`${PATH_PREFIX_DISCOVERY_SOURCE_PREFIX}${TARGET}`],
        journeyReferenceInventoryComplete: true,
      });

      expect(result.classification).toBe("PRESERVE_PUBLIC");
      expect(result.reason).toContain(PUBLIC_STORY_MEDIA_PRESERVATION_NOTE);
    }
  });

  it("classifies journey private media as DELETE_PRIVATE when recipient-owned only", () => {
    const result = classifyAccountDeletionStorageObject({
      bucket: "journey-private-media",
      path: `${TARGET}/thread-1/object.mp4`,
      targetUserId: TARGET,
      ownershipSources: ["inbox_messages.user_id (recipient-owned)"],
      journeyReferenceInventoryComplete: true,
    });

    expect(result.classification).toBe("DELETE_PRIVATE");
  });

  it("blocks prefix-only journey discovery from DELETE_PRIVATE", () => {
    const result = classifyAccountDeletionStorageObject({
      bucket: "journey-private-media",
      path: `${TARGET}/thread-1/object.mp4`,
      targetUserId: TARGET,
      ownershipSources: [`${PATH_PREFIX_DISCOVERY_SOURCE_PREFIX}${TARGET}`],
      journeyReferenceInventoryComplete: true,
    });

    expect(result.classification).toBe("BLOCK_UNRESOLVED");
    expect(result.reason).toContain(PREFIX_DISCOVERY_NOT_DELETION_AUTHORITY_NOTE);
  });

  it("classifies shared journey private media as PRESERVE_SHARED", () => {
    const result = classifyAccountDeletionStorageObject({
      bucket: "journey-private-media",
      path: `${TARGET}/thread-1/object.mp4`,
      targetUserId: TARGET,
      ownershipSources: [
        "inbox_messages.sender_user_id (sent copy in other inbox)",
      ],
      journeyReferenceInventoryComplete: true,
    });

    expect(result.classification).toBe("PRESERVE_SHARED");
    expect(result.reason).toContain(JOURNEY_SHARED_MEDIA_PRESERVATION_NOTE);
    expect(result.classification).not.toBe("PRESERVE_PUBLIC");
  });

  it("blocks all journey private deletion when inventory is incomplete", () => {
    const result = classifyAccountDeletionStorageObject({
      bucket: "journey-private-media",
      path: `${TARGET}/thread-1/object.mp4`,
      targetUserId: TARGET,
      ownershipSources: ["inbox_messages.user_id (recipient-owned)"],
      journeyReferenceInventoryComplete: false,
    });

    expect(result.classification).toBe("BLOCK_UNRESOLVED");
  });

  it("preserves prayer response media as public testimony", () => {
    const result = classifyAccountDeletionStorageObject({
      bucket: "story-videos",
      path: `${TARGET}/response.webm`,
      targetUserId: TARGET,
      ownershipSources: ["prayer_video_responses.video_url"],
      journeyReferenceInventoryComplete: true,
    });

    expect(result.classification).toBe("PRESERVE_PUBLIC");
  });

  it("classifies profile avatar as DELETE_PRIVATE with typed precondition", () => {
    const result = classifyAccountDeletionStorageObject({
      bucket: "profile-avatars",
      path: `${TARGET}/avatar.png`,
      targetUserId: TARGET,
      ownershipSources: ["profiles.avatar_url"],
      journeyReferenceInventoryComplete: true,
    });

    expect(result.classification).toBe("DELETE_PRIVATE");
    expect(result.requiresReferencesCleared).toBe(true);
    expect(PROFILE_AVATAR_DELETION_PRECONDITION.requiresReferencesCleared).toBe(
      true
    );
  });

  it("blocks legacy story-videos paths without authoritative ownership", () => {
    expect(
      classifyAccountDeletionStorageObject({
        bucket: "story-videos",
        path: "prayer-videos/story-1/video.mp4",
        targetUserId: TARGET,
        ownershipSources: ["ambiguous_reference"],
        journeyReferenceInventoryComplete: true,
      }).classification
    ).toBe("BLOCK_UNRESOLVED");
  });

  it("blocks unknown buckets and unresolved ownership", () => {
    expect(
      classifyAccountDeletionStorageObject({
        bucket: "unknown-bucket",
        path: `${TARGET}/file.bin`,
        targetUserId: TARGET,
        ownershipSources: ["path_prefix"],
        journeyReferenceInventoryComplete: true,
      }).classification
    ).toBe("BLOCK_UNRESOLVED");
  });

  it("validates paths and rejects traversal or cross-bucket injection", () => {
    expect(
      validateAccountDeletionStoragePath({
        bucket: "journey-private-media",
        path: `${TARGET}/../other/object.mp4`,
        targetUserId: TARGET,
      }).ok
    ).toBe(false);

    expect(
      validateAccountDeletionStoragePath({
        bucket: "profile-avatars",
        path: `${TARGET}/avatar.png`,
        targetUserId: TARGET,
      }).ok
    ).toBe(true);
  });

  it("accepts uppercase UUID owner segments when target UUID matches case-insensitively", () => {
    expect(
      validateAccountDeletionStoragePath({
        bucket: "journey-private-media",
        path: `${TARGET_UPPER}/thread-1/object.mp4`,
        targetUserId: TARGET,
      }).ok
    ).toBe(true);
  });

  it("allows deletion only on approved buckets", () => {
    expect(isApprovedAccountDeletionDeleteBucket("journey-private-media")).toBe(
      true
    );
    expect(isApprovedAccountDeletionDeleteBucket("story-videos")).toBe(false);
  });

  it("chooses the most restrictive classification in merge lattice", () => {
    expect(
      resolveMostRestrictiveStorageClassification(
        "DELETE_PRIVATE",
        "PRESERVE_SHARED"
      )
    ).toBe("PRESERVE_SHARED");
    expect(
      resolveMostRestrictiveStorageClassification(
        "DELETE_PRIVATE",
        "BLOCK_UNRESOLVED"
      )
    ).toBe("BLOCK_UNRESOLVED");
  });
});
