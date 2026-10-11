import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_TRANSITIONAL_DB_STATUSES,
  describeAccountDeletionDryRunStatus,
  getAccountDeletionStatusUserLabel,
  isLegacyAdministrativeClosureStatus,
  LEGACY_COMPLETED_RAW_STATUS,
  LEGACY_COMPLETED_STATUS_NOTE,
  normalizeLegacyDeletionStatus,
} from "./accountDeletionLifecycle";
import {
  buildAccountDeletionInsertRow,
  isOpenAccountDeletionRequest,
} from "./accountDeletionRequest";

function sourceFilesUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(fullPath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

describe("account deletion rollout safety", () => {
  it("transitional migration retains legacy completed writes for old admin bundles", () => {
    const migration = readFileSync(
      "supabase/migrations/20260829190000_account_deletion_lifecycle_phase4c7b1b.sql",
      "utf8"
    );

    expect(migration).toContain("BEGIN;");
    expect(migration).toContain("COMMIT;");
    expect(migration).toContain("'completed'::text");
    expect(migration).toContain("'legacy_completed'::text");
    expect(migration).toContain("enforce_account_deletion_user_cancellation");
  });

  it("documents transitional DB statuses including raw completed", () => {
    expect(ACCOUNT_DELETION_TRANSITIONAL_DB_STATUSES).toContain(
      LEGACY_COMPLETED_RAW_STATUS
    );
    expect(ACCOUNT_DELETION_TRANSITIONAL_DB_STATUSES).toContain(
      "legacy_completed"
    );
    expect(ACCOUNT_DELETION_TRANSITIONAL_DB_STATUSES).toContain("approved");
  });

  it("treats raw completed and legacy_completed as non-deleted historical closure", () => {
    expect(normalizeLegacyDeletionStatus("completed")).toBe("legacy_completed");
    expect(isLegacyAdministrativeClosureStatus("completed")).toBe(true);
    expect(isLegacyAdministrativeClosureStatus("legacy_completed")).toBe(true);
    expect(getAccountDeletionStatusUserLabel("completed")).toContain(
      "not deleted"
    );
    expect(describeAccountDeletionDryRunStatus("completed")).toBe(
      LEGACY_COMPLETED_STATUS_NOTE
    );
  });

  it("does not treat legacy closure as an open request blocking resubmission", () => {
    expect(
      isOpenAccountDeletionRequest({
        id: "req-legacy",
        user_id: "user-1",
        email: "user@example.com",
        reason: null,
        status: "completed",
        created_at: "2026-01-01T00:00:00.000Z",
      })
    ).toBe(false);
    expect(
      isOpenAccountDeletionRequest({
        id: "req-legacy-2",
        user_id: "user-1",
        email: "user@example.com",
        reason: null,
        status: "legacy_completed",
        created_at: "2026-01-01T00:00:00.000Z",
      })
    ).toBe(false);
  });

  it("keeps legacy insert contract compatible before snapshot columns are populated by callers", () => {
    const legacyInsert = {
      user_id: "user-1",
      email: "owner@example.com",
      reason: null,
      status: "submitted",
    };

    expect(buildAccountDeletionInsertRow({
      userId: "user-1",
      email: "owner@example.com",
    })).toMatchObject(legacyInsert);

    expect(
      Object.keys(
        buildAccountDeletionInsertRow({
          userId: "user-1",
          email: "owner@example.com",
          username: "owner",
        })
      )
    ).toEqual([
      "user_id",
      "email",
      "reason",
      "status",
      "target_user_id_snapshot",
      "target_username_snapshot",
    ]);
  });

  it("preserves story media in dry-run policy modules", () => {
    const manifestSource = readFileSync(
      "lib/server/accountDeletionManifest.ts",
      "utf8"
    );
    expect(manifestSource).toContain("plannedClassification");
    expect(manifestSource).toContain("listPrayerVideoResponses");
  });

  it("does not ship a destructive executor endpoint in admin or API surfaces", () => {
    const adminPage = readFileSync("app/admin/page.tsx", "utf8");
    const dryRunHandler = readFileSync(
      "lib/server/accountDeletionDryRunHandler.ts",
      "utf8"
    );
    const executeHandler = readFileSync(
      "lib/server/accountDeletionExecuteHandler.ts",
      "utf8"
    );
    const executor = readFileSync("lib/server/accountDeletionExecutor.ts", "utf8");
    const executeRoute = readFileSync(
      "app/api/admin/account-deletion/[requestId]/execute/route.ts",
      "utf8"
    );
    const storageExecutor = readFileSync(
      "lib/server/accountDeletionStorageExecutor.ts",
      "utf8"
    );

    expect(adminPage).not.toContain("auth.admin.deleteUser");
    expect(adminPage).not.toContain("completeDeletionRequest");
    expect(adminPage).not.toContain("Mark Completed");
    expect(adminPage).not.toContain("Execute Permanent Deletion");
    expect(dryRunHandler).not.toContain("deleteUser");
    expect(executeHandler).not.toContain("deleteUser");
    expect(executor).not.toContain("deleteUser");
    expect(executor).not.toContain(".remove(");
    expect(executeHandler).not.toContain("accountDeletionStorageExecutor");
    expect(executeRoute).not.toContain("accountDeletionStorageExecutor");
    expect(executeHandler).not.toContain("accountDeletionStorageObjectExecutor");
    expect(executeRoute).not.toContain("accountDeletionStorageObjectExecutor");
    expect(executeHandler).not.toContain("accountDeletionSupabaseStorageAdapter");
    expect(executeRoute).not.toContain("accountDeletionSupabaseStorageAdapter");
    expect(executeHandler).not.toContain("executeAccountDeletionStorageObject");
    expect(executeRoute).not.toContain("executeAccountDeletionStorageObject");
    expect(executeHandler).not.toContain("accountDeletionStorageStageRunner");
    expect(executeRoute).not.toContain("accountDeletionStorageStageRunner");
    expect(executeHandler).not.toContain("accountDeletionProfileStage");
    expect(executeRoute).not.toContain("accountDeletionProfileStage");
    expect(executeHandler).not.toContain("prepareAccountDeletionProfileStage");
    expect(executeRoute).not.toContain("prepare_account_deletion_profile_stage");
    expect(executeHandler).toContain("runAccountDeletionExecutionOrchestrator");
    expect(executeRoute).toContain("handleAccountDeletionExecuteRequest");
    expect(executeHandler).not.toContain(".remove(");
    expect(executeRoute).not.toContain(".remove(");
    expect(storageExecutor).not.toContain("deleteUser");
    const orchestrator = readFileSync(
      "lib/server/accountDeletionExecutionOrchestrator.ts",
      "utf8"
    );
    expect(orchestrator).toContain("runAccountDeletionStorageStageTick");
    expect(orchestrator).not.toContain("executeAccountDeletionStorageObject");
    expect(orchestrator).not.toContain("deleteUser");
    expect(orchestrator).not.toContain("cron");
    expect(orchestrator).not.toContain("queue");
    expect(readFileSync("lib/server/accountDeletionPolicy.ts", "utf8")).toContain(
      "preserve_public"
    );
    expect(readFileSync("lib/server/accountDeletionStoragePolicy.ts", "utf8")).toContain(
      "PRESERVE_SHARED"
    );
  });

  it("keeps story media out of DELETE_PRIVATE classifications in policy modules", () => {
    const policy = readFileSync("lib/server/accountDeletionPolicy.ts", "utf8");
    expect(policy).toContain('"story-videos": "preserve_public"');
    expect(policy).not.toContain('"story-videos": "hard_delete"');
  });

  it("keeps the 3B.4B.2A profile-media executor completely unwired", () => {
    const protectedEntryPoints = [
      "lib/server/accountDeletionExecutionOrchestrator.ts",
      "lib/server/accountDeletionExecuteHandler.ts",
      "app/api/admin/account-deletion/[requestId]/execute/route.ts",
    ];
    for (const file of protectedEntryPoints) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("accountDeletionProfileMediaObjectExecutor");
      expect(source).not.toContain("accountDeletionProfileMediaStorageAdapter");
      expect(source).not.toContain("executeAccountDeletionProfileMediaObject");
      expect(source).not.toContain("profile_completed");
    }

    expect(
      existsSync("lib/server/accountDeletionProfileMediaStageRunner.ts")
    ).toBe(false);
    expect(
      existsSync("lib/server/accountDeletionProfileMediaRunner.ts")
    ).toBe(false);
  });

  it("keeps profile-avatar destructive authority server-only and adapter-local", () => {
    const clientRoots = ["app", "components", "contexts", "hooks"].filter(
      existsSync
    );
    for (const file of clientRoots.flatMap(sourceFilesUnder)) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain(
        "accountDeletionProfileMediaStorageAdapter"
      );
      expect(source, file).not.toContain(
        "accountDeletionProfileMediaObjectExecutor"
      );
    }

    const adapter = readFileSync(
      "lib/server/accountDeletionProfileMediaStorageAdapter.ts",
      "utf8"
    );
    const executor = readFileSync(
      "lib/server/accountDeletionProfileMediaObjectExecutor.ts",
      "utf8"
    );
    const ordinaryAdapter = readFileSync(
      "lib/server/accountDeletionSupabaseStorageAdapter.ts",
      "utf8"
    );
    expect(adapter).toContain(
      'ACCOUNT_DELETION_PROFILE_MEDIA_STORAGE_BUCKET =\n  "profile-avatars"'
    );
    expect(adapter).toMatch(/\.remove\(\[objectPath\]\)/);
    expect(executor).not.toMatch(/\.remove\s*\(/);
    expect(ordinaryAdapter).toContain(
      'ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET =\n  "journey-private-media"'
    );
    expect(ordinaryAdapter).toContain(
      '"profile-avatars": "bucket_profile_avatars_forbidden"'
    );
  });

  it("keeps 3B.4B.2.1 selector migration read-only and unwired", () => {
    const migration = readFileSync(
      "supabase/migrations/20260919260000_account_deletion_profile_media_runner_foundation_phase4c7b1e2c3b4b2.sql",
      "utf8"
    );
    expect(migration).toContain(
      "select_account_deletion_profile_media_actionable_result_ids"
    );
    expect(migration).not.toContain("profile_completed");
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+storage\.objects\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+public\.profiles\b/i);
    expect(migration).not.toMatch(/\bauth\.users\b/i);
    expect(
      existsSync("lib/server/accountDeletionProfileMediaStageRunner.ts")
    ).toBe(false);
  });

  it("adds no profile/Auth row deletion or profile completion transition", () => {
    const productionSources = [
      "lib/server/accountDeletionStorageProviderSafety.ts",
      "lib/server/accountDeletionProfileMediaStorageAdapter.ts",
      "lib/server/accountDeletionProfileMediaObjectExecutor.ts",
    ].map((file) => readFileSync(file, "utf8"));
    for (const source of productionSources) {
      expect(source).not.toMatch(/DELETE\s+FROM\s+storage\.objects/i);
      expect(source).not.toMatch(/DELETE\s+FROM\s+(?:public\.)?profiles/i);
      expect(source).not.toMatch(/DELETE\s+FROM\s+auth\.users/i);
      expect(source).not.toContain("auth.admin.deleteUser");
      expect(source).not.toContain("profile_completed");
    }
  });
});
