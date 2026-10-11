import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_PROFILE_MEDIA_RUNNER_FOUNDATION_MIGRATION,
  ACCOUNT_DELETION_PROFILE_MEDIA_RUNNER_FOUNDATION_NOTE,
} from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH =
  ACCOUNT_DELETION_PROFILE_MEDIA_RUNNER_FOUNDATION_MIGRATION.relativePath;

function withoutFunctionBodies(migration: string): string {
  return migration.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/gi, "");
}

describe("account deletion profile-media runner foundation (3B.4B.2.1)", () => {
  it("defines read-only selector and runner readiness without destructive authority", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    const outsideFunctions = withoutFunctionBodies(migration);
    const selectorMatch = migration.match(
      /CREATE OR REPLACE FUNCTION public\.select_account_deletion_profile_media_actionable_result_ids\([\s\S]*?\$\$;/i
    );

    expect(migration.match(/^\s*BEGIN;/gm)).toHaveLength(1);
    expect(migration.match(/^\s*COMMIT;/gm)).toHaveLength(1);

    expect(migration).toContain(
      "select_account_deletion_profile_media_actionable_result_ids("
    );
    expect(migration).toContain(
      "verify_account_deletion_profile_media_runner_ready("
    );
    expect(migration).toContain(
      "verify_account_deletion_schema_execution_ready_before_3b4b2"
    );

    expect(selectorMatch).not.toBeNull();
    const selectorBody = selectorMatch![0];
    expect(selectorBody).toContain("DEFER_PROFILE");
    expect(selectorBody).toContain("profile_avatar");
    expect(selectorBody).toContain("profile-avatars");
    expect(selectorBody).toContain("deferred_profile");
    expect(selectorBody).toContain("failed_retryable");
    expect(selectorBody).toContain(
      "account_deletion_storage_preservation_hold_active"
    );
    expect(selectorBody).toContain("effective_limit > 5");
    expect(selectorBody).toContain("result_ids");
    expect(selectorBody).toContain(
      "ORDER BY result.created_at ASC, result.manifest_object_id ASC, result.id ASC"
    );
    expect(selectorBody).not.toMatch(/FOR UPDATE/i);
    expect(selectorBody).not.toContain(
      "claim_account_deletion_profile_media_execution_result"
    );
    expect(selectorBody).not.toContain(
      "authorize_account_deletion_profile_media_delete"
    );
    expect(selectorBody).not.toContain(
      "complete_account_deletion_profile_media_execution_result"
    );
    expect(selectorBody).not.toContain(
      "account_deletion_profile_avatar_surviving_reference_count"
    );
    expect(selectorBody).not.toMatch(
      /execution_state\s*=\s*'deleting'/i
    );

    expect(outsideFunctions).not.toMatch(/\bDELETE\s+FROM\s+storage\.objects\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+public\.profiles\b/i);
    expect(migration).not.toMatch(/\bauth\.users\b/i);
    expect(migration).not.toContain("profile_completed");
    expect(migration).not.toMatch(/HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED/i);

    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.select_account_deletion_profile_media_actionable_result_ids"
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.select_account_deletion_profile_media_actionable_result_ids"
    );
    expect(migration).toContain("TO service_role");
    expect(migration).not.toMatch(
      /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)[\s\S]*account_deletion_storage_execution_results/i
    );

    expect(ACCOUNT_DELETION_PROFILE_MEDIA_RUNNER_FOUNDATION_NOTE).toContain(
      "result UUIDs only"
    );
  });
});
