import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_STORAGE_EXECUTOR_MIGRATION,
  ACCOUNT_DELETION_STORAGE_EXECUTOR_NOTE,
} from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH = ACCOUNT_DELETION_STORAGE_EXECUTOR_MIGRATION.relativePath;

function withoutFunctionBodies(migration: string): string {
  return migration.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/gi, "");
}

describe("account deletion storage executor (Phase 4C.7B.1E.2C.3B.3D)", () => {
  it("defines authorize/complete/commit without Storage API or raw SQL delete", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    const outsideFunctions = withoutFunctionBodies(migration);

    expect(migration.match(/^\s*BEGIN;/gm)).toHaveLength(1);
    expect(migration.match(/^\s*COMMIT;/gm)).toHaveLength(1);
    expect(migration).toContain("delete_commit_token");
    expect(migration).toContain(
      "authorize_account_deletion_storage_object_delete"
    );
    expect(migration).toContain(
      "complete_account_deletion_storage_execution_object"
    );
    expect(migration).toContain(
      "verify_account_deletion_storage_executor_ready"
    );
    expect(migration).toContain(
      "create_account_deletion_storage_preservation_hold_inner"
    );
    expect(migration).toContain("account_deletion_storage_destructive_bucket_allowed");

    expect(outsideFunctions).not.toMatch(/\.remove\s*\(/i);
    expect(migration).not.toMatch(/storage\.from\(/i);
    expect(outsideFunctions).not.toMatch(
      /\bDELETE\s+FROM\s+storage\.objects\b/i
    );
    expect(migration).not.toMatch(
      /HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED/i
    );

    expect(ACCOUNT_DELETION_STORAGE_EXECUTOR_NOTE).toContain(
      "journey-private-media"
    );
  });
});
