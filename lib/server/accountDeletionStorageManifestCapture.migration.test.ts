import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_JOURNEY_SURVIVOR_PREDICATE_NOTE,
  ACCOUNT_DELETION_STORAGE_MANIFEST_CAPTURE_MIGRATION,
  ACCOUNT_DELETION_STORAGE_MANIFEST_CAPTURE_NOTE,
} from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH =
  ACCOUNT_DELETION_STORAGE_MANIFEST_CAPTURE_MIGRATION.relativePath;

describe("account deletion storage manifest capture (Phase 4C.7B.1E.2C.3B.3B.2)", () => {
  it("authoritative capture mints DELETE_PRIVATE only via DB path and gates 3B.1", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");

    expect(migration.match(/^\s*BEGIN;/gm)).toHaveLength(1);
    expect(migration.match(/^\s*COMMIT;/gm)).toHaveLength(1);

    expect(migration).toContain("capture_account_deletion_storage_manifest");
    expect(migration).toContain(
      "verify_account_deletion_storage_manifest_ready_for_3b1"
    );
    expect(migration).toContain("account_deletion_journey_reference_evidence");
    expect(migration).toContain(
      "account_deletion_storage_manifest_authoritative_write"
    );
    expect(migration).toContain(
      "account_deletion_storage_manifest_expected_inventory"
    );
    expect(migration).toContain(
      "account_deletion_storage_manifest_unresolved_media_sources"
    );
    expect(migration).toContain("delete_authority_not_available_in_foundation");
    expect(migration).toContain("reference_fingerprint");
    expect(migration).toContain(
      "account_deletion_storage_manifest_exclusive_surviving_consistency"
    );
    expect(migration).toContain("storage_manifest_not_finalized");
    expect(migration).toContain("storage_manifest_blocked");
    expect(migration).toContain("storage_manifest_state_drift");
    expect(migration).toContain("storage_manifest_unresolved_media_reference");
    expect(migration).toContain("delete_private_missing_storage_object");
    expect(migration).toContain(
      "execute_account_deletion_nondestructive_database_stage_inner"
    );
    expect(migration).toContain(
      "storage_manifest_3b1_inner_not_caller_executable"
    );
    expect(migration).toContain("sender_user_id = p_target_user_id");
    expect(migration).toContain("user_id IS DISTINCT FROM p_target_user_id");
    expect(migration).toContain("'video_url'::text AS media_slot");
    expect(migration).toContain("'image_url'::text AS media_slot");
    expect(migration).not.toMatch(
      /coalesce\(\s*public\.account_deletion_parse_storage_object_path\(\s*'journey-private-media',\s*msg\.video_url/
    );
    expect(migration).not.toMatch(/\.remove\s*\(/i);
    expect(migration).not.toMatch(/HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED/i);
    expect(migration).not.toContain("public.digest(");
    expect(migration).not.toContain("extensions.digest(");

    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.account_deletion_storage_manifest_authoritative_write[\s\S]*FROM service_role/
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION\s+public\.execute_account_deletion_nondestructive_database_stage_inner\(uuid, uuid\)\s+FROM service_role/
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.capture_account_deletion_storage_manifest\(uuid, uuid\)[\s\S]*TO service_role/
    );

    expect(ACCOUNT_DELETION_STORAGE_MANIFEST_CAPTURE_NOTE).toContain(
      "DELETE_PRIVATE"
    );
    expect(ACCOUNT_DELETION_STORAGE_MANIFEST_CAPTURE_NOTE).toContain(
      "stage_inner"
    );
    expect(ACCOUNT_DELETION_JOURNEY_SURVIVOR_PREDICATE_NOTE).toContain(
      "sender_user_id = target"
    );
    expect(ACCOUNT_DELETION_JOURNEY_SURVIVOR_PREDICATE_NOTE).toContain(
      "media_slot"
    );
  });
});
