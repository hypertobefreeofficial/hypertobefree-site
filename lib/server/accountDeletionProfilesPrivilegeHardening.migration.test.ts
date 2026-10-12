import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_PROFILES_PRIVILEGE_HARDENING_MIGRATION,
  ACCOUNT_DELETION_PROFILE_COMPLETION_FOUNDATION_MIGRATION,
} from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH =
  ACCOUNT_DELETION_PROFILES_PRIVILEGE_HARDENING_MIGRATION.relativePath;

const FINALIZER_MIGRATION_PATH =
  ACCOUNT_DELETION_PROFILE_COMPLETION_FOUNDATION_MIGRATION.relativePath;

describe("account deletion profiles service_role DELETE revoke (3B.4C.1a)", () => {
  it("is one transaction and revokes only service_role DELETE on profiles", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    const finalizerMigration = readFileSync(FINALIZER_MIGRATION_PATH, "utf8");

    expect(
      ACCOUNT_DELETION_PROFILES_PRIVILEGE_HARDENING_MIGRATION.filename
    ).toBe(
      "20260919271000_account_deletion_profiles_service_role_delete_revoke_phase4c7b1e2c3b4c1a.sql"
    );

    expect(migration.match(/^\s*BEGIN;/gm)).toHaveLength(1);
    expect(migration.match(/^\s*COMMIT;/gm)).toHaveLength(1);

    expect(migration).toContain("REVOKE DELETE ON TABLE public.profiles FROM service_role");
    expect(migration).not.toMatch(/\bGRANT\s+DELETE\b/i);
    expect(migration).not.toMatch(
      /REVOKE\s+SELECT[\s\S]{0,80}public\.profiles[\s\S]{0,40}service_role/i
    );
    expect(migration).not.toMatch(/FROM authenticated/i);
    expect(migration).not.toMatch(/FROM anon/i);

    expect(migration).toContain("to_regclass('public.profiles')");
    expect(migration).toContain(
      "to_regprocedure('public.finalize_account_deletion_profile_stage(uuid, uuid)')"
    );
    expect(migration).toContain(
      "to_regprocedure('public.verify_account_deletion_profile_completion_ready()')"
    );
    expect(migration).toContain(
      "to_regprocedure('public.verify_account_deletion_schema_execution_ready()')"
    );

    expect(migration).not.toMatch(/auth\.admin/i);
    expect(migration).not.toMatch(/deleteUser/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+public\.profiles\b/i);
    expect(migration).not.toMatch(/\bUPDATE\s+public\.profiles\b/i);
    expect(migration).not.toMatch(/\bINSERT\s+INTO\s+public\.profiles\b/i);
    expect(migration).not.toMatch(/COMMENT ON TABLE public\.profiles/i);
    expect(migration).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.finalize_account_deletion_profile_stage/is
    );

    expect(finalizerMigration).toContain(
      "finalize_account_deletion_profile_stage"
    );
    expect(migration).not.toContain("profile_completion_no_broad_profiles_delete_grant");
  });
});
