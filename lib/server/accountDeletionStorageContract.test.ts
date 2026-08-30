import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAccountDeletionDryRunManifest,
  type AccountDeletionDryRunDeps,
} from "./accountDeletionManifest";
import { buildAccountDeletionStoragePlan, assertManifestStoragePlanContract } from "./accountDeletionStoragePlan";
import { classifyStorageBucketAction } from "./accountDeletionPolicy";

const TARGET = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function buildDeps(
  overrides: Partial<AccountDeletionDryRunDeps> = {}
): AccountDeletionDryRunDeps {
  return {
    loadDeletionRequest: vi.fn(async () => ({
      id: "req-1",
      user_id: TARGET,
      email: "target@example.com",
      reason: null,
      status: "approved",
      created_at: "2026-01-01T00:00:00.000Z",
      target_user_id_snapshot: TARGET,
      target_username_snapshot: "target",
    })),
    loadProfile: vi.fn(async () => ({
      id: TARGET,
      email: "target@example.com",
      username: "target",
      display_name: "Target",
      avatar_url: `profile-avatars/${TARGET}/avatar.png`,
      is_owner: false,
      is_admin: false,
    })),
    authUserExists: vi.fn(async () => true),
    countRows: vi.fn(async () => 0),
    countBlockedUsers: vi.fn(async () => 0),
    countStoryVideoReplies: vi.fn(async () => 0),
    countInboxRecipientOwned: vi.fn(async () => 1),
    countInboxSentToOthers: vi.fn(async () => 1),
    countContentReportsForUser: vi.fn(async () => 0),
    countAdminLogsForUser: vi.fn(async () => 0),
    listStories: vi.fn(async () => [
      {
        id: "story-1",
        status: "approved",
        story_type: "Testimony",
        image_url: `story-images/${TARGET}/story.png`,
        video_url: `story-videos/${TARGET}/story.webm`,
        thumbnail_url: `story-thumbnails/${TARGET}/story.webp`,
      },
    ]),
    listPrayerVideoResponses: vi.fn(async () => [
      {
        id: "response-1",
        video_url: `https://example.supabase.co/storage/v1/object/public/story-videos/${TARGET}/response.webm`,
        thumbnail_url: `story-thumbnails/${TARGET}/response.webp`,
      },
    ]),
    listInboxMediaReferences: vi.fn(async () => ({
      ok: true as const,
      rows: [
      {
        id: "msg-recipient",
        user_id: TARGET,
        sender_user_id: OTHER,
        video_url: `journey-private-media/${TARGET}/thread-1/object.mp4`,
        image_url: null,
      },
      {
        id: "msg-sent-copy",
        user_id: OTHER,
        sender_user_id: TARGET,
        video_url: `journey-private-media/${TARGET}/thread-shared/object.mp4`,
        image_url: null,
      },
    ],
    })),
    listStorageObjectsForUser: vi.fn(async (_bucket, userId) => [
      { path: `${userId}/listed-object.mp4` },
    ]),
    resolveStorageExists: vi.fn(async () => true),
    ...overrides,
  };
}

describe("account deletion manifest and storage plan contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aligns Phase 1A story bucket policy with Phase 1D preserve_public semantics", () => {
    expect(classifyStorageBucketAction("story-images")).toBe("preserve_public");
    expect(classifyStorageBucketAction("story-videos")).toBe("preserve_public");
    expect(classifyStorageBucketAction("story-thumbnails")).toBe(
      "preserve_public"
    );
  });

  it("manifest preserves story and prayer response media instead of hard_delete", async () => {
    const result = await buildAccountDeletionDryRunManifest("req-1", buildDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const storyVideo = result.manifest.storage.objects.find(
      (object) =>
        object.bucket === "story-videos" &&
        object.path === `${TARGET}/story.webm`
    );
    expect(storyVideo?.plannedClassification).toBe("PRESERVE_PUBLIC");

    const prayerResponseVideo = result.manifest.storage.objects.find(
      (object) =>
        object.bucket === "story-videos" &&
        object.path === `${TARGET}/response.webm`
    );
    expect(prayerResponseVideo?.plannedClassification).toBe("PRESERVE_PUBLIC");

    const sharedPrivate = result.manifest.storage.objects.find(
      (object) => object.path === `${TARGET}/thread-shared/object.mp4`
    );
    expect(sharedPrivate?.plannedClassification).toBe("PRESERVE_SHARED");
  });

  it("does not allow manifest preserve classifications to escalate to DELETE_PRIVATE in plan", async () => {
    const manifestResult = await buildAccountDeletionDryRunManifest(
      "req-1",
      buildDeps()
    );
    expect(manifestResult.ok).toBe(true);
    if (!manifestResult.ok) return;

    const plan = buildAccountDeletionStoragePlan({
      targetUserId: TARGET,
      manifest: manifestResult.manifest,
    });

    expect(assertManifestStoragePlanContract(manifestResult.manifest, plan).ok).toBe(
      true
    );

    for (const object of manifestResult.manifest.storage.objects) {
      if (object.plannedClassification !== "DELETE_PRIVATE") {
        expect(
          plan.delete.some(
            (entry) => entry.bucket === object.bucket && entry.path === object.path
          )
        ).toBe(false);
      }
    }
  });

  it("marks profile avatar deletion with requiresReferencesCleared", async () => {
    const manifestResult = await buildAccountDeletionDryRunManifest(
      "req-1",
      buildDeps()
    );
    expect(manifestResult.ok).toBe(true);
    if (!manifestResult.ok) return;

    const avatar = manifestResult.manifest.storage.objects.find(
      (object) =>
        object.bucket === "profile-avatars" &&
        object.path === `${TARGET}/avatar.png`
    );
    expect(avatar?.plannedClassification).toBe("DELETE_PRIVATE");
    expect(avatar?.requiresReferencesCleared).toBe(true);
  });
});
