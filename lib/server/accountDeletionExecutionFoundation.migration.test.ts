import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCOUNT_DELETION_EXECUTION_ENV_FLAG } from "./accountDeletionExecutionPolicy";
import { isSchemaExecutionReady } from "./accountDeletionDatabasePolicy";

export const ACCOUNT_DELETION_EXECUTION_FOUNDATION_MIGRATION = {
  version: "20260830140000",
  filename:
    "20260830140000_account_deletion_execution_foundation_phase4c7b1e2c2.sql",
  relativePath:
    "supabase/migrations/20260830140000_account_deletion_execution_foundation_phase4c7b1e2c2.sql",
  phase: "4C.7B.1E.2C.2A",
} as const;

const MIGRATION_PATH = ACCOUNT_DELETION_EXECUTION_FOUNDATION_MIGRATION.relativePath;

const SHARED_ENGAGEMENT_TABLES = [
  "story_reactions",
  "saved_content",
  "prayer_follows",
  "prayer_video_responses",
  "prayer_written_responses",
  "prayer_updates",
] as const;

const INTERNAL_FREEZE_HELPERS = [
  "account_user_deletion_in_progress",
  "account_deletion_story_shared_write_blocked",
  "story_video_reply_row_targets_deletion_in_progress",
  "story_video_reply_parent_thread_blocked",
  "story_video_reply_shared_write_blocked",
  "account_deletion_inbox_row_shared_write_blocked",
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

function functionBody(migration: string, functionName: string): string {
  const pattern = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${functionName}[\\s\\S]*?\\$\\$;`,
    "i"
  );
  const match = migration.match(pattern);
  expect(match, `expected function body for ${functionName}`).toBeTruthy();
  return match![0];
}

describe("account deletion execution foundation migration (Phase 4C.7B.1E.2C.2A)", () => {
  it("wraps changes in a transaction", () => {
    const migration = readMigration();
    expect(migration).toMatch(/^\s*BEGIN;/m);
    expect(migration).toMatch(/^\s*COMMIT;/m);
  });

  it("has fail-closed preconditions and no request-row DML", () => {
    const migration = readMigration();
    const sql = migrationSqlStatements(migration);

    expect(migration).toContain("2C.2A precondition failed");
    expect(migration).toContain("current_user_account_write_blocked() missing");
    expect(migration).toContain("account_deletion_write_block_insert");
    expect(migration).toContain("Users can add video replies");
    expect(migration).toContain("Users can update their video replies");
    expect(migration).toContain("parent_reply_id ON DELETE SET NULL FK");
    expect(migration).toContain("story_id ON DELETE CASCADE FK");
    expect(sql).not.toMatch(/\bUPDATE\s+public\.account_deletion_requests\b/i);
    expect(sql).not.toMatch(/\bINSERT\s+INTO\s+public\.account_deletion_requests\b/i);
    expect(sql).not.toMatch(/\bINSERT\s+INTO\s+public\.account_deletion_execution_attempts\b/i);
    expect(sql).not.toMatch(
      /\bUPDATE\s+public\.account_deletion_requests[\s\S]*status[\s\S]*deletion_in_progress/i
    );
    expect(sql).not.toMatch(/\bUPDATE\s+public\.account_deletion_requests[\s\S]*'deleted'/i);
  });

  it("defines account_deletion_execution_attempts with required columns and checks", () => {
    const migration = readMigration();

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.account_deletion_execution_attempts");
    for (const column of [
      "deletion_request_id",
      "target_user_id",
      "initiated_by",
      "status",
      "stage",
      "started_at",
      "updated_at",
      "completed_at",
      "last_error_code",
      "last_error_detail_safe",
      "retry_count",
      "story_inventory_fingerprint",
      "reply_inventory_fingerprint",
      "database_plan_fingerprint",
      "database_rows_affected",
      "storage_objects_expected",
      "storage_objects_deleted",
      "auth_delete_started_at",
      "auth_deleted_at",
    ]) {
      expect(migration).toContain(column);
    }

    expect(migration).toContain("account_deletion_execution_attempts_status_check");
    expect(migration).toContain("'active'::text");
    expect(migration).toContain("retry_count >= 0");
  });

  it("enforces one active execution attempt per deletion request", () => {
    const migration = readMigration();
    expect(migration).toContain(
      "account_deletion_execution_attempts_one_active_per_request_idx"
    );
    expect(migration).toMatch(/WHERE status = 'active'::text/);
    expect(migration).toMatch(/UNIQUE INDEX[\s\S]*deletion_request_id/);
  });

  it("locks execution attempt audit table to service_role and enables RLS", () => {
    const migration = readMigration();
    expect(migration).toContain(
      "ALTER TABLE public.account_deletion_execution_attempts ENABLE ROW LEVEL SECURITY"
    );
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.account_deletion_execution_attempts FROM PUBLIC"
    );
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE ON TABLE public.account_deletion_execution_attempts TO service_role"
    );
    expect(migration).not.toContain(
      "GRANT SELECT, INSERT, UPDATE ON TABLE public.account_deletion_execution_attempts TO authenticated"
    );
  });

  it("does not grant authenticated EXECUTE on internal deletion-status helpers", () => {
    const migration = readMigration();

    for (const helper of INTERNAL_FREEZE_HELPERS) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${helper}`);
      expect(migration).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${helper}[\\s\\S]*FROM authenticated`,
          "i"
        )
      );
      expect(migration).not.toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${helper}[\\s\\S]*TO authenticated`,
          "i"
        )
      );
    }
  });

  it("defines account_user_deletion_in_progress with snapshot-aware semantics", () => {
    const migration = readMigration();
    const helper = functionBody(migration, "account_user_deletion_in_progress");

    expect(helper).toMatch(/p_target_user_id IS NOT NULL/i);
    expect(helper).toContain("deletion_in_progress");
    expect(helper).toMatch(/request_row\.user_id = p_target_user_id/);
    expect(helper).toMatch(
      /request_row\.user_id IS NULL[\s\S]*request_row\.target_user_id_snapshot = p_target_user_id/
    );
    expect(helper).toMatch(/SECURITY DEFINER/i);
    expect(helper).toMatch(/SET search_path = ''/i);
  });

  it("enforces story_video_replies shared write freeze via BEFORE triggers", () => {
    const migration = readMigration();
    const parent = functionBody(migration, "story_video_reply_parent_thread_blocked");
    const trigger = functionBody(
      migration,
      "trg_account_deletion_shared_story_video_replies_write_freeze"
    );

    expect(parent).toMatch(/depth > 100/i);
    expect(parent).toMatch(/current_id = ANY \(visited\)/i);
    expect(parent).toMatch(/current_story_id IS DISTINCT FROM p_story_id/i);
    expect(parent).toMatch(/IF NOT FOUND THEN[\s\S]*RETURN true/i);

    expect(migration).toContain("account_deletion_shared_story_video_replies_write_freeze");
    expect(migration).toMatch(
      /BEFORE INSERT OR UPDATE OR DELETE ON public\.story_video_replies/i
    );

    expect(trigger).toContain("TG_OP = 'INSERT'");
    expect(trigger).toContain("TG_OP = 'UPDATE'");
    expect(trigger).toContain("TG_OP = 'DELETE'");
    expect(trigger).toContain("OLD.user_id");
    expect(trigger).toContain("NEW.user_id");
    expect(trigger).toContain("story_video_reply_shared_write_blocked");
  });

  it("adds shared engagement and inbox write-freeze triggers", () => {
    const migration = readMigration();

    for (const table of SHARED_ENGAGEMENT_TABLES) {
      expect(migration).toContain(
        `account_deletion_shared_${table === "story_reactions" ? "story_reactions" : table}_write_freeze`
      );
      expect(migration).toMatch(
        new RegExp(`BEFORE INSERT OR UPDATE OR DELETE ON public\\.${table}`, "i")
      );
    }

    expect(migration).toContain("account_deletion_shared_inbox_write_freeze");
    expect(migration).toMatch(
      /BEFORE INSERT OR UPDATE OR DELETE ON public\.inbox_messages/i
    );
    expect(migration).toContain(
      "trg_account_deletion_shared_story_id_engagement_write_freeze"
    );
    expect(migration).toContain("trg_account_deletion_shared_inbox_write_freeze");
  });

  it("does not shared-freeze content_reports or blocked_users", () => {
    const migration = readMigration();
    const sharedFreezeTriggerBlocks = migration.match(
      /CREATE TRIGGER account_deletion_shared[\s\S]*?EXECUTE FUNCTION public\.trg_account_deletion_shared_[^;]+;/g
    );
    expect(sharedFreezeTriggerBlocks ?? []).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/ON public\.content_reports/i),
        expect.stringMatching(/ON public\.blocked_users/i),
      ])
    );
    for (const block of sharedFreezeTriggerBlocks ?? []) {
      expect(block).not.toMatch(/ON public\.content_reports/i);
      expect(block).not.toMatch(/ON public\.blocked_users/i);
    }
    expect(migration).toContain(
      "content_reports and blocked_users: intentionally NOT frozen"
    );
  });

  it("covers story owner NULL race via active execution attempt association", () => {
    const migration = readMigration();
    const storyBlocked = functionBody(
      migration,
      "account_deletion_story_shared_write_blocked"
    );

    expect(storyBlocked).toContain("account_deletion_execution_attempts");
    expect(storyBlocked).toContain("ea.status = 'active'");
    expect(storyBlocked).toContain("story_video_replies");
  });

  it("defines read-only execution lock prerequisite helpers without mutations", () => {
    const migration = readMigration();
    const readCtx = functionBody(
      migration,
      "read_account_deletion_execution_request_context"
    );
    const validate = functionBody(
      migration,
      "validate_account_deletion_execution_lock_prerequisites"
    );

    expect(readCtx).not.toMatch(/\bUPDATE\b|\bINSERT\b|\bDELETE\b/i);
    expect(validate).not.toMatch(/\bUPDATE\b|\bINSERT\b|\bDELETE\b/i);

    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.read_account_deletion_execution_request_context(uuid) TO service_role"
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.read_account_deletion_execution_request_context(uuid) FROM authenticated"
    );
  });

  it("does not create destructive database mutation RPC", () => {
    const migration = readMigration();
    expect(migration).not.toContain("execute_account_deletion_database_stage");
    expect(migration).not.toMatch(
      /\bUPDATE\s+public\.story_video_replies\b/i
    );
  });

  it("extends verify_account_deletion_schema_execution_ready via foundation probe", () => {
    const migration = readMigration();

    expect(migration).toContain("verify_account_deletion_execution_foundation_ready()");
    expect(migration).toContain("execution_attempt_table_ready");
    expect(migration).toContain("execution_attempt_single_active_constraint");
    expect(migration).toContain("shared_target_freeze_helper_ready");
    expect(migration).toContain("story_video_replies_shared_write_freeze_ready");
    expect(migration).toContain("shared_engagement_write_freeze_ready");
    expect(migration).toContain("execution_foundation_security_ready");
    expect(migration).toContain("foundation := public.verify_account_deletion_execution_foundation_ready()");
    expect(migration).toContain("stories_user_id_nullable");
    expect(migration).toContain("story_video_replies_parent_reply_id_set_null");
    expect(migration).toContain("story_video_replies_story_id_cascade");
    expect(migration).toContain("write_freeze_public_rls_present");
    expect(migration).toContain("has_function_privilege('authenticated'");
  });

  it("restricts foundation and schema readiness RPCs to service_role", () => {
    const migration = readMigration();
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.verify_account_deletion_execution_foundation_ready() TO service_role"
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.verify_account_deletion_execution_foundation_ready() FROM authenticated"
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.verify_account_deletion_schema_execution_ready() FROM authenticated"
    );
  });

  it("contains no destructive account-deletion execution", () => {
    const sql = migrationSqlStatements(readMigration());
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toContain("auth.admin.deleteUser");
    expect(sql).not.toContain("auth.admin.signOut");
    expect(sql).not.toContain("storage.remove");
    expect(sql).not.toMatch(/\.update\(/i);
  });

  it("does not enable execution gate or wire executor mutations", () => {
    const executeHandler = readFileSync(
      "lib/server/accountDeletionExecuteHandler.ts",
      "utf8"
    );

    expect(isSchemaExecutionReady()).toBe(false);
    expect(process.env[ACCOUNT_DELETION_EXECUTION_ENV_FLAG]).toBeUndefined();
    expect(executeHandler).not.toContain("account_deletion_execution_attempts");
    expect(executeHandler).not.toContain("execute_account_deletion");
  });

  it("drops superseded 2C.2 RLS shared-freeze policies", () => {
    const migration = readMigration();
    expect(migration).toContain(
      "DROP POLICY IF EXISTS account_deletion_shared_reply_insert_block"
    );
    expect(migration).not.toContain(
      "CREATE POLICY account_deletion_shared_reply_insert_block"
    );
  });
});

