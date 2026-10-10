import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_STORAGE_ADAPTER_MIGRATION,
  ACCOUNT_DELETION_STORAGE_ADAPTER_NOTE,
} from "./accountDeletionDatabasePolicy";

describe("account deletion storage adapter validation (Phase 4C.7B.1E.2C.3B.3E)", () => {
  it("fixes readiness composition and adds adapter readiness without Storage side effects", () => {
    const migration = readFileSync(
      ACCOUNT_DELETION_STORAGE_ADAPTER_MIGRATION.relativePath,
      "utf8"
    );

    expect(migration.match(/^\s*BEGIN;/gm)).toHaveLength(1);
    expect(migration.match(/^\s*COMMIT;/gm)).toHaveLength(1);
    expect(migration).toContain(
      "verify_account_deletion_schema_execution_ready_before_3b3d"
    );
    expect(migration).not.toContain(
      "verify_account_deletion_storage_execution_foundation_ready()"
    );
    expect(migration).toContain("verify_account_deletion_storage_adapter_ready");
    expect(migration).toContain("schema_readiness_single_storage_execution_block");
    expect(migration).not.toMatch(/DELETE FROM storage\.objects/i);
    expect(migration).not.toMatch(/\.remove\s*\(/i);
    expect(migration).not.toMatch(
      /HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED/i
    );
    expect(migration).not.toMatch(
      /HTBF_ACCOUNT_DELETION_STORAGE_E2E_TEST_ENABLED/i
    );

    expect(ACCOUNT_DELETION_STORAGE_ADAPTER_NOTE).toContain(
      "journey-private-media"
    );
  });
});
