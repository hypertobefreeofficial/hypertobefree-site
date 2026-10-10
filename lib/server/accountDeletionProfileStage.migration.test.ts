import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_PROFILE_STAGE_FOUNDATION_MIGRATION,
  ACCOUNT_DELETION_PROFILE_STAGE_FOUNDATION_NOTE,
} from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH =
  ACCOUNT_DELETION_PROFILE_STAGE_FOUNDATION_MIGRATION.relativePath;

function withoutFunctionBodies(migration: string): string {
  return migration.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/gi, "");
}

describe("account deletion profile stage foundation (Phase 4C.7B.1E.2C.3B.4A)", () => {
  it("P-A-GLOBAL-SCHEMA: defines prepare RPC without Storage or profile DELETE", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    const outsideFunctions = withoutFunctionBodies(migration);

    expect(migration.match(/^\s*BEGIN;/gm)).toHaveLength(1);
    expect(migration.match(/^\s*COMMIT;/gm)).toHaveLength(1);
    expect(migration).toContain("prepare_account_deletion_profile_stage");
    expect(migration).toContain("account_deletion_profile_cleanup_snapshot");
    expect(migration).toContain("verify_account_deletion_profile_stage_ready");
    expect(migration).toContain("profile_completed");
    expect(migration).toContain("profile_rows_affected");
    expect(migration).toContain("profile_stage_entered");
    expect(migration).toContain("profile_private_data_deleted");
    expect(migration).toContain("profile_identity_scrubbed");
    expect(migration).toContain(
      "account_deletion_storage_execution_completion_blocked"
    );
    expect(migration).toMatch(/lock_key := pg_catalog\.hashtextextended/);
    expect(migration).not.toMatch(/lock_key := public\.hashtextextended/);

    expect(outsideFunctions).not.toMatch(
      /\bDELETE\s+FROM\s+public\.profiles\b/i
    );
    expect(migration).not.toMatch(/profile-avatars/i);
    expect(outsideFunctions).not.toMatch(/\bDELETE\s+FROM\s+storage\.objects\b/i);
    expect(migration).not.toMatch(/\.remove\s*\(/i);
    expect(migration).not.toMatch(/HTBF_ACCOUNT_DELETION_PROFILE_EXECUTION_ENABLED/i);
    expect(migration).not.toMatch(/auth\.admin\.deleteUser/i);
    expect(migration).not.toMatch(/\bdeleteUser\b/i);

    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.prepare_account_deletion_profile_stage(uuid, uuid) TO service_role"
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.prepare_account_deletion_profile_stage(uuid, uuid) FROM authenticated"
    );

    expect(ACCOUNT_DELETION_PROFILE_STAGE_FOUNDATION_NOTE).toContain(
      "No profile row DELETE"
    );
  });

  it("P-A-NO-PROFILE-DELETE: prepare body updates profiles but does not delete row", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    expect(migration).toMatch(/UPDATE public\.profiles AS profile_row/i);
    expect(migration).not.toMatch(
      /DELETE FROM public\.profiles AS profile_row/i
    );
  });

  it("P-A-PROFILE-SCRUB: tombstone email uses reserved .invalid domain only", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    expect(migration).toContain("@deleted.invalid");
    expect(migration).not.toMatch(/\.local/i);
    expect(migration).toMatch(
      /account-deletion\+' \|\| p_target_user_id::text \|\| '@deleted\.invalid'/
    );
  });

  it("P-A-PROFILE-SCRUB: tombstone username helper and profile_stage execution context", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    expect(migration).toContain("account_deletion_scrubbed_profile_username");
    expect(migration).toContain("account_deletion_profile_username_is_deletion_tombstone_namespace");
    expect(migration).toMatch(/\^del_\[0-9a-f\]\{20\}\$/);
    expect(migration).toContain("profile_deletion_username_namespace_clear");
    expect(migration).toContain("profile_username_tombstone_unavailable");
    expect(migration).toContain("'profile_stage'::text");
    expect(migration).toContain("account_deletion_profile_execution_context_is_valid");
    expect(migration).toContain("account_deletion_profile_recipient_inbox_delete_authorized");
    expect(migration).toContain("account_deletion_profile_username_scrub_authorized");
    expect(migration).toMatch(
      /account_deletion_profile_username_scrub_authorized\(OLD\.id, NEW\.username\)/
    );
  });
});