describe("execution foundation shared-freeze adversarial contracts (2C.2A)", () => {
  it("shared reply freeze checks direct recipient and parent thread separately", () => {
    const migration = readMigration();
    const shared = functionBody(migration, "story_video_reply_shared_write_blocked");

    expect(shared).toContain("p_recipient_user_id");
    expect(shared).toContain("p_parent_reply_id");
    expect(shared).toContain("p_story_id");
    expect(shared).toContain("story_video_reply_row_targets_deletion_in_progress");
    expect(shared).toContain("story_video_reply_parent_thread_blocked");
  });

  it("UPDATE trigger checks both OLD and NEW row states", () => {
    const migration = readMigration();
    const trigger = functionBody(
      migration,
      "trg_account_deletion_shared_story_video_replies_write_freeze"
    );

    expect(trigger).toMatch(
      /TG_OP = 'UPDATE'[\s\S]*OLD\.user_id[\s\S]*NEW\.user_id/i
    );
    expect(trigger).toMatch(
      /story_video_reply_shared_write_blocked\([\s\S]*OLD\./
    );
    expect(trigger).toMatch(
      /story_video_reply_shared_write_blocked\([\s\S]*NEW\./
    );
  });

  it("inbox freeze targets recipient and sender association", () => {
    const migration = readMigration();
    const inboxHelper = functionBody(
      migration,
      "account_deletion_inbox_row_shared_write_blocked"
    );

    expect(inboxHelper).toContain("p_recipient_user_id");
    expect(inboxHelper).toContain("p_sender_user_id");
  });

  it("readiness verifies authenticated cannot execute deletion-status helper", () => {
    const migration = readMigration();
    const foundationFn = functionBody(
      migration,
      "verify_account_deletion_execution_foundation_ready"
    );
    expect(foundationFn).toContain("shared_target_freeze_helper_ready");
    expect(foundationFn).toContain(
      "has_function_privilege('authenticated', 'public.account_user_deletion_in_progress(uuid)', 'EXECUTE')"
    );
    expect(foundationFn).toMatch(/NOT pg_catalog\.has_function_privilege\('authenticated'/);
  });

  it("does not add SELECT policies or DML on existing replies", () => {
    const migration = readMigration();
    expect(migration).not.toMatch(
      /CREATE POLICY[\s\S]*story_video_replies[\s\S]*FOR SELECT/i
    );
    expect(migration).not.toMatch(/\bUPDATE\s+public\.story_video_replies\b/i);
  });
});
