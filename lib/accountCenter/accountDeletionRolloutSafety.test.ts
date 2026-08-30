import { readFileSync } from "node:fs";
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

  it("does not ship a destructive executor endpoint in admin or API surfaces", () => {
    const adminPage = readFileSync("app/admin/page.tsx", "utf8");
    const dryRunHandler = readFileSync(
      "lib/server/accountDeletionDryRunHandler.ts",
      "utf8"
    );

    expect(adminPage).not.toContain("auth.admin.deleteUser");
    expect(adminPage).not.toContain("completeDeletionRequest");
    expect(adminPage).not.toContain("Mark Completed");
    expect(dryRunHandler).not.toContain("deleteUser");
  });
});
