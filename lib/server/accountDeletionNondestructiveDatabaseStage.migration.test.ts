import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE } from "./accountDeletionStoryVideoReplyPlan";
import {
  ACCOUNT_DELETION_NONDESTRUCTIVE_DATABASE_STAGE_MIGRATION,
  DELETED_PUBLIC_AUTHOR_DISPLAY_NAME,
  INBOX_SURVIVING_COPY_IDENTITY_DETACH_FIELDS,
} from "./accountDeletionDatabasePolicy";
import { STORY_ANONYMIZATION_PII_FIELDS } from "./accountDeletionPolicy";
import { NEVER_PUBLISHED_STORY_STATUSES } from "./accountDeletionStoryLifecycle";
import { ACCOUNT_DELETION_EXECUTION_ENV_FLAG } from "./accountDeletionExecutionPolicy";
import { isSchemaExecutionReady } from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH =
  ACCOUNT_DELETION_NONDESTRUCTIVE_DATABASE_STAGE_MIGRATION.relativePath;

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

function migrationSqlStatements(migration: string): string {
  return migration
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function withoutExecutionContextCleanup(sql: string): string {
  return sql.replace(
    /DELETE\s+FROM\s+public\.account_deletion_database_execution_context[\s\S]*?;/gi,
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

describe("account deletion nondestructive database stage migration (Phase 4C.7B.1E.2C.3B.1)", () => {
  it("wraps changes in a transaction with fail-closed preconditions", () => {
    const migration = readMigration();
    expect(migration).toMatch(/^\s*BEGIN;/m);
    expect(migration).toMatch(/^\s*COMMIT;/m);
    expect(migration).toContain("2C.3B.1 precondition failed");
    expect(migration).toContain(
      "verify_account_deletion_acquisition_foundation_ready() missing"
    );
  });

  it("performs no user/content DML or auto invocation on apply", () => {
    const migration = readMigration();
    const sql = migrationSqlStatements(migration);

    expect(sql).not.toMatch(/\bINSERT\s+INTO\s+public\.account_deletion_requests\b/i);
    expect(sql).not.toMatch(
      /\bINSERT\s+INTO\s+public\.account_deletion_execution_attempts\b/i
    );
    expect(sql).not.toMatch(
      /\bSELECT\s+public\.execute_account_deletion_nondestructive_database_stage\s*\(/i
    );
    expect(sql).not.toMatch(
      /\bPERFORM\s+public\.execute_account_deletion_nondestructive_database_stage\s*\(/i
    );
    expect(withoutExecutionContextCleanup(sql)).not.toMatch(
      /\bDELETE\s+FROM\s+public\./i
    );
    expect(sql).not.toMatch(/auth\.admin\.deleteUser/i);
    expect(sql).not.toMatch(/signOut/i);
  });

  it("adds database_completed stage and does not use durable database marker in executor", () => {
    const migration = readMigration();
    expect(migration).toContain("'database_completed'");
    const rpcBody = functionBody(
      migration,
      "execute_account_deletion_nondestructive_database_stage"
    );
    expect(rpcBody).toContain("'database_completed'");
    expect(rpcBody).toContain("stage = 'database_completed'::text");
    expect(rpcBody).not.toMatch(
      /attempt_row[\s\S]*SET[\s\S]*stage = 'database'::text/
    );
    expect(rpcBody).toContain("stage = 'database'::text");
    expect(rpcBody).toContain("invalid_stage");
    expect(rpcBody).toContain("'inventory'::text");
  });

  it("defines executor RPC with exact signature and security", () => {
    const migration = readMigration();
    const rpcBody = functionBody(
      migration,
      "execute_account_deletion_nondestructive_database_stage"
    );

    expect(rpcBody).toContain(
      "execute_account_deletion_nondestructive_database_stage(\n  p_request_id uuid,\n  p_attempt_id uuid\n)"
    );
    expect(rpcBody).not.toMatch(/\bp_target_user_id\b/i);
    expect(rpcBody).not.toMatch(/\bplan_json\b/i);
    expect(rpcBody).toContain("SECURITY DEFINER");
    expect(rpcBody).toContain("SET search_path = ''");
    expect(rpcBody).toContain("FOR UPDATE");
    expect(rpcBody).toContain("pg_advisory_xact_lock");
    expect(rpcBody).toContain("hashtextextended");
    expect(rpcBody).toContain("verify_account_deletion_schema_execution_ready()");
    expect(rpcBody).toContain(
      "verify_account_deletion_nondestructive_database_stage_ready()"
    );
    expect(rpcBody).toContain("coalesce(req.user_id, req.target_user_id_snapshot)");
    expect(rpcBody).toContain("deletion_in_progress");
    expect(rpcBody).toContain("already_completed");
  });

  it("restricts executor RPC to service_role only", () => {
    const migration = readMigration();
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.execute_account_deletion_nondestructive_database_stage(uuid, uuid) FROM PUBLIC"
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.execute_account_deletion_nondestructive_database_stage(uuid, uuid) FROM authenticated"
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.execute_account_deletion_nondestructive_database_stage(uuid, uuid) TO service_role"
    );
    expect(migration).not.toContain(
      "GRANT EXECUTE ON FUNCTION public.execute_account_deletion_nondestructive_database_stage(uuid, uuid) TO authenticated"
    );
  });

  it("excludes content_reports and forbids destructive operations", () => {
    const migration = readMigration();
    const rpcBody = functionBody(
      migration,
      "execute_account_deletion_nondestructive_database_stage"
    );

    expect(rpcBody).not.toMatch(/\bcontent_reports\b/i);
    expect(rpcBody).not.toMatch(/\bprofiles\b/i);
    expect(rpcBody).not.toMatch(/\bauth\.users\b/i);
    expect(rpcBody).not.toMatch(/\bstorage\./i);
    expect(withoutExecutionContextCleanup(rpcBody)).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(rpcBody).toContain(
      "DELETE FROM public.account_deletion_database_execution_context"
    );
    expect(rpcBody).not.toMatch(/set_config\s*\(\s*'htbf\.deletion_executor'/i);
    expect(rpcBody).not.toMatch(/current_setting\s*\(\s*'htbf\.deletion_executor'/i);
  });

  it("matches tombstone and story identity contracts from TypeScript", () => {
    const migration = readMigration();
    const tombstoneBody = functionBody(
      migration,
      "account_deletion_reply_tombstone_message"
    );
    expect(tombstoneBody).toContain(ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE);

    const displayBody = functionBody(
      migration,
      "account_deletion_deleted_public_author_display_name"
    );
    expect(displayBody).toContain(DELETED_PUBLIC_AUTHOR_DISPLAY_NAME);

    const rpcBody = functionBody(
      migration,
      "execute_account_deletion_nondestructive_database_stage"
    );
    for (const field of STORY_ANONYMIZATION_PII_FIELDS) {
      expect(rpcBody).toContain(field);
    }
  });

  it("implements reply classification with B→A message preservation", () => {
    const migration = readMigration();
    const rpcBody = functionBody(
      migration,
      "execute_account_deletion_nondestructive_database_stage"
    );

    expect(rpcBody).toContain("deleted_by_sender = true");
    expect(rpcBody).toContain("deleted_by_recipient = true");
    expect(rpcBody).toContain("live_row.message = expected_row.message");
    expect(rpcBody).toContain("live_row.message = expected_row.message");
    expect(rpcBody).toContain("reply_recipient_detach");
    expect(rpcBody).toMatch(
      /WHERE reply_row\.recipient_user_id = resolved_target[\s\S]*SET[\s\S]*recipient_user_id = NULL[\s\S]*deleted_by_recipient = true/
    );
    const bToAUpdateStart = rpcBody.indexOf(
      "WHERE reply_row.recipient_user_id = resolved_target"
    );
    const bToARowsAffected = rpcBody.indexOf(
      "reply_recipient_detach",
      bToAUpdateStart
    );
    const bToABlock = rpcBody.slice(bToAUpdateStart, bToARowsAffected);
    expect(bToABlock).not.toContain("message = tombstone");
  });

  it("uses inbox sender detach only and prayer identity-only mutations", () => {
    const migration = readMigration();
    const rpcBody = functionBody(
      migration,
      "execute_account_deletion_nondestructive_database_stage"
    );

    expect(INBOX_SURVIVING_COPY_IDENTITY_DETACH_FIELDS).toEqual(["sender_user_id"]);
    expect(rpcBody).toContain("SET sender_user_id = NULL");
    expect(rpcBody).not.toMatch(/inbox_messages[\s\S]*SET[\s\S]*title\s*=/i);
    expect(rpcBody).not.toMatch(/inbox_messages[\s\S]*SET[\s\S]*body\s*=/i);
    expect(rpcBody).toContain("prayer_video_responses");
    expect(rpcBody).toMatch(/prayer_video_responses[\s\S]*SET user_id = NULL/);
    expect(rpcBody).toMatch(
      /prayer_written_responses[\s\S]*SET author_user_id = NULL/
    );
    expect(rpcBody).toMatch(/prayer_updates[\s\S]*SET author_user_id = NULL/);
  });

  it("fail-closes never-published story preflight using TypeScript statuses", () => {
    const migration = readMigration();
    const rpcBody = functionBody(
      migration,
      "execute_account_deletion_nondestructive_database_stage"
    );

    for (const status of NEVER_PUBLISHED_STORY_STATUSES) {
      expect(rpcBody).toContain(`'${status}'`);
    }
    expect(rpcBody).toContain("unsupported_destructive_action");
    expect(rpcBody).toMatch(/stories[\s\S]*FOR UPDATE[\s\S]*unsupported_destructive_action/);
  });

  it("uses exact row-count assertions and six-table whitelist", () => {
    const migration = readMigration();
    const rpcBody = functionBody(
      migration,
      "execute_account_deletion_nondestructive_database_stage"
    );

    expect(rpcBody).toContain("GET DIAGNOSTICS row_count = ROW_COUNT");
    expect(rpcBody).toContain("row_count_mismatch");
    expect(rpcBody).toContain("story_video_replies");
    expect(rpcBody).toContain("prayer_video_responses");
    expect(rpcBody).toContain("prayer_written_responses");
    expect(rpcBody).toContain("prayer_updates");
    expect(rpcBody).toContain("inbox_messages");
    expect(rpcBody).toContain("stories");
    expect(rpcBody).toContain("account_deletion_execution_attempts");
  });

  it("defines readiness probe and composes schema execution readiness", () => {
    const migration = readMigration();
    expect(migration).toContain(
      "verify_account_deletion_nondestructive_database_stage_ready()"
    );
    expect(migration).toContain(
      "verify_account_deletion_schema_execution_ready_before_3b1"
    );
    expect(migration).toContain("nondestructive_database_stage_rpc_ready");
    expect(migration).toContain("database_completed_stage_check");
    expect(migration).toContain("acquisition_foundation_still_ready");
  });

  it("does not enable execution by default in TypeScript policy", () => {
    expect(ACCOUNT_DELETION_EXECUTION_ENV_FLAG).toBe(
      "HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED"
    );
    expect(isSchemaExecutionReady()).toBe(false);
  });

  it("defines execution context table and authorization helpers", () => {
    const migration = readMigration();
    expect(migration).toContain("account_deletion_database_execution_context");
    expect(migration).toContain("PRIMARY KEY (backend_pid, transaction_id)");
    expect(migration).toContain("'nondestructive_database_stage'");
    expect(migration).toContain(
      "account_deletion_database_execution_context_is_valid()"
    );
    expect(migration).toContain(
      "account_deletion_story_video_reply_database_mutation_authorized"
    );
    expect(migration).toContain(
      "account_deletion_story_database_mutation_authorized"
    );
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.account_deletion_database_execution_context FROM service_role"
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.account_deletion_database_execution_context_is_valid() FROM service_role"
    );

    const rpcBody = functionBody(
      migration,
      "execute_account_deletion_nondestructive_database_stage"
    );
    expect(rpcBody).toContain(
      "INSERT INTO public.account_deletion_database_execution_context"
    );
    expect(rpcBody).toContain(
      "DELETE FROM public.account_deletion_database_execution_context"
    );
    expect(rpcBody).not.toMatch(
      /set_config\s*\(\s*'htbf\.deletion_executor'/i
    );
  });

  it("defines shared stories write freeze with exact anonymization authorizer", () => {
    const migration = readMigration();
    const storyAuthorizer = functionBody(
      migration,
      "account_deletion_story_database_mutation_authorized"
    );
    const storyTrigger = functionBody(
      migration,
      "trg_account_deletion_shared_stories_write_freeze"
    );

    expect(migration).toContain("account_deletion_shared_stories_write_freeze");
    expect(migration).toContain("ON public.stories");
    expect(storyAuthorizer).toContain(
      "account_deletion_database_execution_context_is_valid()"
    );
    expect(storyAuthorizer).toContain(
      "account_deletion_deleted_public_author_display_name()"
    );
    for (const field of STORY_ANONYMIZATION_PII_FIELDS) {
      expect(storyAuthorizer).toContain(`'${field}'::text`);
    }
    expect(storyTrigger).toContain(
      "account_deletion_story_database_mutation_authorized(OLD, NEW)"
    );
    expect(storyTrigger).toContain("account_user_deletion_in_progress(NEW.user_id)");
    expect(storyTrigger).toContain(
      "account_deletion_story_shared_write_blocked(OLD.id)"
    );
    expect(storyTrigger).toContain(
      "account_deletion_story_database_mutation_authorized(OLD, NEW)"
    );
  });

  it("defines durable M3 story freeze scope with minimal retention contract", () => {
    const migration = readMigration();
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.account_deletion_story_freeze_scope");
    expect(migration).toContain(
      "PRIMARY KEY (deletion_request_id, story_id)"
    );
    expect(migration).toContain(
      "account_deletion_story_freeze_scope_story_request_idx"
    );
    expect(migration).toContain("ON DELETE CASCADE");
    const scopeTableDef =
      migration.match(
        /CREATE TABLE IF NOT EXISTS public\.account_deletion_story_freeze_scope[\s\S]*?\);/
      )?.[0] ?? "";
    expect(scopeTableDef).not.toContain("target_user_id");
    expect(scopeTableDef).not.toContain("attempt_id");
    expect(scopeTableDef).not.toContain("association_reason");
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.account_deletion_story_freeze_scope FROM service_role"
    );

    const blockedBody = functionBody(
      migration,
      "account_deletion_story_shared_write_blocked"
    );
    expect(blockedBody).toContain("account_deletion_story_freeze_scope");
    expect(blockedBody).toContain("deletion_in_progress");

    const rpcBody = functionBody(
      migration,
      "execute_account_deletion_nondestructive_database_stage"
    );
    const scopeInsert = rpcBody.indexOf(
      "INSERT INTO public.account_deletion_story_freeze_scope"
    );
    const contextInsert = rpcBody.indexOf(
      "INSERT INTO public.account_deletion_database_execution_context"
    );
    expect(scopeInsert).toBeGreaterThan(-1);
    expect(contextInsert).toBeGreaterThan(scopeInsert);

    const replyBlockedBody = functionBody(
      migration,
      "story_video_reply_shared_write_blocked"
    );
    expect(replyBlockedBody).toContain(
      "account_deletion_story_shared_write_blocked(p_story_id)"
    );
  });

  it("readiness verifies all authorizers, triggers, and engagement no-bypass invariant", () => {
    const migration = readMigration();
    const readinessBody = functionBody(
      migration,
      "verify_account_deletion_nondestructive_database_stage_ready"
    );

    expect(readinessBody).toContain("database_mutation_authorizers_present");
    expect(readinessBody).toContain("database_mutation_authorizers_security_ready");
    expect(readinessBody).toContain("database_write_freeze_triggers_ready");
    expect(readinessBody).toContain("database_write_freeze_authorization_wiring_ready");
    expect(readinessBody).toContain(
      "database_engagement_freeze_no_executor_bypass_ready"
    );
    expect(readinessBody).toContain(
      "account_deletion_story_database_mutation_authorized(public.stories, public.stories)"
    );
    expect(readinessBody).toContain(
      "account_deletion_prayer_video_response_database_mutation_authorized"
    );
    expect(readinessBody).toContain(
      "account_deletion_inbox_message_database_mutation_authorized"
    );
    expect(readinessBody).toContain(
      "account_deletion_shared_stories_write_freeze"
    );
    expect(readinessBody).toContain(
      "trg_account_deletion_shared_story_id_engagement_write_freeze"
    );
    expect(readinessBody).toContain("NOT LIKE '%database_mutation_authorized%'");
    expect(readinessBody).toContain("has_table_privilege('anon'");
    expect(readinessBody).toContain("story_freeze_scope_table_ready");
    expect(readinessBody).toContain("story_freeze_scope_lookup_wiring_ready");
  });

  it("statically requires readiness to fail when authorization artifacts are absent", () => {
    const migration = readMigration();
    const readinessBody = functionBody(
      migration,
      "verify_account_deletion_nondestructive_database_stage_ready"
    );

    expect(readinessBody).toMatch(
      /to_regprocedure\([\s\S]*account_deletion_story_database_mutation_authorized\(public\.stories, public\.stories\)[\s\S]*\) IS NOT NULL/
    );
    expect(readinessBody).toContain(
      "has_function_privilege('service_role', 'public.' || required.signature, 'EXECUTE')"
    );
    expect(readinessBody).toContain(
      "rel.relname = required.table_name"
    );
    expect(readinessBody).toContain(
      "authorizer_marker"
    );
    expect(readinessBody).toContain(
      "account_deletion_shared_stories_write_freeze"
    );
  });

  it("uses non-conflicting SQL aliases for reply locking and graph validation", () => {
    const migration = readMigration();
    const rpcBody = functionBody(
      migration,
      "execute_account_deletion_nondestructive_database_stage"
    );
    const graphBody = functionBody(
      migration,
      "account_deletion_validate_target_reply_graph"
    );

    expect(rpcBody).not.toMatch(
      /PERFORM\s+reply_row\.id\s*\n\s*FROM\s+public\.story_video_replies\s+AS\s+reply_row/i
    );
    expect(rpcBody).toMatch(
      /PERFORM\s+locked_reply\.id\s*\n\s*FROM\s+public\.story_video_replies\s+AS\s+locked_reply/i
    );
    expect(rpcBody).toMatch(
      /WHERE\s+locked_reply\.user_id\s*=\s*resolved_target\s*\n\s*OR\s+locked_reply\.recipient_user_id\s*=\s*resolved_target[\s\S]*FOR UPDATE/i
    );

    expect(graphBody).not.toMatch(
      /FOR\s+reply_row\s+IN[\s\S]*SELECT[\s\S]*reply_row\.id[\s\S]*FROM\s+public\.story_video_replies\s+AS\s+reply_row/i
    );
    expect(graphBody).toMatch(
      /FOR\s+reply_row\s+IN[\s\S]*graph_reply\.id[\s\S]*FROM\s+public\.story_video_replies\s+AS\s+graph_reply/i
    );
    expect(graphBody).toMatch(
      /FROM\s+public\.story_video_replies\s+AS\s+graph_reply[\s\S]*graph_reply\.user_id\s*=\s*p_target/i
    );
  });
});
