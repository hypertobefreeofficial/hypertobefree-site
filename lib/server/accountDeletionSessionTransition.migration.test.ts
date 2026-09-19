import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCOUNT_DELETION_SESSION_TRANSITION_MIGRATION } from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH = ACCOUNT_DELETION_SESSION_TRANSITION_MIGRATION.relativePath;

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

describe("account deletion session transition migration (Phase 4C.7B.1E.2C.3B.2B)", () => {
  it("wraps changes in a transaction", () => {
    const migration = readMigration();
    expect(migration).toMatch(/^\s*BEGIN;/m);
    expect(migration).toMatch(/^\s*COMMIT;/m);
  });

  it("defines narrow stage transition RPCs without generic stage setter", () => {
    const migration = readMigration();
    expect(migration).toContain(
      "advance_account_deletion_attempt_to_sessions_pending"
    );
    expect(migration).toContain(
      "advance_account_deletion_attempt_to_sessions_revoked"
    );
    expect(migration).toContain(
      "advance_account_deletion_attempt_to_inventory"
    );
    expect(migration).toContain(
      "record_account_deletion_session_revocation_failure"
    );
    expect(migration).not.toMatch(/set_account_deletion_attempt_stage/i);
  });

  it("revokes service_role direct mutation on execution attempts", () => {
    const migration = readMigration();
    expect(migration).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON TABLE public.account_deletion_execution_attempts FROM service_role"
    );
    expect(migration).toContain(
      "GRANT SELECT ON TABLE public.account_deletion_execution_attempts TO service_role"
    );
  });

  it("composes session transition readiness into schema execution readiness", () => {
    const migration = readMigration();
    expect(migration).toContain(
      "verify_account_deletion_session_transition_foundation_ready()"
    );
    expect(migration).toContain(
      "verify_account_deletion_schema_execution_ready_before_3b2b"
    );
  });
});
