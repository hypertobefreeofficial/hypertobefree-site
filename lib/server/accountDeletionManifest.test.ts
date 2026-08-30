import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_DELETION_SCHEMA_REQUIREMENTS,
  ACCOUNT_DELETION_TABLE_POLICY,
  BLOCKED_OWNER_ACCOUNT_CODE,
  LEGACY_COMPLETED_STATUS_NOTE,
  STORY_ANONYMIZATION_PII_FIELDS,
  classifyTableAction,
} from "./accountDeletionPolicy";
import {
  buildAccountDeletionDryRunManifest,
  parseStoragePathFromReference,
  type AccountDeletionDryRunDeps,
  type AccountDeletionRequestRow,
} from "./accountDeletionManifest";

function buildDeps(
  overrides: Partial<AccountDeletionDryRunDeps> = {}
): AccountDeletionDryRunDeps {
  const request: AccountDeletionRequestRow = {
    id: "req-1",
    user_id: "user-target",
    email: "target@example.com",
    reason: "Leaving",
    status: "reviewing",
    created_at: "2026-01-01T00:00:00.000Z",
    target_user_id_snapshot: "user-target",
    target_username_snapshot: "targetuser",
  };

  return {
    loadDeletionRequest: vi.fn(async () => request),
    loadProfile: vi.fn(async () => ({
      id: "user-target",
      email: "target@example.com",
      username: "targetuser",
      display_name: "Target User",
      avatar_url: "profile-avatars/user-target/avatar.png",
      is_owner: false,
      is_admin: false,
    })),
    authUserExists: vi.fn(async () => true),
    countRows: vi.fn(async () => 2),
    countBlockedUsers: vi.fn(async () => 1),
    countStoryVideoReplies: vi.fn(async () => 3),
    countInboxRecipientOwned: vi.fn(async () => 4),
    countInboxSentToOthers: vi.fn(async () => 5),
    countContentReportsForUser: vi.fn(async () => 1),
    countAdminLogsForUser: vi.fn(async () => 2),
    listStories: vi.fn(async () => [
      {
        id: "story-1",
        status: "approved",
        story_type: "Testimony",
        image_url: "story-images/user-target/story-1.png",
        video_url: null,
        thumbnail_url: null,
      },
    ]),
    listInboxMediaReferences: vi.fn(async () => [
      {
        id: "msg-1",
        user_id: "user-target",
        sender_user_id: "other-user",
        video_url: "journey-private-media/user-target/thread-1/video.mp4",
        image_url: null,
      },
      {
        id: "msg-2",
        user_id: "other-user",
        sender_user_id: "user-target",
        video_url: "journey-private-media/user-target/thread-2/video.mp4",
        image_url: null,
      },
    ]),
    listStorageObjectsForUser: vi.fn(async (_bucket, userId) => [
      { path: `${userId}/thread-1/video.mp4` },
    ]),
    resolveStorageExists: vi.fn(async () => true),
    ...overrides,
  };
}

describe("accountDeletionPolicy", () => {
  it("maps core tables to expected hybrid actions", () => {
    expect(classifyTableAction("profiles")).toBe("hard_delete");
    expect(classifyTableAction("stories")).toBe("anonymize");
    expect(classifyTableAction("saved_content")).toBe("hard_delete");
    expect(classifyTableAction("content_reports")).toBe("preserve_minimal");
    expect(classifyTableAction("admin_action_logs")).toBe("preserve");
    expect(classifyTableAction("inbox_messages_recipient_owned")).toBe(
      "hard_delete"
    );
    expect(classifyTableAction("inbox_messages_sent_to_other_user")).toBe(
      "preserve_anonymized"
    );
  });

  it("exposes declarative policy constants for tests", () => {
    expect(ACCOUNT_DELETION_TABLE_POLICY.inbox_messages_recipient_owned).toBe(
      "hard_delete"
    );
    expect(ACCOUNT_DELETION_SCHEMA_REQUIREMENTS.length).toBeGreaterThan(0);
    expect(STORY_ANONYMIZATION_PII_FIELDS).toContain("user_id");
    expect(STORY_ANONYMIZATION_PII_FIELDS).toContain("email");
  });
});

describe("parseStoragePathFromReference", () => {
  it("parses bucket-prefixed references", () => {
    expect(
      parseStoragePathFromReference(
        "journey-private-media/user-target/thread/video.mp4",
        "journey-private-media"
      )
    ).toBe("user-target/thread/video.mp4");
  });
});

