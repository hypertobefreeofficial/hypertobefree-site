import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCOUNT_DELETION_ACQUISITION_MIGRATION } from "./accountDeletionDatabasePolicy";
import { ACCOUNT_DELETION_EXECUTION_ENV_FLAG } from "./accountDeletionExecutionPolicy";
import { isSchemaExecutionReady } from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH = ACCOUNT_DELETION_ACQUISITION_MIGRATION.relativePath;

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

describe("account deletion acquisition migration (Phase 4C.7B.1E.2C.3A)", () => {
  it("wraps changes in a transaction", () => {
    const migration = readMigration();
    expect(migration).toMatch(/^\s*BEGIN;/m);
    expect(migration).toMatch(/^\s*COMMIT;/m);
  });

  it("has fail-closed preconditions and no request/content DML", () => {
    const migration = readMigration();
    const sql = migrationSqlStatements(migration);

    expect(migration).toContain("2C.3A precondition failed");
    expect(migration).toContain("account_deletion_execution_attempts missing");
    expect(sql).not.toMatch(/\bINSERT\s+INTO\s+public\.account_deletion_requests\b/i);
    expect(sql).not.toMatch(/\bSELECT\s+public\.acquire_account_deletion_execution_lock\s*\(/i);
    expect(sql).not.toMatch(/\bPERFORM\s+public\.acquire_account_deletion_execution_lock\s*\(/i);
    const preconditionBlock = migration.split("DO $$")[1]?.split("END;")[0] ?? "";
    expect(preconditionBlock).not.toMatch(/\bUPDATE\s+public\.account_deletion_requests\b/i);
    expect(preconditionBlock).not.toMatch(
      /\bINSERT\s+INTO\s+public\.account_deletion_execution_attempts\b/i
    );
    expect(sql).not.toMatch(/\bDELETE\s+FROM\s+public\./i);
    expect(sql).not.toMatch(/auth\.admin\.deleteUser/i);
    expect(sql).not.toMatch(/signOut/i);
    expect(sql).not.toMatch(/execute_account_deletion_nondestructive_database_stage/i);
  });

  it("defines attempt target/request validation trigger for all rows", () => {
    const migration = readMigration();
    const triggerBody = functionBody(
      migration,
      "trg_account_deletion_execution_attempt_target_validation"
    );

    expect(triggerBody).toContain("attempt_deletion_request_id_immutable");
    expect(triggerBody).toContain("attempt_target_user_id_immutable");
    expect(triggerBody).toContain("attempt_target_mismatch");
    expect(triggerBody).toContain("coalesce(request_row.user_id, request_row.target_user_id_snapshot)");
    expect(migration).toContain(
      "account_deletion_execution_attempt_target_validation"
    );
    expect(migration).toContain("BEFORE INSERT OR UPDATE ON public.account_deletion_execution_attempts");
  });

  it("defines acquisition RPC with FOR UPDATE, advisory lock, readiness, and owner check", () => {
    const migration = readMigration();
    const rpcBody = functionBody(
      migration,
      "acquire_account_deletion_execution_lock"
    );

    expect(rpcBody).not.toMatch(/\bp_target_user_id\b/i);
    expect(rpcBody).toContain("FOR UPDATE");
    expect(rpcBody).toContain("hashtextextended");
    expect(rpcBody).toContain("pg_advisory_xact_lock");
    expect(rpcBody).toContain("verify_account_deletion_schema_execution_ready()");
    expect(rpcBody).toContain("account_deletion_actor_is_owner");
    expect(rpcBody).toContain("coalesce(req.user_id, req.target_user_id_snapshot)");
    expect(rpcBody).toContain("'lock_acquired'");
    expect(rpcBody).toContain("'active'");
    expect(rpcBody).toContain("deletion_in_progress");
    expect(rpcBody).toContain("already_acquired");
    expect(rpcBody).toContain("ambiguous_state");
  });

  it("restricts acquisition RPC to service_role only", () => {
    const migration = readMigration();
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.acquire_account_deletion_execution_lock(uuid, uuid) FROM PUBLIC"
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.acquire_account_deletion_execution_lock(uuid, uuid) FROM authenticated"
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.acquire_account_deletion_execution_lock(uuid, uuid) TO service_role"
    );
    expect(migration).not.toContain(
      "GRANT EXECUTE ON FUNCTION public.acquire_account_deletion_execution_lock(uuid, uuid) TO authenticated"
    );
  });

  it("adds sessions_revoked stage and acquisition readiness prerequisites", () => {
    const migration = readMigration();
    expect(migration).toContain("'sessions_revoked'");
    expect(migration).toContain("execution_attempt_target_validation_ready");
    expect(migration).toContain("account_deletion_acquisition_rpc_ready");
    expect(migration).toContain("owner_execution_validation_ready");
    expect(migration).toContain("account_deletion_acquisition_security_ready");
    expect(migration).toContain(
      "verify_account_deletion_acquisition_foundation_ready"
    );
  });

  it("composes acquisition readiness into schema execution readiness", () => {
    const migration = readMigration();
    expect(migration).toContain(
      "verify_account_deletion_schema_execution_ready_before_acquisition"
    );
    const wrapper = functionBody(
      migration,
      "verify_account_deletion_schema_execution_ready"
    );
    expect(wrapper).toContain(
      "verify_account_deletion_schema_execution_ready_before_acquisition()"
    );
    expect(wrapper).toContain("verify_account_deletion_acquisition_foundation_ready()");
  });

  it("does not wire acquisition into execute handler or enable env gate", () => {
    const executeHandler = readFileSync(
      "lib/server/accountDeletionExecuteHandler.ts",
      "utf8"
    );
    expect(executeHandler).not.toContain("acquireAccountDeletionExecutionLock");
    expect(process.env[ACCOUNT_DELETION_EXECUTION_ENV_FLAG]).not.toBe("true");
    expect(isSchemaExecutionReady()).toBe(false);
  });
});
