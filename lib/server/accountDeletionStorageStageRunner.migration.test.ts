import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_STORAGE_STAGE_RUNNER_MIGRATION,
  ACCOUNT_DELETION_STORAGE_STAGE_RUNNER_NOTE,
} from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH = ACCOUNT_DELETION_STORAGE_STAGE_RUNNER_MIGRATION.relativePath;

function withoutFunctionBodies(migration: string): string {
  return migration.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/gi, "");
}

describe("account deletion storage stage runner (Phase 4C.7B.1E.2C.3B.3F.1)", () => {
  it("defines stage transitions and completion authority without Storage deletion", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    const outsideFunctions = withoutFunctionBodies(migration);

    expect(migration.match(/^\s*BEGIN;/gm)).toHaveLength(1);
    expect(migration.match(/^\s*COMMIT;/gm)).toHaveLength(1);

    expect(migration).toContain("advance_account_deletion_attempt_to_storage(");
    expect(migration).toContain(
      "advance_account_deletion_attempt_to_storage_completed("
    );
    expect(migration).toContain(
      "account_deletion_storage_execution_progress_snapshot("
    );
    expect(migration).toContain(
      "account_deletion_storage_execution_completion_blocked("
    );
    expect(migration).toContain(
      "verify_account_deletion_storage_stage_runner_ready("
    );

    expect(migration).toContain("att.stage <> 'storage'::text");
    expect(migration).not.toContain("att.stage <> 'database_completed'::text");

    expect(outsideFunctions).not.toMatch(/\bDELETE\s+FROM\s+storage\.objects\b/i);
    expect(migration).not.toMatch(/storage\.from\(/i);
    expect(migration).not.toMatch(/HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED/i);
    expect(migration).not.toMatch(/\bprofile\b.*DELETE/i);
    expect(migration).not.toMatch(/\bauth\.users\b/i);

    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.advance_account_deletion_attempt_to_storage");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.advance_account_deletion_attempt_to_storage");
    expect(migration).toContain("service_role");
    expect(migration).toContain("storage_stage_entered");
    expect(migration).toContain("storage_stage_completed");
    expect(migration).toContain(
      "account_deletion_storage_execution_audit_event_type_check"
    );

    expect(ACCOUNT_DELETION_STORAGE_STAGE_RUNNER_NOTE).toContain(
      "database_completed"
    );
  });

  it("claim_account_deletion_storage_execution_object locks the attempt row FOR UPDATE", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    const claimMatch = migration.match(
      /CREATE OR REPLACE FUNCTION public\.claim_account_deletion_storage_execution_object\([\s\S]*?\$\$;/i
    );
    expect(claimMatch).not.toBeNull();
    const claimBody = claimMatch![0];
    expect(claimBody).toContain("account_deletion_execution_attempts");
    expect(claimBody).toMatch(
      /FROM public\.account_deletion_execution_attempts[\s\S]*?FOR UPDATE/i
    );
    expect(claimBody).toMatch(
      /FOR UPDATE[\s\S]*?account_deletion_storage_execution_results/i
    );
  });
});
