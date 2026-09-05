import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_SCHEMA_PREREQUISITES,
  ACCOUNT_DELETION_STORY_VIDEO_REPLIES_EXECUTOR_NOT_READY_NOTE,
  ACCOUNT_DELETION_STORY_VIDEO_REPLIES_PARENT_FK_MIGRATION,
  ACCOUNT_DELETION_TRANSITIVE_CASCADE_REGISTRY,
  UNSAFE_TRANSITIVE_CASCADE_IDS,
} from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH =
  ACCOUNT_DELETION_STORY_VIDEO_REPLIES_PARENT_FK_MIGRATION.relativePath;

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

function migrationSqlStatements(migration: string): string {
  return migration
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function ddlOnlySql(migration: string): string {
  return migrationSqlStatements(migration).replace(
    /CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/gi,
    ""
  );
}

function functionBody(migration: string, functionName: string): string {
  const pattern = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${functionName}[\\s\\S]*?\\$\\$;`,
    "i"
  );
  const match = migration.match(pattern);
  expect(match, `expected function body for ${functionName}`).toBeTruthy();
  return match![0];
}

describe("story_video_replies parent FK migration (Phase 4C.7B.1E.2B.3a)", () => {
  it("wraps changes in a transaction", () => {
    const migration = readMigration();
    expect(migration).toMatch(/^\s*BEGIN;/m);
    expect(migration).toMatch(/^\s*COMMIT;/m);
  });

  it("includes fail-closed DO precondition before parent FK DDL", () => {
    const migration = readMigration();
    expect(migration).toMatch(/DO \$\$/);
    expect(migration).toContain("2B.3a precondition A failed");
    expect(migration).toContain("2B.3a precondition C/H failed");
    expect(migration).toContain("story_video_replies_parent_reply_id_fkey");
    expect(migration).toContain("confdeltype = 'c'");
    expect(migration).toContain("confupdtype = 'a'");
    expect(migration.indexOf("DO $$")).toBeLessThan(
      migration.indexOf("DROP CONSTRAINT story_video_replies_parent_reply_id_fkey")
    );
  });

  it("drops parent FK without IF EXISTS after precondition", () => {
    const ddl = ddlOnlySql(readMigration());
    expect(ddl).toContain(
      "DROP CONSTRAINT story_video_replies_parent_reply_id_fkey"
    );
    expect(ddl).not.toContain("DROP CONSTRAINT IF EXISTS");
  });

  it("recreates parent_reply_id self-FK with ON DELETE SET NULL", () => {
    const migration = readMigration();
    expect(migration).toContain("parent_reply_id");
    expect(migration).toMatch(
      /story_video_replies_parent_reply_id_fkey[\s\S]*ON DELETE SET NULL/
    );
    expect(migration).toContain(
      "REFERENCES public.story_video_replies(id)"
    );
  });

  it("does not modify story_id or auth participant FKs", () => {
    const ddl = ddlOnlySql(readMigration());
    expect(ddl).not.toContain("story_video_replies_story_id_fkey");
    expect(ddl).not.toContain("story_video_replies_user_id_fkey");
    expect(ddl).not.toContain("story_video_replies_recipient_user_id_fkey");
    expect(ddl).not.toContain("ALTER COLUMN user_id");
  });

  it("contains no row DML or RLS policy changes", () => {
    const sql = ddlOnlySql(readMigration());
    expect(sql).not.toMatch(/\bINSERT INTO\b/i);
    expect(sql).not.toMatch(/\bUPDATE\s+(public\.|auth\.)/i);
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bCREATE POLICY\b/i);
    expect(sql).not.toMatch(/\bDROP POLICY\b/i);
  });

  it("extends verify_account_deletion_schema_execution_ready with parent prerequisite", () => {
    const probe = functionBody(
      readMigration(),
      "verify_account_deletion_schema_execution_ready"
    );

    expect(probe).toContain("story_video_replies_parent_reply_id_set_null");
    expect(probe).toContain("src_attr.attname = 'parent_reply_id'");
    expect(probe).toContain("dst_attr.attname = 'id'");
    expect(probe).toContain("confdeltype = 'c'");
    expect(probe).toMatch(/cardinality\(con\.conkey\) = 1/);
  });

  it("strengthens auth FK prerequisites with catalog attnum checks", () => {
    const probe = functionBody(
      readMigration(),
      "verify_account_deletion_schema_execution_ready"
    );

    expect(probe).toContain("story_video_replies_user_id_set_null");
    expect(probe).toContain("story_video_replies_recipient_user_id_set_null");
    expect(probe).toContain("src_attr.attname = 'user_id'");
    expect(probe).toContain("src_attr.attname = 'recipient_user_id'");
    expect(probe).toContain("fnsp.nspname = 'auth'");
    expect(probe).toContain("frel.relname = 'users'");
    expect(probe).toContain("dst_attr.attname = 'id'");
  });

  it("preserves service_role-only EXECUTE grants on schema probe", () => {
    const migration = readMigration();
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.verify_account_deletion_schema_execution_ready() FROM PUBLIC"
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.verify_account_deletion_schema_execution_ready() FROM authenticated"
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.verify_account_deletion_schema_execution_ready() TO service_role"
    );
    expect(migration).toContain(
      "ALTER FUNCTION public.verify_account_deletion_schema_execution_ready() OWNER TO postgres"
    );
  });

  it("requires every TypeScript schema prerequisite id in the live probe", () => {
    const probe = functionBody(
      readMigration(),
      "verify_account_deletion_schema_execution_ready"
    );

    for (const prerequisite of ACCOUNT_DELETION_SCHEMA_PREREQUISITES) {
      expect(probe).toContain(`'id', '${prerequisite.id}'`);
    }
  });

  it("registers parent_reply_id schema prerequisite in TypeScript policy", () => {
    const entry = ACCOUNT_DELETION_SCHEMA_PREREQUISITES.find(
      (row) => row.id === "story_video_replies_parent_reply_id_set_null"
    );
    expect(entry?.migrationFile).toBe(MIGRATION_PATH);
    expect(entry?.satisfied).toBe(false);
    expect(entry?.requiredState).toContain("SET NULL");
  });

  it("documents executor-not-ready note for reply HARD_DELETE", () => {
    expect(ACCOUNT_DELETION_STORY_VIDEO_REPLIES_EXECUTOR_NOT_READY_NOTE).toContain(
      "2B.3b"
    );
    expect(UNSAFE_TRANSITIVE_CASCADE_IDS).toContain(
      "reply_parent_delete_descendant_cascade"
    );
    const cascade = ACCOUNT_DELETION_TRANSITIVE_CASCADE_REGISTRY.find(
      (entry) => entry.id === "reply_parent_delete_descendant_cascade"
    );
    expect(cascade?.requiredFutureBehavior).toContain("SET NULL");
    expect(cascade?.executionNote).toContain("not executor-ready");
  });
});
