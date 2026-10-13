import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_TERMINAL_COMPLETION_FOUNDATION_MIGRATION,
  ACCOUNT_DELETION_TERMINAL_COMPLETION_FOUNDATION_NOTE,
} from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH =
  ACCOUNT_DELETION_TERMINAL_COMPLETION_FOUNDATION_MIGRATION.relativePath;

function withoutFunctionBodies(migration: string): string {
  return migration.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/gi, "");
}

describe("account deletion terminal completion foundation (3B.4D.4)", () => {
  it("defines finalize RPC, audit vocabulary, and readiness composition", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    const outsideFunctions = withoutFunctionBodies(migration);

    expect(migration.match(/^\s*BEGIN;/gm)).toHaveLength(1);
    expect(migration.match(/^\s*COMMIT;/gm)).toHaveLength(1);
    expect(migration).toContain("finalize_account_deletion_execution");
    expect(migration).toContain("account_deletion_completed");
    expect(migration).toContain("verify_account_deletion_terminal_completion_ready");
    expect(migration).toContain("verify_account_deletion_schema_execution_ready_before_3b4d4");
    expect(migration).toContain("account_deletion_terminal_completion_evidence_valid");
    expect(migration).toContain("account_deletion_auth_terminal_evidence_valid");
    expect(migration).toContain("account_deletion_profile_completion_evidence_valid");
    expect(migration).toContain("already_completed");
    expect(migration).toContain("inconsistent_state");

    expect(migration).toMatch(
      /preservation holds do NOT block|do not block terminal bookkeeping/i
    );
    expect(migration).not.toMatch(
      /database_rows_affected\s*<>\s*'\{\}'::jsonb/i
    );
    expect(migration).not.toMatch(/preservation_hold_active/i);

    expect(migration).not.toMatch(/auth\.admin\.deleteUser/i);
    expect(outsideFunctions).not.toMatch(/\bDELETE\s+FROM\s+auth\.users\b/i);
    expect(outsideFunctions).not.toMatch(/\bUPDATE\s+auth\.users\b/i);
    expect(migration).not.toMatch(/\.remove\s*\(/i);

    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.finalize_account_deletion_execution(uuid, uuid) TO service_role"
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.finalize_account_deletion_execution(uuid, uuid) FROM authenticated"
    );

    expect(ACCOUNT_DELETION_TERMINAL_COMPLETION_FOUNDATION_NOTE).toMatch(
      /non-destructive/i
    );
  });

  it("orchestrator wires terminal wrapper only; auth migration still omits request deleted", () => {
    const orchestrator = readFileSync(
      "lib/server/accountDeletionExecutionOrchestrator.ts",
      "utf8"
    );
    expect(orchestrator).toContain("finalizeAccountDeletionExecution");
    expect(orchestrator).not.toMatch(/\.rpc\(\s*["']finalize_account_deletion_execution/);

    const authMigration = readFileSync(
      "supabase/migrations/20260919272000_account_deletion_auth_execution_foundation_phase4c7b1e2c3b4d.sql",
      "utf8"
    );
    expect(authMigration).not.toMatch(
      /UPDATE\s+public\.account_deletion_requests[\s\S]{0,200}status\s*=\s*'deleted'/i
    );

    const terminal = readFileSync(MIGRATION_PATH, "utf8");
    expect(terminal).toMatch(
      /status\s*=\s*'deleted'::text/
    );
  });

  it("terminal TS module has no destructive provider operations", () => {
    const source = readFileSync(
      "lib/server/accountDeletionExecutionTerminal.ts",
      "utf8"
    );
    expect(source).not.toContain("deleteUser");
    expect(source).not.toContain("auth.admin");
    expect(source).not.toMatch(/\.remove\(/);
    expect(source).toMatch(/serviceRoleClient\.rpc\(/);
  });
});
