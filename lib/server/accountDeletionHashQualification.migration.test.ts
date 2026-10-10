import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_HASHTEXTEXTENDED_QUALIFICATION_FIX_MIGRATION,
  ACCOUNT_DELETION_STORAGE_ADAPTER_MIGRATION,
  ACCOUNT_DELETION_STORAGE_STAGE_RUNNER_MIGRATION,
} from "./accountDeletionDatabasePolicy";
import { listAccountDeletionMigrations } from "./accountDeletionIntegrationHarness";

const MIGRATION_PATH =
  ACCOUNT_DELETION_HASHTEXTEXTENDED_QUALIFICATION_FIX_MIGRATION.relativePath;

const AFFECTED_FUNCTIONS = [
  "acquire_account_deletion_execution_lock",
  "execute_account_deletion_nondestructive_database_stage",
  "account_deletion_attempt_transition_precheck",
  "cancel_account_deletion_execution",
  "capture_account_deletion_storage_manifest",
] as const;

const HASH_CALLERS = [
  ...AFFECTED_FUNCTIONS.filter(
    (name) => name !== "execute_account_deletion_nondestructive_database_stage"
  ),
  "execute_account_deletion_nondestructive_database_stage_inner",
] as const;

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

function migrationSqlStatements(migration: string): string {
  return migration
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function withoutFunctionBodies(migration: string): string {
  return migration.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/gi, "");
}

function functionBody(migration: string, functionName: string): string {
  const pattern = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]*?\\$\\$;`,
    "i"
  );
  const match = migration.match(pattern);
  expect(match, `expected function body for ${functionName}`).toBeTruthy();
  return match![0];
}

describe("account deletion hashtextextended qualification fix (Phase 4C.7B.1E.2C.3B.3F.0A)", () => {
  it("defines corrective migration at 20260919225000", () => {
    expect(ACCOUNT_DELETION_HASHTEXTEXTENDED_QUALIFICATION_FIX_MIGRATION.version).toBe(
      "20260919225000"
    );
    expect(MIGRATION_PATH).toContain(
      "20260919225000_account_deletion_hashtextextended_qualification_fix_phase4c7b1e2c3b3f0a.sql"
    );
  });

  it("replaces all five affected RPCs plus the 3B.1 inner executor", () => {
    const migration = readMigration();
    for (const name of AFFECTED_FUNCTIONS) {
      expect(migration).toContain(`CREATE OR REPLACE FUNCTION public.${name}(`);
    }
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.execute_account_deletion_nondestructive_database_stage_inner("
    );
  });

  it("uses pg_catalog.hashtextextended and not public.hashtextextended in function bodies", () => {
    const migration = readMigration();
    for (const name of HASH_CALLERS) {
      const body = functionBody(migration, name);
      expect(body).toContain("pg_catalog.hashtextextended");
      expect(body).not.toContain("public.hashtextextended");
    }
    const wrapper = functionBody(
      migration,
      "execute_account_deletion_nondestructive_database_stage"
    );
    expect(wrapper).not.toMatch(/hashtextextended/i);
  });

  it("does not create a public.hashtextextended compatibility function", () => {
    const migration = readMigration();
    const sql = migrationSqlStatements(migration);
    expect(sql).not.toMatch(
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.hashtextextended\s*\(/i
    );
  });

  it("is corrective DDL only without destructive account/storage/auth mutations", () => {
    const migration = readMigration();
    const outsideFunctions = withoutFunctionBodies(migrationSqlStatements(migration));
    expect(migration).toMatch(/^\s*BEGIN;/m);
    expect(migration).toMatch(/^\s*COMMIT;/m);
    expect(outsideFunctions).not.toMatch(/\bDELETE\s+FROM\s+storage\.objects\b/i);
    expect(outsideFunctions).not.toMatch(/\bauth\.users\b/i);
    expect(outsideFunctions).not.toMatch(/HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED/i);
    expect(outsideFunctions).not.toMatch(
      /\bINSERT\s+INTO\s+public\.account_deletion_requests\b/i
    );
    expect(outsideFunctions).not.toMatch(
      /\bUPDATE\s+public\.account_deletion_execution_attempts\b/i
    );
  });

  it("orders adapter validation → hash fix → storage stage runner", () => {
    const migrations = listAccountDeletionMigrations().map((p) =>
      p.replace(/^.*\//, "")
    );
    const adapterIdx = migrations.indexOf(
      path.basename(ACCOUNT_DELETION_STORAGE_ADAPTER_MIGRATION.relativePath)
    );
    const fixIdx = migrations.indexOf(
      ACCOUNT_DELETION_HASHTEXTEXTENDED_QUALIFICATION_FIX_MIGRATION.filename
    );
    const runnerIdx = migrations.indexOf(
      ACCOUNT_DELETION_STORAGE_STAGE_RUNNER_MIGRATION.filename
    );
    expect(adapterIdx).toBeGreaterThanOrEqual(0);
    expect(fixIdx).toBeGreaterThan(adapterIdx);
    expect(runnerIdx).toBeGreaterThan(fixIdx);
  });
});
