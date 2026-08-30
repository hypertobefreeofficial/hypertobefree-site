import { describe, expect, it } from "vitest";
import type { AccountDeletionManifest } from "./accountDeletionManifest";
import {
  buildAccountDeletionStoragePlan,
  assertManifestStoragePlanContract,
  rejectBrowserSuppliedStoragePlanEntries,
} from "./accountDeletionStoragePlan";

const TARGET = "11111111-1111-4111-8111-111111111111";

function buildManifest(
  overrides: Partial<AccountDeletionManifest> = {}
): AccountDeletionManifest {
  return {
    identity: {
      requestId: "req-1",
      targetUserId: TARGET,
      username: "member",
      displayName: "Member",
      email: "member@example.com",
      requestStatus: "approved",
      requestCreatedAt: "2026-01-01T00:00:00.000Z",
      authUserExists: true,
      isOwner: false,
      isAdmin: false,
    },
    blocked: false,
    blockCode: null,
    database: {
      hardDelete: [],
      anonymize: [],
      preserve: [],
      manualReview: [],
    },
    storage: { objects: [] },
    journey: {
      recipientOwnedRows: {
        table: "inbox_messages",
        count: 0,
        plannedAction: "hard_delete",
      },
      sentToOtherUserRows: {
        table: "inbox_messages",
        count: 0,
        plannedAction: "preserve_anonymized",
      },
      privateMediaObjects: [],
      relationshipNotes: [],
      journeyReferenceInventoryComplete: true,
      unresolvedJourneyReferenceCount: 0,
    },
    publicContent: {
      stories: [],
      profileFieldsToStrip: [],
    },
    audit: {
      retain: [],
      deletionRequestRetentionWarning: "",
    },
    warnings: [],
    schemaRequirements: [],
    counts: {
      hardDeleteRows: 0,
      anonymizeRows: 0,
      preserveRows: 0,
      manualReviewRows: 0,
      storageObjects: 0,
      unresolvedWarnings: 0,
    },
    ...overrides,
  };
}

describe("accountDeletionStoragePlan", () => {
  it("derives plan from manifest classifications without escalation", () => {
    const manifest = buildManifest({
      storage: {
        objects: [
          {
            bucket: "story-videos",
            path: `${TARGET}/story.webm`,
            ownershipSource: "stories.story-videos_url",
            plannedClassification: "PRESERVE_PUBLIC",
            exists: true,
          },
          {
            bucket: "journey-private-media",
            path: `${TARGET}/thread-1/object.mp4`,
            ownershipSource: "inbox_messages.user_id (recipient-owned)",
            plannedClassification: "DELETE_PRIVATE",
            exists: true,
          },
        ],
      },
    });

    const plan = buildAccountDeletionStoragePlan({
      targetUserId: TARGET,
      manifest,
    });

    expect(plan.delete).toHaveLength(1);
    expect(plan.preservePublic).toHaveLength(1);
    expect(assertManifestStoragePlanContract(manifest, plan).ok).toBe(true);
  });

  it("preserves shared journey media as PRESERVE_SHARED", () => {
    const manifest = buildManifest({
      storage: {
        objects: [
          {
            bucket: "journey-private-media",
            path: `${TARGET}/thread-shared/object.mp4`,
            ownershipSource:
              "inbox_messages.user_id (recipient-owned) | inbox_messages.sender_user_id (sent copy in other inbox)",
            ownershipSources: [
              "inbox_messages.user_id (recipient-owned)",
              "inbox_messages.sender_user_id (sent copy in other inbox)",
            ],
            plannedClassification: "PRESERVE_SHARED",
            exists: true,
          },
        ],
      },
    });

    const plan = buildAccountDeletionStoragePlan({
      targetUserId: TARGET,
      manifest,
    });

    expect(plan.delete).toHaveLength(0);
    expect(plan.preserveShared).toHaveLength(1);
    expect(plan.preserveShared[0]?.classification).toBe("PRESERVE_SHARED");
  });

  it("blocks manifest BLOCK_UNRESOLVED from becoming DELETE_PRIVATE", () => {
    const manifest = buildManifest({
      storage: {
        objects: [
          {
            bucket: "story-videos",
            path: "prayer-videos/story-1/video.mp4",
            ownershipSource: "ambiguous_reference",
            plannedClassification: "BLOCK_UNRESOLVED",
            exists: null,
          },
        ],
      },
    });

    const plan = buildAccountDeletionStoragePlan({
      targetUserId: TARGET,
      manifest,
    });

    expect(plan.delete).toHaveLength(0);
    expect(plan.blocked).toHaveLength(1);
  });

  it("chooses conservative classification when manifest and derived disagree", () => {
    const manifest = buildManifest({
      journey: {
        recipientOwnedRows: {
          table: "inbox_messages",
          count: 0,
          plannedAction: "hard_delete",
        },
        sentToOtherUserRows: {
          table: "inbox_messages",
          count: 1,
          plannedAction: "preserve_anonymized",
        },
        privateMediaObjects: [],
        relationshipNotes: [],
        journeyReferenceInventoryComplete: true,
        unresolvedJourneyReferenceCount: 0,
      },
      storage: {
        objects: [
          {
            bucket: "journey-private-media",
            path: `${TARGET}/thread-shared/object.mp4`,
            ownershipSource:
              "inbox_messages.sender_user_id (sent copy in other inbox)",
            ownershipSources: [
              "inbox_messages.sender_user_id (sent copy in other inbox)",
            ],
            plannedClassification: "DELETE_PRIVATE",
            exists: true,
          },
        ],
      },
    });

    const plan = buildAccountDeletionStoragePlan({
      targetUserId: TARGET,
      manifest,
    });

    expect(plan.delete).toHaveLength(0);
    expect(plan.preserveShared).toHaveLength(1);
  });
});
