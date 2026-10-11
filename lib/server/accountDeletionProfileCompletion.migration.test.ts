import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_PROFILE_COMPLETION_FOUNDATION_MIGRATION,
  ACCOUNT_DELETION_PROFILE_COMPLETION_FOUNDATION_NOTE,
} from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH =
  ACCOUNT_DELETION_PROFILE_COMPLETION_FOUNDATION_MIGRATION.relativePath;

function withoutFunctionBodies(migration: string): string {
  return migration.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/gi, "");
}

describe("account deletion profile completion foundation (3B.4C.1)", () => {
  it("defines finalize RPC with audit extension and readiness composition", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    const outsideFunctions = withoutFunctionBodies(migration);

    expect(migration.match(/^\s*BEGIN;/gm)).toHaveLength(1);
    expect(migration.match(/^\s*COMMIT;/gm)).toHaveLength(1);
    expect(migration).toContain("finalize_account_deletion_profile_stage");
    expect(migration).toContain("verify_account_deletion_profile_completion_ready");
    expect(migration).toContain("profile_shell_deleted");
    expect(migration).toContain("profile_completed");
    expect(migration).toContain(
      "account_deletion_profile_media_completion_blocked"
    );
    expect(migration).toContain("verify_account_deletion_schema_execution_ready_before_3b4c");
    expect(migration).toContain("already_finalized");
    expect(migration).toContain("inconsistent_state");

    expect(outsideFunctions).not.toMatch(/\bGRANT\s+DELETE\s+ON\s+TABLE\s+public\.profiles\b/i);
    expect(migration).not.toMatch(/auth\.admin\.deleteUser/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+storage\.objects\b/i);
    expect(migration).not.toMatch(/\.remove\s*\(/i);

    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.finalize_account_deletion_profile_stage(uuid, uuid) TO service_role"
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.finalize_account_deletion_profile_stage(uuid, uuid) FROM authenticated"
    );

    expect(ACCOUNT_DELETION_PROFILE_COMPLETION_FOUNDATION_NOTE).toContain(
      "profile_completed"
    );
  });

  it("finalizer locks results and does not insert execution context", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    expect(migration).toMatch(
      /disposition_snapshot = 'DEFER_PROFILE'[\s\S]{0,400}FOR UPDATE/
    );
    expect(migration).not.toMatch(
      /INSERT INTO public\.account_deletion_database_execution_context[\s\S]{0,800}finalize_account_deletion_profile_stage/is
    );
    expect(migration).toMatch(/DELETE FROM public\.profiles AS profile_row/);
    expect(migration).toContain("profile_shell_deleted");
    expect(migration).toMatch(/profile_rows_affected[\s\S]{0,80}profile_shell_deleted/);
  });
});
