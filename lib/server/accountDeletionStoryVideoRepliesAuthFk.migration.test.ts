import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_SCHEMA_PREREQUISITES,
  ACCOUNT_DELETION_STORY_VIDEO_REPLIES_AUTH_FK_MIGRATION,
  ACCOUNT_DELETION_DIRECT_AUTH_FK_REGISTRY,
} from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH =
  ACCOUNT_DELETION_STORY_VIDEO_REPLIES_AUTH_FK_MIGRATION.relativePath;

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

function migrationSqlStatements(migration: string): string {
  return migration
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
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

function ddlOnlySql(migration: string): string {
  return migrationSqlStatements(migration).replace(
    /CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/gi,
    ""
  );
}

describe("story_video_replies auth FK migration (Phase 4C.7B.1E.2B.2)", () => {
  it("wraps changes in a transaction", () => {
    const migration = readMigration();
    expect(migration).toMatch(/^\s*BEGIN;/m);
    expect(migration).toMatch(/^\s*COMMIT;/m);
  });

  it("drops NOT NULL from user_id and hardens auth FK to SET NULL", () => {
    const migration = readMigration();
    expect(migration).toContain("ALTER TABLE public.story_video_replies");
    expect(migration).toContain("ALTER COLUMN user_id DROP NOT NULL");
    expect(migration).toContain("story_video_replies_user_id_fkey");
    expect(migration).toMatch(
      /story_video_replies_user_id_fkey[\s\S]*ON DELETE SET NULL/
    );
  });

  it("leaves recipient_user_id nullable and hardens auth FK to SET NULL", () => {
    const migration = readMigration();
    expect(migration).toContain("story_video_replies_recipient_user_id_fkey");
    expect(migration).not.toMatch(
      /recipient_user_id[\s\S]*ALTER COLUMN recipient_user_id DROP NOT NULL/i
    );
    expect(migration).toMatch(
      /story_video_replies_recipient_user_id_fkey[\s\S]*ON DELETE SET NULL/
    );
  });

  it("does not change story_id or parent_reply_id FKs", () => {
    const migration = readMigration();
    expect(migration).toContain(
      "story_video_replies.story_id and parent_reply_id FKs intentionally unchanged"
    );
    expect(migration).not.toContain("story_video_replies_story_id_fkey");
    expect(migration).not.toContain("story_video_replies_parent_reply_id_fkey");
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

  it("extends verify_account_deletion_schema_execution_ready with story_video_replies prerequisites", () => {
    const probe = functionBody(
      readMigration(),
      "verify_account_deletion_schema_execution_ready"
    );

    expect(probe).toContain("story_video_replies_user_id_set_null");
    expect(probe).toContain("story_video_replies_recipient_user_id_set_null");
    expect(probe).toContain(
      "FOREIGN KEY (user_id)%REFERENCES auth.users%"
    );
    expect(probe).toContain(
      "FOREIGN KEY (recipient_user_id)%REFERENCES auth.users%"
    );
    expect(probe).toContain("confdeltype = 'n'");
    expect(probe).toContain("content_reports_story_id_set_null");
    expect(probe).toContain("write_freeze_public_rls_present");
    expect(probe).toMatch(/SECURITY DEFINER/i);
    expect(probe).toMatch(/SET search_path = ''/i);
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
  });

  it("registers matching TypeScript schema prerequisites", () => {
    const ids = ACCOUNT_DELETION_SCHEMA_PREREQUISITES.map((entry) => entry.id);
    expect(ids).toContain("story_video_replies_user_id_set_null");
    expect(ids).toContain("story_video_replies_recipient_user_id_set_null");

    for (const id of [
      "story_video_replies_user_id_set_null",
      "story_video_replies_recipient_user_id_set_null",
    ]) {
      const entry = ACCOUNT_DELETION_SCHEMA_PREREQUISITES.find(
        (row) => row.id === id
      );
      expect(entry?.migrationFile).toBe(MIGRATION_PATH);
      expect(entry?.satisfied).toBe(false);
    }
  });

  it("requires every TypeScript prerequisite id to appear in the live probe", () => {
    const probe = functionBody(
      readMigration(),
      "verify_account_deletion_schema_execution_ready"
    );

    for (const prerequisite of ACCOUNT_DELETION_SCHEMA_PREREQUISITES) {
      expect(probe).toContain(`'id', '${prerequisite.id}'`);
    }
  });

  it("documents intended SET NULL auth FK registry for story_video_replies", () => {
    const userId = ACCOUNT_DELETION_DIRECT_AUTH_FK_REGISTRY.find(
      (entry) =>
        entry.table === "story_video_replies" && entry.column === "user_id"
    );
    const recipient = ACCOUNT_DELETION_DIRECT_AUTH_FK_REGISTRY.find(
      (entry) =>
        entry.table === "story_video_replies" &&
        entry.column === "recipient_user_id"
    );

    expect(userId?.onDelete).toBe("SET NULL");
    expect(userId?.columnNullable).toBe(true);
    expect(recipient?.onDelete).toBe("SET NULL");
    expect(recipient?.columnNullable).toBe(true);
  });
});