describe("buildAccountDeletionDryRunManifest", () => {
  it("derives target user from deletion request id only", async () => {
    const deps = buildDeps();
    const result = await buildAccountDeletionDryRunManifest("req-1", deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(deps.loadDeletionRequest).toHaveBeenCalledWith("req-1");
    expect(result.manifest.identity.targetUserId).toBe("user-target");
    expect(result.manifest.identity.requestId).toBe("req-1");
  });

  it("blocks owner accounts with BLOCKED_OWNER_ACCOUNT", async () => {
    const deps = buildDeps({
      loadProfile: vi.fn(async () => ({
        id: "user-target",
        email: "owner@example.com",
        username: "owner",
        display_name: "Owner",
        avatar_url: null,
        is_owner: true,
        is_admin: false,
      })),
    });

    const result = await buildAccountDeletionDryRunManifest("req-1", deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.manifest.blocked).toBe(true);
    expect(result.manifest.blockCode).toBe(BLOCKED_OWNER_ACCOUNT_CODE);
  });

  it("warns for admin targets without blocking", async () => {
    const deps = buildDeps({
      loadProfile: vi.fn(async () => ({
        id: "user-target",
        email: "admin@example.com",
        username: "admin",
        display_name: "Admin",
        avatar_url: null,
        is_owner: false,
        is_admin: true,
      })),
    });

    const result = await buildAccountDeletionDryRunManifest("req-1", deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.manifest.blocked).toBe(false);
    expect(result.manifest.identity.isAdmin).toBe(true);
    expect(result.manifest.warnings.some((warning) => warning.includes("is_admin"))).toBe(
      true
    );
  });

  it("handles missing profile and missing auth user", async () => {
    const deps = buildDeps({
      loadProfile: vi.fn(async () => null),
      authUserExists: vi.fn(async () => false),
    });

    const result = await buildAccountDeletionDryRunManifest("req-1", deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.manifest.warnings.some((warning) => warning.includes("No profile"))).toBe(
      true
    );
    expect(result.manifest.warnings.some((warning) => warning.includes("Auth user"))).toBe(
      true
    );
    expect(result.manifest.identity.authUserExists).toBe(false);
  });

  it("labels legacy completed requests as administrative closure only", async () => {
    for (const status of ["legacy_completed", "completed"] as const) {
      const deps = buildDeps({
        loadDeletionRequest: vi.fn(async () => ({
          id: "req-completed",
          user_id: "user-target",
          email: "target@example.com",
          reason: null,
          status,
          created_at: "2026-01-01T00:00:00.000Z",
          target_user_id_snapshot: "user-target",
          target_username_snapshot: null,
        })),
      });

      const result = await buildAccountDeletionDryRunManifest(
        "req-completed",
        deps
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.manifest.warnings).toContain(LEGACY_COMPLETED_STATUS_NOTE);
    }
  });

  it("describes approved requests as not yet deleted", async () => {
    const deps = buildDeps({
      loadDeletionRequest: vi.fn(async () => ({
        id: "req-approved",
        user_id: "user-target",
        email: "target@example.com",
        reason: null,
        status: "approved",
        created_at: "2026-01-01T00:00:00.000Z",
        target_user_id_snapshot: "user-target",
        target_username_snapshot: null,
      })),
    });

    const result = await buildAccountDeletionDryRunManifest("req-approved", deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(
      result.manifest.warnings.some((warning) =>
        warning.includes("permanent deletion has not run yet")
      )
    ).toBe(true);
  });

  it("classifies private records hard-delete and public stories anonymize", async () => {
    const result = await buildAccountDeletionDryRunManifest("req-1", buildDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(
      result.manifest.database.hardDelete.some((row) => row.table === "profiles")
    ).toBe(true);
    expect(
      result.manifest.database.hardDelete.some((row) => row.table === "saved_content")
    ).toBe(true);
    expect(
      result.manifest.database.anonymize.some((row) => row.table === "stories")
    ).toBe(true);
    expect(result.manifest.publicContent.stories[0]?.bodyTextPreserved).toBe(true);
    expect(result.manifest.publicContent.stories[0]?.fieldsToAnonymize).toEqual(
      STORY_ANONYMIZATION_PII_FIELDS
    );
  });

  it("classifies journey recipient rows delete and sent rows preserve/anonymize", async () => {
    const result = await buildAccountDeletionDryRunManifest("req-1", buildDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.manifest.journey.recipientOwnedRows.plannedAction).toBe(
      "hard_delete"
    );
    expect(result.manifest.journey.sentToOtherUserRows.plannedAction).toBe(
      "preserve_anonymized"
    );
    expect(result.manifest.journey.privateMediaObjects.length).toBeGreaterThan(0);
  });

  it("includes storage ownership source and manual review for ambiguous refs", async () => {
    const deps = buildDeps({
      listStories: vi.fn(async () => [
        {
          id: "story-ambiguous",
          status: "approved",
          story_type: "Prayer Request",
          image_url: "unknown-format-ref",
          video_url: null,
          thumbnail_url: null,
        },
      ]),
    });

    const result = await buildAccountDeletionDryRunManifest("req-1", deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ambiguous = result.manifest.storage.objects.find(
      (object) => object.plannedAction === "manual_review"
    );
    expect(ambiguous?.ownershipSource).toBe("ambiguous_reference");
  });

  it("preserves audit records and deletion request retention warning", async () => {
    const result = await buildAccountDeletionDryRunManifest("req-1", buildDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.manifest.audit.retain.some((row) => row.table === "admin_action_logs")).toBe(
      true
    );
    expect(result.manifest.audit.retain.some((row) => row.table === "content_reports")).toBe(
      true
    );
    expect(result.manifest.audit.deletionRequestRetentionWarning).toContain(
      "SET NULL"
    );
  });

  it("returns schema requirements and FK gap warnings", async () => {
    const result = await buildAccountDeletionDryRunManifest("req-1", buildDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.manifest.schemaRequirements).toEqual(
      ACCOUNT_DELETION_SCHEMA_REQUIREMENTS
    );
    expect(
      result.manifest.warnings.some((warning) =>
        warning.includes("content_reports.reported_user_id")
      )
    ).toBe(true);
  });

  it("returns not_found when request id is unknown", async () => {
    const deps = buildDeps({
      loadDeletionRequest: vi.fn(async () => null),
    });

    const result = await buildAccountDeletionDryRunManifest("missing", deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("not_found");
  });

  it("is side-effect free across repeated dry-runs", async () => {
    const deps = buildDeps();
    const first = await buildAccountDeletionDryRunManifest("req-1", deps);
    const second = await buildAccountDeletionDryRunManifest("req-1", deps);

    expect(first).toEqual(second);
    expect(deps.loadDeletionRequest).toHaveBeenCalledTimes(2);
  });
});
