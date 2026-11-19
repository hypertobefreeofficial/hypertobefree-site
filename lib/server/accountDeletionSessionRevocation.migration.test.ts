import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCOUNT_DELETION_SESSION_REVOCATION_MIGRATION } from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH = ACCOUNT_DELETION_SESSION_REVOCATION_MIGRATION.relativePath;

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

describe("account deletion target session revocation migration (Phase 3B.4D.5)", () => {
  it("wraps changes in a transaction", () => {
    const migration = readMigration();
    expect(migration).toMatch(/^\s*BEGIN;/m);
    expect(migration).toMatch(/^\s*COMMIT;/m);
  });

  it("defines narrow service_role-only revocation RPC", () => {
    const migration = readMigration();
    expect(migration).toContain("revoke_account_deletion_target_auth_sessions");
    expect(migration).toContain("DELETE FROM auth.sessions");
    expect(migration).toContain("current_stage <> 'sessions_pending'");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.revoke_account_deletion_target_auth_sessions(uuid, uuid) TO service_role"
    );
    expect(migration).not.toMatch(/auth\.admin\.signOut/i);
    expect(migration).not.toMatch(/auth\.admin\.deleteUser/i);
  });

  it("extends session transition readiness probe with revocation RPC", () => {
    const migration = readMigration();
    expect(migration).toContain(
      "revoke_account_deletion_target_auth_sessions(uuid, uuid)"
    );
    expect(migration).toContain("auth_sessions_table_present");
  });

  it("does not expose revocation RPC to authenticated or anon", () => {
    const migration = readMigration();
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.revoke_account_deletion_target_auth_sessions(uuid, uuid) FROM authenticated"
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.revoke_account_deletion_target_auth_sessions(uuid, uuid) FROM anon"
    );
  });
});
