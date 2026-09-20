import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCOUNT_DELETION_REQUEST_PRIVILEGE_MIGRATION } from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH = ACCOUNT_DELETION_REQUEST_PRIVILEGE_MIGRATION.relativePath;

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

function withoutFunctionBodies(migration: string): string {
  return migration.replace(
    /CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/gi,
    ""
  );
}

describe("account deletion request privilege hardening (Phase 4C.7B.1E.2C.3B.2F.2A.1)", () => {
  it("is one transaction and hardens only service_role table privileges", () => {
    const migration = readMigration();
    const outsideFunctions = withoutFunctionBodies(migration);

    expect(migration.match(/^\s*BEGIN;/gm)).toHaveLength(1);
    expect(migration.match(/^\s*COMMIT;/gm)).toHaveLength(1);
    expect(migration).toContain(
      "REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER"
    );
    expect(migration).toContain("ON TABLE public.account_deletion_requests");
    expect(migration).toContain("FROM service_role");
    expect(migration).toContain("GRANT SELECT");
    expect(migration).toContain("TO service_role");
    expect(migration).not.toMatch(
      /ON TABLE public\.account_deletion_requests[\s\S]{0,120}FROM authenticated/i
    );
    expect(migration).not.toMatch(
      /ON TABLE public\.account_deletion_requests[\s\S]{0,120}FROM anon/i
    );
    expect(migration).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(migration).not.toMatch(/CREATE POLICY/i);
    expect(migration).not.toMatch(/DROP POLICY/i);
    expect(outsideFunctions).not.toMatch(
      /\bUPDATE\s+public\.account_deletion_requests\b/i
    );
    expect(outsideFunctions).not.toMatch(
      /\bDELETE\s+FROM\s+public\.account_deletion_requests\b/i
    );
    expect(outsideFunctions).not.toMatch(
      /\b(?:PERFORM|SELECT)\s+public\.acquire_account_deletion_execution_lock\s*\(/i
    );
    expect(outsideFunctions).not.toMatch(
      /\b(?:PERFORM|SELECT)\s+public\.cancel_account_deletion_execution\s*\(/i
    );
    expect(migration).not.toMatch(/signOut/i);
    expect(migration).toContain(
      "verify_account_deletion_schema_execution_ready_before_3b2f2a1"
    );
  });
});
