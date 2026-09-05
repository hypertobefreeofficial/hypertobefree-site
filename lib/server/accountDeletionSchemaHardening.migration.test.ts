import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_SCHEMA_HARDENING_MIGRATION,
  ACCOUNT_DELETION_SCHEMA_PREREQUISITES,
  ACCOUNT_DELETION_SCHEMA_READINESS_MODEL_NOTE,
  areSchemaPrerequisitesEnvironmentVerified,
  describeSchemaExecutionReadiness,
  isSchemaExecutionReady,
} from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH = ACCOUNT_DELETION_SCHEMA_HARDENING_MIGRATION.relativePath;

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

function migrationSqlStatements(migration: string): string {
  return migration
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("account deletion schema hardening migration (Phase 4C.7B.1E.2A)", () => {
  it("wraps changes in a transaction", () => {
    const migration = readMigration();
    expect(migration).toMatch(/^\s*BEGIN;/m);
    expect(migration).toMatch(/^\s*COMMIT;/m);
  });

  it("makes stories.user_id nullable without introducing auth.users FK", () => {
    const migration = readMigration();
    expect(migration).toContain("ALTER TABLE public.stories");
    expect(migration).toContain("ALTER COLUMN user_id DROP NOT NULL");
    const storiesSection = migrationSqlStatements(migration).match(
      /ALTER TABLE public\.stories[\s\S]*?(?=ALTER TABLE public\.|$)/
    )?.[0];
    expect(storiesSection).toBeDefined();
    expect(storiesSection).not.toMatch(
      /FOREIGN KEY \(user_id\) REFERENCES auth\.users/i
    );
  });

  it("hardens prayer_video_responses.user_id to nullable SET NULL", () => {
    const migration = readMigration();
    expect(migration).toContain("prayer_video_responses_user_id_fkey");
    expect(migration).toContain("ALTER COLUMN user_id DROP NOT NULL");
    expect(migration).toMatch(
      /prayer_video_responses[\s\S]*ON DELETE SET NULL/
    );
  });

  it("hardens prayer_written_responses.author_user_id to nullable SET NULL", () => {
    const migration = readMigration();
    expect(migration).toContain("prayer_written_responses_author_user_id_fkey");
    expect(migration).toContain("ALTER COLUMN author_user_id DROP NOT NULL");
    expect(migration).toMatch(
      /prayer_written_responses[\s\S]*ON DELETE SET NULL/
    );
  });

  it("hardens prayer_updates.author_user_id to nullable SET NULL", () => {
    const migration = readMigration();
    expect(migration).toContain("prayer_updates_author_user_id_fkey");
    expect(migration).toMatch(/prayer_updates[\s\S]*ON DELETE SET NULL/);
  });

  it("changes inbox_messages.prayer_update_id FK to ON DELETE SET NULL", () => {
    const migration = readMigration();
    expect(migration).toContain("inbox_messages_prayer_update_id_fkey");
    expect(migration).toMatch(/inbox_messages[\s\S]*ON DELETE SET NULL/);
    expect(migration).not.toMatch(
      /inbox_messages[\s\S]*prayer_update_id[\s\S]*DROP NOT NULL/i
    );
  });

  it("changes content_reports.story_id FK to ON DELETE SET NULL", () => {
    const migration = readMigration();
    expect(migration).toContain("content_reports_story_id_fkey");
    expect(migration).toMatch(/content_reports[\s\S]*ON DELETE SET NULL/);
  });

  it("documents deferred story_video_replies.story_id FK change", () => {
    const migration = readMigration();
    expect(migration).toContain("story_video_replies.story_id");
    expect(migration).not.toContain("story_video_replies_story_id_fkey");
  });

  it("contains no destructive data operations", () => {
    const sql = migrationSqlStatements(readMigration());
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDROP TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP COLUMN\b/i);
    expect(sql).not.toContain("auth.admin.deleteUser");
    expect(sql).not.toContain("storage.remove");
  });

  it("does not weaken RLS or introduce public UPDATE policies", () => {
    const migration = readMigration();
    expect(migration).not.toMatch(/\bDROP POLICY\b/i);
    expect(migration).not.toMatch(/\bCREATE POLICY\b/i);
    expect(migration).not.toMatch(/\bDISABLE ROW LEVEL SECURITY\b/i);
  });
});

describe("schema readiness model after 1E.2A migration design", () => {
  it("links schema prerequisites to their owning migration files", () => {
    expect(ACCOUNT_DELETION_SCHEMA_PREREQUISITES).toHaveLength(8);

    const hardeningIds = new Set([
      "stories_user_id_nullable",
      "prayer_video_responses_user_id_set_null",
      "prayer_written_responses_author_set_null",
      "prayer_updates_author_set_null",
      "inbox_messages_prayer_update_id_set_null",
      "content_reports_story_id_set_null",
    ]);
    const storyReplyIds = new Set([
      "story_video_replies_user_id_set_null",
      "story_video_replies_recipient_user_id_set_null",
    ]);

    for (const prerequisite of ACCOUNT_DELETION_SCHEMA_PREREQUISITES) {
      expect(prerequisite.satisfied).toBe(false);
      expect(prerequisite.verificationSource).toBe("hardening_migration_designed");

      if (hardeningIds.has(prerequisite.id)) {
        expect(prerequisite.migrationFile).toBe(MIGRATION_PATH);
      } else if (storyReplyIds.has(prerequisite.id)) {
        expect(prerequisite.migrationFile).toBe(
          "supabase/migrations/20260830120000_story_video_replies_auth_fk_set_null_phase4c7b1e2b2.sql"
        );
      } else {
        throw new Error(`unexpected prerequisite id: ${prerequisite.id}`);
      }
    }
  });

  it("does not mark schemaExecutionReady true from local migration design", () => {
    expect(areSchemaPrerequisitesEnvironmentVerified()).toBe(false);
    expect(isSchemaExecutionReady()).toBe(false);
    expect(describeSchemaExecutionReadiness().schemaExecutionReady).toBe(false);
    expect(describeSchemaExecutionReadiness().readinessNote).toBe(
      ACCOUNT_DELETION_SCHEMA_READINESS_MODEL_NOTE
    );
  });

  it("keeps live execute route disconnected", () => {
    const executeRoute = readFileSync(
      "app/api/admin/account-deletion/[requestId]/execute/route.ts",
      "utf8"
    );
    expect(executeRoute).not.toContain("accountDeletionSchemaHardening");
    expect(executeRoute).not.toContain("schema_hardening");
  });
});
