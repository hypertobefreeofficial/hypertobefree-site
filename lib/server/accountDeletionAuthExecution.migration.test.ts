import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCOUNT_DELETION_AUTH_EXECUTION_FOUNDATION_MIGRATION } from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH =
  ACCOUNT_DELETION_AUTH_EXECUTION_FOUNDATION_MIGRATION.relativePath;

function withoutFunctionBodies(migration: string): string {
  return migration.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/gi, "");
}

describe("account deletion auth execution foundation (3B.4D.1)", () => {
  it("defines prepare/claim/complete RPCs and readiness composition", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    const outsideFunctions = withoutFunctionBodies(migration);

    expect(migration.match(/^\s*BEGIN;/gm)).toHaveLength(1);
    expect(migration.match(/^\s*COMMIT;/gm)).toHaveLength(1);
    expect(migration).toContain("prepare_account_deletion_auth_stage");
    expect(migration).toContain("claim_account_deletion_auth_execution");
    expect(migration).toContain("complete_account_deletion_auth_execution");
    expect(migration).toContain("verify_account_deletion_auth_execution_ready");
    expect(migration).toContain("verify_account_deletion_schema_execution_ready_before_3b4d");
    expect(migration).toContain("auth_delete_claim_token");
    expect(migration).toContain("auth_delete_commit_token");
    expect(migration).toContain("auth_execution_completed");

    expect(migration).not.toMatch(/auth\.admin\.deleteUser/i);
    expect(outsideFunctions).not.toMatch(/\bDELETE\s+FROM\s+auth\.users\b/i);
    expect(outsideFunctions).not.toMatch(/\bUPDATE\s+auth\.users\b/i);
    expect(migration).not.toMatch(/\.remove\s*\(/i);

    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.prepare_account_deletion_auth_stage(uuid, uuid) TO service_role"
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.complete_account_deletion_auth_execution(uuid, uuid, uuid, text) FROM authenticated"
    );
  });

  it("does not wire orchestrator or terminal request completion", () => {
    const orchestrator = readFileSync(
      "lib/server/accountDeletionExecutionOrchestrator.ts",
      "utf8"
    );
    expect(orchestrator).not.toContain("prepare_account_deletion_auth_stage");
    expect(orchestrator).not.toContain("claim_account_deletion_auth_execution");
    expect(orchestrator).not.toContain("complete_account_deletion_auth_execution");

    const migration = readFileSync(MIGRATION_PATH, "utf8");
    expect(migration).not.toMatch(
      /UPDATE\s+public\.account_deletion_requests[\s\S]{0,200}status\s*=\s*'deleted'/i
    );
    expect(migration).not.toMatch(
      /stage\s*=\s*'completed'::text[\s\S]{0,80}account_deletion_execution_attempts/i
    );
  });
});
