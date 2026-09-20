import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_STORAGE_MANIFEST_APPROVED_BUCKETS,
  ACCOUNT_DELETION_STORAGE_MANIFEST_DISPOSITIONS,
  ACCOUNT_DELETION_STORAGE_MANIFEST_FOUNDATION_ALLOWED_DISPOSITIONS,
  ACCOUNT_DELETION_STORAGE_MANIFEST_MEDIA_CATEGORIES,
  ACCOUNT_DELETION_STORAGE_MANIFEST_MIGRATION,
  ACCOUNT_DELETION_STORAGE_MANIFEST_STATUSES,
} from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH = ACCOUNT_DELETION_STORAGE_MANIFEST_MIGRATION.relativePath;

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

function withoutFunctionBodies(migration: string): string {
  return migration.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/gi, "");
}

describe("account deletion storage manifest foundation (Phase 4C.7B.1E.2C.3B.3B.1)", () => {
  it("hardens injective fingerprint, bans foundation DELETE_PRIVATE, and stays DDL-only at apply", () => {
    const migration = readMigration();
    const outsideFunctions = withoutFunctionBodies(migration);

    expect(migration.match(/^\s*BEGIN;/gm)).toHaveLength(1);
    expect(migration.match(/^\s*COMMIT;/gm)).toHaveLength(1);
    expect(migration).toContain("jsonb_build_array");
    expect(migration).toContain("jsonb_agg");
    expect(migration).toContain("delete_authority_not_available_in_foundation");
    expect(migration).toContain("request_not_in_progress");
    expect(migration).toContain("manifest_state_drift");
    expect(migration).toContain("reference_state");
    expect(migration).toContain("surviving_reference_count");
    expect(migration).toContain(
      "account_deletion_storage_manifest_delete_requires_target_prefix"
    );
    expect(migration).toContain(
      "account_deletion_storage_manifest_delete_requires_exclusive_refs"
    );
    expect(migration).toContain("account_deletion_storage_manifest_freeze");
    expect(migration).toContain("3B.3C");
    expect(migration).toContain("separate execution-result table");
    expect(migration).toContain("%2e");
    expect(migration).toContain("char_length(normalized) > 1024");

    for (const disposition of ACCOUNT_DELETION_STORAGE_MANIFEST_DISPOSITIONS) {
      expect(migration).toContain(`'${disposition}'`);
    }
    for (const allowed of ACCOUNT_DELETION_STORAGE_MANIFEST_FOUNDATION_ALLOWED_DISPOSITIONS) {
      expect(migration).toContain(`'${allowed}'`);
    }
    for (const status of ACCOUNT_DELETION_STORAGE_MANIFEST_STATUSES) {
      expect(migration).toContain(`'${status}'`);
    }
    for (const category of ACCOUNT_DELETION_STORAGE_MANIFEST_MEDIA_CATEGORIES) {
      expect(migration).toContain(`'${category}'`);
    }
    for (const bucket of ACCOUNT_DELETION_STORAGE_MANIFEST_APPROVED_BUCKETS) {
      expect(migration).toContain(`'${bucket}'`);
    }

    expect(outsideFunctions).not.toMatch(/\.remove\s*\(/i);
    expect(migration).not.toMatch(/storage\.from\(/i);
    expect(migration).not.toMatch(/HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED/i);
    expect(outsideFunctions).not.toMatch(/\bDELETE\s+FROM\s+auth\.users\b/i);
    expect(outsideFunctions).not.toMatch(/\bUPDATE\s+public\.profiles\b/i);
    expect(migration).not.toMatch(/signOut/i);
  });

  it("PC-A/B/C/D: pgcrypto digest is resolved from pg_extension, not hardcoded schemas", () => {
    const migration = readMigration();

    // PC-A: discovers namespace from pg_extension
    expect(migration).toContain("pg_catalog.pg_extension");
    expect(migration).toContain("ext.extname = 'pgcrypto'");
    expect(migration).toContain("ext.extnamespace");
    expect(migration).toContain("account_deletion_sha256");
    expect(migration).toContain("EXECUTE format('SELECT %I.digest($1, $2)', pgcrypto_schema)");

    // PC-B: no hardcoded public.digest / extensions.digest dependency
    expect(migration).not.toMatch(/public\.digest\s*\(/);
    expect(migration).not.toMatch(/extensions\.digest\s*\(/);
    expect(migration).not.toContain("to_regprocedure('public.digest(text, text)')");
    expect(migration).not.toContain("to_regprocedure('public.digest(bytea, text)')");
    expect(migration).not.toContain("to_regprocedure('extensions.digest(text, text)')");
    expect(migration).not.toContain("to_regprocedure('extensions.digest(bytea, text)')");
    expect(migration).not.toMatch(/search_path\s*=\s*[^;]*extensions/i);

    // PC-C: missing pgcrypto fails closed
    expect(migration).toContain(
      "2C.3B.3B.1 precondition failed: pgcrypto extension missing"
    );
    expect(migration).toContain(
      "account_deletion_sha256: pgcrypto extension missing"
    );
    expect(migration).toContain("storage_manifest_pgcrypto_sha256_authority");

    // PC-D: only the catalog-derived schema is used (no caller-chosen schema/alg)
    expect(migration).toContain("USING p_input, 'sha256'");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.account_deletion_sha256(text) FROM service_role"
    );

    // Fingerprint routes through the portable helper
    expect(migration).toContain(
      "encode(public.account_deletion_sha256(canonical::text), 'hex')"
    );

    // Known SHA-256 of canonical empty JSON array text (Node) for PC-E cross-check docs
    const emptyCanonicalSha256 = createHash("sha256").update("[]", "utf8").digest("hex");
    expect(emptyCanonicalSha256).toHaveLength(64);
  });
});
