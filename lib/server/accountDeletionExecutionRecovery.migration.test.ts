import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCOUNT_DELETION_EXECUTION_RECOVERY_MIGRATION } from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH = ACCOUNT_DELETION_EXECUTION_RECOVERY_MIGRATION.relativePath;

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

function migrationSqlStatements(migration: string): string {
  return migration
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function functionBody(migration: string, functionName: string): string {
  const pattern = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${functionName}[\\s\\S]*?\\$\\$;`,
    "i"
  );
  const match = migration.match(pattern);
  expect(match, `expected function body for ${functionName}`).toBeTruthy();
  return match![0];
}

describe("account deletion execution recovery migration (Phase 4C.7B.1E.2C.3B.2F.2A)", () => {
  it("wraps changes in a transaction and does not cancel on apply", () => {
    const migration = readMigration();
    const sql = migrationSqlStatements(migration);
    expect(migration).toMatch(/^\s*BEGIN;/m);
    expect(migration).toMatch(/^\s*COMMIT;/m);
    expect(sql).not.toMatch(/\bPERFORM\s+public\.cancel_account_deletion_execution\s*\(/i);
    expect(sql).not.toMatch(/\bSELECT\s+public\.cancel_account_deletion_execution\s*\(/i);
    expect(sql).not.toMatch(/signOut/i);
    expect(sql).not.toContain("HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED");
  });

  it("defines one narrow cancel RPC with owner check, lock, and irreversible stage", () => {
    const migration = readMigration();
    const rpcBody = functionBody(migration, "cancel_account_deletion_execution");
    expect(rpcBody).toContain("SECURITY DEFINER");
    expect(rpcBody).toContain("SET search_path = ''");
    expect(rpcBody).toContain("account_deletion_actor_is_owner");
    expect(rpcBody).toContain("pg_advisory_xact_lock");
    expect(rpcBody).toContain("FOR UPDATE");
    expect(rpcBody).toContain("irreversible_stage");
    expect(rpcBody).toContain("irreversible_state");
    expect(rpcBody).toContain("execution_cancelled");
    expect(rpcBody).toContain("already_cancelled");
    expect(rpcBody).not.toContain("current_setting");
    expect(migration).not.toContain("set_account_deletion_request_status");
    expect(migration).toContain("verify_account_deletion_schema_execution_ready_before_3b2f2a");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.cancel_account_deletion_execution(uuid, uuid, uuid) FROM authenticated"
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.cancel_account_deletion_execution(uuid, uuid, uuid) TO service_role"
    );
  });
});
