import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_STORAGE_EXECUTION_FOUNDATION_MIGRATION,
  ACCOUNT_DELETION_STORAGE_EXECUTION_FOUNDATION_NOTE,
} from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH =
  ACCOUNT_DELETION_STORAGE_EXECUTION_FOUNDATION_MIGRATION.relativePath;

function withoutFunctionBodies(migration: string): string {
  return migration.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/gi, "");
}

describe("account deletion storage execution foundation (Phase 4C.7B.1E.2C.3B.3C)", () => {
  it("defines execution results + holds without Storage deletion", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    const outsideFunctions = withoutFunctionBodies(migration);

    expect(migration.match(/^\s*BEGIN;/gm)).toHaveLength(1);
    expect(migration.match(/^\s*COMMIT;/gm)).toHaveLength(1);
    expect(migration).toContain("account_deletion_storage_execution_results");
    expect(migration).toContain("account_deletion_storage_preservation_holds");
    expect(migration).toContain(
      "initialize_account_deletion_storage_execution_results"
    );
    expect(migration).toContain(
      "create_account_deletion_storage_preservation_hold"
    );
    expect(migration).toContain(
      "release_account_deletion_storage_preservation_hold"
    );
    expect(migration).toContain(
      "claim_account_deletion_storage_execution_object"
    );
    expect(migration).toContain(
      "verify_account_deletion_storage_execution_foundation_ready"
    );
    expect(migration).toContain(
      "account_deletion_storage_execution_results_delete_work_only_for_delete_private"
    );
    expect(migration).toContain("blocked_on_hold");
    expect(migration).toContain("storage_pending");
    expect(migration).toContain(
      "storage_manifest_foundation_ready_composed"
    );

    expect(outsideFunctions).not.toMatch(/\.remove\s*\(/i);
    expect(migration).not.toMatch(/storage\.from\(/i);
    expect(outsideFunctions).not.toMatch(/\bDELETE\s+FROM\s+storage\.objects\b/i);
    expect(migration).not.toMatch(/HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED/i);

    expect(ACCOUNT_DELETION_STORAGE_EXECUTION_FOUNDATION_NOTE).toContain(
      "No Storage remove()"
    );
  });
});
