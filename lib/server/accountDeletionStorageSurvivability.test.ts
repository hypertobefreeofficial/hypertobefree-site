import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAccountDeletionDryRunManifest,
  type AccountDeletionDryRunDeps,
} from "./accountDeletionManifest";
import {
  buildAccountDeletionStoragePlan,
  assertManifestStoragePlanContract,
} from "./accountDeletionStoragePlan";
import { validateStoragePlanForExecution } from "./accountDeletionStorageExecutor";
import { PATH_PREFIX_DISCOVERY_SOURCE_PREFIX } from "./accountDeletionStorageReferenceRules";

const TARGET = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const OBJECT_PATH = `${TARGET}/thread-shared/object.mp4`;
const SUPABASE_HOST = "https://example.supabase.co";

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
    listStories: vi.fn(async () => []),
    listPrayerVideoResponses: vi.fn(async () => []),
    listInboxMediaReferences: vi.fn(async () => ({ ok: true as const, rows: [] })),
    listStorageObjectsForUser: vi.fn(async () => []),
    resolveStorageExists: vi.fn(async () => true),
    ...overrides,
  };
}

describe("Journey survivability hardening (Phase 1D.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("A. merges signed Journey URL with prefix discovery into PRESERVE_SHARED, never DELETE_PRIVATE", async () => {
    const signedUrl = `${SUPABASE_HOST}/storage/v1/object/sign/journey-private-media/${encodeURIComponent(OBJECT_PATH)}?token=secret-token`;

    const manifestResult = await buildAccountDeletionDryRunManifest(
      "req-1",
      buildDeps({
        listInboxMediaReferences: vi.fn(async () => ({
          ok: true,
          rows: [
            {
              id: "msg-sent-copy",
              user_id: OTHER,
              sender_user_id: TARGET,
              video_url: signedUrl,
              image_url: null,
            },
          ],
        })),
        listStorageObjectsForUser: vi.fn(async (bucket, userId) =>
          bucket === "journey-private-media"
            ? [{ path: OBJECT_PATH }]
            : [{ path: `${userId}/avatar.png` }]
        ),
      })
    );

    expect(manifestResult.ok).toBe(true);
    if (!manifestResult.ok) return;

    const shared = manifestResult.manifest.storage.objects.find(
      (object) =>
        object.bucket === "journey-private-media" && object.path === OBJECT_PATH
    );
    expect(shared?.plannedClassification).toBe("PRESERVE_SHARED");

    const plan = buildAccountDeletionStoragePlan({
      targetUserId: TARGET,
      manifest: manifestResult.manifest,
    });
    expect(plan.delete.some((entry) => entry.path === OBJECT_PATH)).toBe(false);
    expect(plan.preserveShared.some((entry) => entry.path === OBJECT_PATH)).toBe(
      true
    );
  });

  it("B. blocks Journey deletion when inbox URL cannot resolve but prefix object exists", async () => {
    const manifestResult = await buildAccountDeletionDryRunManifest(
      "req-1",
      buildDeps({
        listInboxMediaReferences: vi.fn(async () => ({
          ok: true,
          rows: [
            {
              id: "msg-unresolved",
              user_id: OTHER,
              sender_user_id: TARGET,
              video_url: "https://cdn.example.com/unrelated-media/object.mp4",
              image_url: null,
            },
          ],
        })),
        listStorageObjectsForUser: vi.fn(async (bucket, userId) =>
          bucket === "journey-private-media"
            ? [{ path: `${userId}/orphan/object.mp4` }]
            : [{ path: `${userId}/avatar.png` }]
        ),
      })
    );

    expect(manifestResult.ok).toBe(true);
    if (!manifestResult.ok) return;

    expect(manifestResult.manifest.journey.journeyReferenceInventoryComplete).toBe(
      false
    );
    expect(manifestResult.manifest.journey.unresolvedJourneyReferenceCount).toBe(
      1
    );

    const orphan = manifestResult.manifest.storage.objects.find(
      (object) => object.path === `${TARGET}/orphan/object.mp4`
    );
    expect(orphan?.plannedClassification).toBe("BLOCK_UNRESOLVED");

    const plan = buildAccountDeletionStoragePlan({
      targetUserId: TARGET,
      manifest: manifestResult.manifest,
    });
    expect(validateStoragePlanForExecution(plan).ok).toBe(false);
    expect(plan.journeyInventoryBlocked).toBe(true);
    expect(
      plan.delete.some((entry) => entry.bucket === "journey-private-media")
    ).toBe(false);
  });

  it("C. fails manifest when inbox query fails", async () => {
    const manifestResult = await buildAccountDeletionDryRunManifest(
      "req-1",
      buildDeps({
        listInboxMediaReferences: vi.fn(async () => ({
          ok: false,
          code: "inbox_media_query_failed",
        })),
      })
    );

    expect(manifestResult.ok).toBe(false);
    if (manifestResult.ok) return;
    expect(manifestResult.code).toBe("manifest_failed");
  });

  it("D. merges canonical path ref and signed URL ref for the same object", async () => {
    const signedUrl = `${SUPABASE_HOST}/storage/v1/object/sign/journey-private-media/${encodeURIComponent(OBJECT_PATH)}?token=abc`;

    const manifestResult = await buildAccountDeletionDryRunManifest(
      "req-1",
      buildDeps({
        listInboxMediaReferences: vi.fn(async () => ({
          ok: true,
          rows: [
            {
              id: "msg-recipient",
              user_id: TARGET,
              sender_user_id: OTHER,
              video_url: `journey-private-media/${OBJECT_PATH}`,
              image_url: null,
            },
            {
              id: "msg-sent-copy",
              user_id: OTHER,
              sender_user_id: TARGET,
              video_url: signedUrl,
              image_url: null,
            },
          ],
        })),
      })
    );

    expect(manifestResult.ok).toBe(true);
    if (!manifestResult.ok) return;

    const merged = manifestResult.manifest.storage.objects.filter(
      (object) => object.path === OBJECT_PATH
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.ownershipSources).toEqual(
      expect.arrayContaining([
        "inbox_messages.user_id (recipient-owned)",
        "inbox_messages.sender_user_id (sent copy in other inbox)",
      ])
    );
    expect(merged[0]?.plannedClassification).toBe("PRESERVE_SHARED");
  });

  it("E. blocks prefix-only orphan from DELETE_PRIVATE", async () => {
    const manifestResult = await buildAccountDeletionDryRunManifest(
      "req-1",
      buildDeps({
        listInboxMediaReferences: vi.fn(async () => ({ ok: true, rows: [] })),
        listStorageObjectsForUser: vi.fn(async (bucket, userId) =>
          bucket === "journey-private-media"
            ? [{ path: `${userId}/orphan/object.mp4` }]
            : [{ path: `${userId}/avatar.png` }]
        ),
      })
    );

    expect(manifestResult.ok).toBe(true);
    if (!manifestResult.ok) return;

    const orphan = manifestResult.manifest.storage.objects.find(
      (object) => object.path === `${TARGET}/orphan/object.mp4`
    );
    expect(orphan?.ownershipSources).toContain(
      `${PATH_PREFIX_DISCOVERY_SOURCE_PREFIX}${TARGET}`
    );
    expect(orphan?.plannedClassification).toBe("BLOCK_UNRESOLVED");
  });

  it("G. allows DELETE_PRIVATE only with complete inventory and recipient-owned refs", async () => {
    const deletePath = `${TARGET}/thread-1/object.mp4`;
    const manifestResult = await buildAccountDeletionDryRunManifest(
      "req-1",
      buildDeps({
        listInboxMediaReferences: vi.fn(async () => ({
          ok: true,
          rows: [
            {
              id: "msg-recipient",
              user_id: TARGET,
              sender_user_id: OTHER,
              video_url: `journey-private-media/${deletePath}`,
              image_url: null,
            },
          ],
        })),
        listStorageObjectsForUser: vi.fn(async (bucket, userId) =>
          bucket === "journey-private-media"
            ? [{ path: deletePath }]
            : [{ path: `${userId}/avatar.png` }]
        ),
      })
    );

    expect(manifestResult.ok).toBe(true);
    if (!manifestResult.ok) return;

    const deletable = manifestResult.manifest.storage.objects.find(
      (object) => object.path === deletePath
    );
    expect(deletable?.plannedClassification).toBe("DELETE_PRIVATE");

    const plan = buildAccountDeletionStoragePlan({
      targetUserId: TARGET,
      manifest: manifestResult.manifest,
    });
    expect(assertManifestStoragePlanContract(manifestResult.manifest, plan).ok).toBe(
      true
    );
    expect(plan.delete.some((entry) => entry.path === deletePath)).toBe(true);
  });
});
