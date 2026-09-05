import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ACCOUNT_DELETION_DATABASE_PLAN_INVARIANTS,
  ACCOUNT_DELETION_DIRECT_AUTH_FK_REGISTRY,
  ACCOUNT_DELETION_MODERATION_PII_RETENTION,
  ACCOUNT_DELETION_NON_FK_UUID_FIELD_POLICIES,
  ACCOUNT_DELETION_SCHEMA_PREREQUISITES,
  ACCOUNT_DELETION_SCHEMA_HARDENING_MIGRATION,
  ACCOUNT_DELETION_SCHEMA_READINESS_MODEL_NOTE,
  describeSchemaExecutionReadiness,
  ACCOUNT_DELETION_TRANSITIVE_CASCADE_REGISTRY,
  ACCOUNT_DELETION_DATABASE_TABLE_REGISTRY,
  assertDatabaseActionDoesNotEscalate,
  classifyDatabaseTablePolicy,
  DELETED_PUBLIC_AUTHOR_DISPLAY_NAME,
  getAuthDeleteBlastRadius,
  getDatabaseMutationOrderHints,
  getSchemaExecutionBlockers,
  getUnsafeAuthDeleteCascadeBlockers,
  isSchemaExecutionReady,
  PUBLIC_TESTIMONY_TABLES,
  resolveMostRestrictiveDatabaseAction,
  UNSAFE_AUTH_DELETE_CASCADE_TABLES,
  UNSAFE_TRANSITIVE_CASCADE_IDS,
} from "./accountDeletionDatabasePolicy";
import type { AccountDeletionManifest } from "./accountDeletionManifest";
import {
  ACCOUNT_DELETION_SCHEMA_NOT_READY_CODE,
  assertDatabaseStoragePlanContract,
  assertDestructiveExecutionAllowed,
  buildAccountDeletionDatabasePlan,
  getAnonymizedStoryIdentityPatch,
  rejectBrowserSuppliedDatabasePlanTargets,
  validateDatabasePlanInvariants,
} from "./accountDeletionDatabasePlan";
import { buildAccountDeletionStoragePlan } from "./accountDeletionStoragePlan";

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
      hardDelete: [
        {
          table: "inbox_messages",
          count: 2,
          plannedAction: "hard_delete",
          note: "recipient-owned",
        },
        {
          table: "story_reactions",
          count: 3,
          plannedAction: "hard_delete",
        },
      ],
      anonymize: [
        { table: "stories", count: 1, plannedAction: "anonymize" },
        { table: "prayer_video_responses", count: 1, plannedAction: "anonymize" },
      ],
      preserve: [
        { table: "admin_action_logs", count: 1, plannedAction: "preserve" },
        {
          table: "account_deletion_requests",
          count: 1,
          plannedAction: "preserve_minimal",
        },
      ],
      manualReview: [],
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
          plannedClassification: "PRESERVE_SHARED",
          exists: true,
        },
        {
          bucket: "profile-avatars",
          path: `${TARGET}/avatar.png`,
          ownershipSource: "profiles.avatar_url",
          plannedClassification: "DELETE_PRIVATE",
          requiresReferencesCleared: true,
          exists: true,
        },
      ],
    },
    journey: {
      recipientOwnedRows: {
        table: "inbox_messages",
        count: 2,
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

describe("accountDeletionDatabasePolicy", () => {
  it("classifies approved public stories as ANONYMIZE and tombstone for removed stories", () => {
    const policies = classifyDatabaseTablePolicy("stories");
    expect(
      policies.find((entry) => entry.selector.includes("status = 'approved'"))?.action
    ).toBe("ANONYMIZE");
    expect(
      policies.find((entry) =>
        entry.selector.includes("PREVIOUSLY_PUBLIC_OR_REMOVED")
      )?.action
    ).toBe("ANONYMIZE");
    expect(
      policies.some(
        (entry) =>
          entry.action === "HARD_DELETE" &&
          entry.selector.includes("status != 'approved'")
      )
    ).toBe(false);
  });

  it("classifies prayer responses and updates as ANONYMIZE", () => {
    expect(
      classifyDatabaseTablePolicy("prayer_video_responses")[0]?.action
    ).toBe("ANONYMIZE");
    expect(classifyDatabaseTablePolicy("prayer_updates")[0]?.action).toBe("ANONYMIZE");
  });

  it("classifies private profile data path as HARD_DELETE", () => {
    expect(classifyDatabaseTablePolicy("profiles")[0]?.action).toBe("HARD_DELETE");
  });

  it("classifies recipient-owned Journey inbox as HARD_DELETE and sent copies as DETACH", () => {
    const inboxPolicies = classifyDatabaseTablePolicy("inbox_messages");
    expect(
      inboxPolicies.find((entry) => entry.selector.startsWith("user_id = targetUserId"))
        ?.action
    ).toBe("HARD_DELETE");
    expect(
      inboxPolicies.find((entry) =>
        entry.selector.includes("sender_user_id = targetUserId")
      )?.action
    ).toBe("DETACH");
  });

  it("preserves audit and deletion request rows", () => {
    expect(classifyDatabaseTablePolicy("admin_action_logs")[0]?.action).toBe(
      "PRESERVE"
    );
    expect(classifyDatabaseTablePolicy("account_deletion_requests")[0]?.action).toBe(
      "PRESERVE"
    );
  });

  it("flags unsafe auth delete cascades on public response tables", () => {
    expect(UNSAFE_AUTH_DELETE_CASCADE_TABLES).toContain("prayer_video_responses");
    expect(getUnsafeAuthDeleteCascadeBlockers().join(" ")).toContain("CASCADE");
  });

  it("represents stories.user_id NOT NULL as a schema blocker", () => {
    const blocker = ACCOUNT_DELETION_SCHEMA_PREREQUISITES.find(
      (entry) => entry.id === "stories_user_id_nullable"
    );
    expect(blocker?.currentState).toContain("NOT NULL");
    expect(blocker?.satisfied).toBe(false);
    expect(blocker?.migrationFile).toBe(
      ACCOUNT_DELETION_SCHEMA_HARDENING_MIGRATION.relativePath
    );
    expect(getSchemaExecutionBlockers().join(" ")).toContain("stories.user_id");
  });

  it("does not enable schemaExecutionReady from local hardening migration design", () => {
    expect(describeSchemaExecutionReadiness().migrationDesignedLocally).toBe(true);
    expect(describeSchemaExecutionReadiness().prerequisitesEnvironmentVerified).toBe(
      false
    );
    expect(describeSchemaExecutionReadiness().schemaExecutionReady).toBe(false);
    expect(ACCOUNT_DELETION_SCHEMA_READINESS_MODEL_NOTE).toContain(
      "target-environment verification"
    );
  });

  it("represents prayer author FK cascades as schema blockers", () => {
    expect(
      ACCOUNT_DELETION_SCHEMA_PREREQUISITES.some(
        (entry) => entry.table === "prayer_video_responses" && !entry.satisfied
      )
    ).toBe(true);
    expect(
      ACCOUNT_DELETION_SCHEMA_PREREQUISITES.some(
        (entry) => entry.table === "prayer_written_responses" && !entry.satisfied
      )
    ).toBe(true);
    expect(
      ACCOUNT_DELETION_SCHEMA_PREREQUISITES.some(
        (entry) => entry.table === "prayer_updates" && !entry.satisfied
      )
    ).toBe(true);
  });

  it("registers inbox_messages.prayer_update_id CASCADE in FK registry", () => {
    const fk = ACCOUNT_DELETION_DIRECT_AUTH_FK_REGISTRY;
    expect(fk.some((entry) => entry.table === "inbox_messages")).toBe(true);
    const legacyRegistry = readFileSync(
      "lib/server/accountDeletionDatabasePolicy.ts",
      "utf8"
    );
    expect(legacyRegistry).toContain("prayer_update_id");
    expect(legacyRegistry).toContain("ON DELETE CASCADE");
  });

  it("registers content_reports.story_id CASCADE and detach policy", () => {
    const source = readFileSync(
      "lib/server/accountDeletionDatabasePolicy.ts",
      "utf8"
    );
    expect(source).toContain("content_reports.story_id");
    const detachPolicy = classifyDatabaseTablePolicy("content_reports").find(
      (entry) => entry.action === "DETACH"
    );
    expect(detachPolicy?.identityFields).toContain("story_id");
  });

  it("documents unsafe prayer update → inbox transitive cascade", () => {
    const chain = ACCOUNT_DELETION_TRANSITIVE_CASCADE_REGISTRY.find(
      (entry) => entry.id === "auth_prayer_updates_inbox_messages"
    );
    expect(chain?.classification).toBe("UNSAFE_PRESERVED_DATA_LOSS");
    expect(UNSAFE_TRANSITIVE_CASCADE_IDS).toContain("auth_prayer_updates_inbox_messages");
    expect(UNSAFE_TRANSITIVE_CASCADE_IDS).toContain(
      "story_delete_other_user_prayer_video_responses"
    );
  });

  it("auth delete blast radius is blocked on current schema", () => {
    const radius = getAuthDeleteBlastRadius({ schema: "current" });
    expect(radius.executionBlocked).toBe(true);
    expect(radius.transitiveEffects.join(" ")).toContain("prayer_updates");
  });

  it("classifies moderation PII retention and non-FK UUID policies", () => {
    expect(
      ACCOUNT_DELETION_MODERATION_PII_RETENTION.some(
        (entry) => entry.table === "content_reports" && entry.field === "details"
      )
    ).toBe(true);
    expect(
      ACCOUNT_DELETION_NON_FK_UUID_FIELD_POLICIES.some(
        (entry) =>
          entry.table === "content_reports" && entry.field === "reported_user_id"
      )
    ).toBe(true);
  });

  it("uses conservative database action merge", () => {
    expect(
      resolveMostRestrictiveDatabaseAction("HARD_DELETE", "ANONYMIZE")
    ).toBe("ANONYMIZE");
    expect(
      resolveMostRestrictiveDatabaseAction("HARD_DELETE", "DETACH")
    ).toBe("DETACH");
  });

  it("blocks policy escalation to HARD_DELETE", () => {
    expect(
      assertDatabaseActionDoesNotEscalate({
        from: "ANONYMIZE",
        to: "HARD_DELETE",
      }).ok
    ).toBe(false);
  });

  it("documents mutation ordering with auth delete last", () => {
    const order = getDatabaseMutationOrderHints().join(" ");
    expect(order).toContain("anonymize public testimony");
    expect(order).toContain("delete auth.users row LAST");
    expect(order).toContain("live schema probe");
  });

  it("protects all public testimony tables in invariants list", () => {
    expect(PUBLIC_TESTIMONY_TABLES).toContain("prayer_updates");
    expect(
      ACCOUNT_DELETION_DATABASE_PLAN_INVARIANTS.join(" ")
    ).toContain("prayer_updates");
  });
});

describe("accountDeletionDatabasePlan", () => {
  it("builds typed plan sections from manifest without SQL execution", () => {
    const plan = buildAccountDeletionDatabasePlan({ manifest: buildManifest() });

    expect(plan.anonymize.some((entry) => entry.table === "stories")).toBe(true);
    expect(plan.hardDelete.some((entry) => entry.table === "profiles")).toBe(true);
    expect(plan.hardDelete.some((entry) => entry.table === "stories")).toBe(false);
    expect(plan.detach.some((entry) => entry.table === "inbox_messages")).toBe(true);
    expect(plan.preserve.some((entry) => entry.table === "account_deletion_requests")).toBe(
      true
    );
    expect(validateDatabasePlanInvariants(plan).ok).toBe(true);
  });

  it("blocks destructive execution while schema prerequisites are unsatisfied", () => {
    const plan = buildAccountDeletionDatabasePlan({ manifest: buildManifest() });

    expect(isSchemaExecutionReady()).toBe(false);
    expect(plan.schemaExecutionReady).toBe(false);
    expect(plan.schemaBlockers.length).toBeGreaterThan(0);
    expect(plan.blockedExecution).toBe(true);
    expect(plan.blockCode).toBe(ACCOUNT_DELETION_SCHEMA_NOT_READY_CODE);
    expect(plan.blocked.some((entry) => entry.table === "schema")).toBe(true);
    expect(assertDestructiveExecutionAllowed(plan).ok).toBe(false);
  });

  it("sets profileAvatarReferencesWillBeCleared when profile hard-delete includes avatar_url", () => {
    const plan = buildAccountDeletionDatabasePlan({ manifest: buildManifest() });
    expect(plan.profileAvatarReferencesWillBeCleared).toBe(true);
  });

  it("blocks plan when Journey inventory is incomplete", () => {
    const plan = buildAccountDeletionDatabasePlan({
      manifest: buildManifest({
        journey: {
          ...buildManifest().journey,
          journeyReferenceInventoryComplete: false,
          unresolvedJourneyReferenceCount: 1,
        },
      }),
    });

    expect(plan.blockedExecution).toBe(true);
    expect(plan.blocked.length).toBeGreaterThan(0);
  });

  it("uses Deleted User anonymization patch for stories", () => {
    expect(getAnonymizedStoryIdentityPatch().name).toBe(
      DELETED_PUBLIC_AUTHOR_DISPLAY_NAME
    );
    expect(getAnonymizedStoryIdentityPatch().user_id).toBeNull();
  });

  it("rejects browser-supplied database plan targets", () => {
    expect(
      rejectBrowserSuppliedDatabasePlanTargets({ targetUserId: TARGET })
    ).toBe(true);
  });

  it("aligns with storage plan contract for preserved Journey media and avatar clearing", () => {
    const manifest = buildManifest();
    const databasePlan = buildAccountDeletionDatabasePlan({ manifest });
    const storagePlan = buildAccountDeletionStoragePlan({
      targetUserId: TARGET,
      manifest,
    });

    expect(
      assertDatabaseStoragePlanContract({ manifest, databasePlan, storagePlan }).ok
    ).toBe(true);
  });

  it("blocks privileged owner targets via manifest blocked flag", () => {
    const plan = buildAccountDeletionDatabasePlan({
      manifest: buildManifest({
        blocked: true,
        blockCode: "BLOCKED_OWNER_ACCOUNT",
        identity: {
          ...buildManifest().identity,
          isOwner: true,
        },
      }),
    });

    expect(plan.blockedExecution).toBe(true);
  });

  it("does not hard-delete approved public stories or prayer testimony tables", () => {
    const plan = buildAccountDeletionDatabasePlan({ manifest: buildManifest() });
    expect(
      plan.hardDelete.some(
        (entry) =>
          entry.table === "stories" && entry.selector.includes("status = 'approved'")
      )
    ).toBe(false);
    expect(plan.hardDelete.some((entry) => entry.table === "prayer_video_responses")).toBe(
      false
    );
    expect(plan.hardDelete.some((entry) => entry.table === "prayer_updates")).toBe(false);
  });
});

describe("account deletion database planning safety", () => {
  it("does not ship SQL mutation executors or auth delete in plan modules", () => {
    const policySource = readFileSync(
      "lib/server/accountDeletionDatabasePolicy.ts",
      "utf8"
    );
    const planSource = readFileSync(
      "lib/server/accountDeletionDatabasePlan.ts",
      "utf8"
    );
    const executeHandler = readFileSync(
      "lib/server/accountDeletionExecuteHandler.ts",
      "utf8"
    );

    expect(policySource).not.toContain("deleteUser");
    expect(planSource).not.toContain("deleteUser");
    expect(planSource).not.toContain(".remove(");
    expect(planSource).not.toContain("auth.admin");
    expect(executeHandler).not.toContain("accountDeletionDatabasePlan");
  });

  it("covers every registry table in the database inventory", () => {
    const tables = new Set(
      ACCOUNT_DELETION_DATABASE_TABLE_REGISTRY.map((entry) => entry.table)
    );
    expect(tables.has("stories")).toBe(true);
    expect(tables.has("inbox_messages")).toBe(true);
    expect(tables.has("prayer_video_responses")).toBe(true);
    expect(tables.has("account_deletion_requests")).toBe(true);
    expect(ACCOUNT_DELETION_DATABASE_PLAN_INVARIANTS.length).toBeGreaterThan(3);
  });

  it("keeps live execute route disconnected from database and storage executors", () => {
    const executeRoute = readFileSync(
      "app/api/admin/account-deletion/[requestId]/execute/route.ts",
      "utf8"
    );
    expect(executeRoute).not.toContain("accountDeletionDatabasePlan");
    expect(executeRoute).not.toContain("accountDeletionStorageExecutor");
  });
});

describe("database/storage cross-contract adversarial cases", () => {
  it("requires DETACH for inbox when storage marks Journey media PRESERVE_SHARED", () => {
    const manifest = buildManifest({
      journey: {
        ...buildManifest().journey,
        sentToOtherUserRows: {
          table: "inbox_messages",
          count: 1,
          plannedAction: "preserve_anonymized",
        },
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
            plannedClassification: "PRESERVE_SHARED",
            exists: true,
          },
        ],
      },
    });

    const databasePlan = buildAccountDeletionDatabasePlan({ manifest });
    const storagePlan = buildAccountDeletionStoragePlan({
      targetUserId: TARGET,
      manifest,
    });

    expect(storagePlan.preserveShared).toHaveLength(1);
    expect(databasePlan.detach.some((entry) => entry.table === "inbox_messages")).toBe(
      true
    );
    expect(
      assertDatabaseStoragePlanContract({ manifest, databasePlan, storagePlan }).ok
    ).toBe(true);
  });
});
