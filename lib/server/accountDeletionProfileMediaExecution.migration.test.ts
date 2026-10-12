import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_PROFILE_MEDIA_EXECUTION_FOUNDATION_MIGRATION,
  ACCOUNT_DELETION_PROFILE_MEDIA_EXECUTION_FOUNDATION_NOTE,
} from "./accountDeletionDatabasePolicy";

const MIGRATION_PATH =
  ACCOUNT_DELETION_PROFILE_MEDIA_EXECUTION_FOUNDATION_MIGRATION.relativePath;

describe("account deletion profile-media foundation (3B.4B.1)", () => {
  it("defines separate profile-media authority and its bounded state contract", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    expect(sql.match(/^\s*BEGIN;/gm)).toHaveLength(1);
    expect(sql.match(/^\s*COMMIT;/gm)).toHaveLength(1);
    expect(sql).toContain("claim_account_deletion_profile_media_execution_result");
    expect(sql).toContain("authorize_account_deletion_profile_media_delete");
    expect(sql).toContain("complete_account_deletion_profile_media_execution_result");
    expect(sql).toContain("account_deletion_profile_media_progress_snapshot");
    expect(sql).toContain("account_deletion_profile_media_completion_blocked");
    for (const state of [
      "deferred_profile",
      "deleting",
      "deleted",
      "missing",
      "failed_retryable",
      "failed_terminal",
    ]) {
      expect(sql).toContain(`'${state}'`);
    }
    expect(sql).not.toMatch(
      /disposition_snapshot\s*=\s*'DEFER_PROFILE'[\s\S]{0,300}execution_state\s*=\s*'pending'/i
    );
    expect(sql).not.toContain("profile_pending");
    expect(sql).not.toContain("profile_deleting");
  });

  it("uses the exact parser/path ownership and all-profile reference safety", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toContain(
      "account_deletion_profile_avatar_reference_parse_profile_value"
    );
    expect(sql).toContain("account_deletion_profile_avatar_approved_origins");
    expect(sql).toContain("profile_avatar_reference_untrusted_raw_value");
    expect(sql).toContain(
      "account_deletion_profile_avatar_object_path_canonical"
    );
    expect(sql).toContain("/storage/v1/object/public/profile-avatars/");
    expect(sql).toContain("profile-avatars");
    expect(sql).toMatch(/avatar\\\.\(png\|webp\|jpg\|jpeg\)/);
    expect(sql).toContain("malformed_internal");
    expect(sql).toContain("external");
    expect(sql).toContain("foreign_supabase");
    expect(sql).toContain("account_deletion_profile_avatar_surviving_reference_count");
    expect(sql).toMatch(/FROM public\.profiles AS profile_row/);
    expect(sql).toMatch(/profile_row\.avatar_url\s+IS NOT NULL/);
    expect(sql).toContain("profile_media_reference_active");
    expect(sql).toContain("trg_account_deletion_profile_avatar_reference_guard");
    expect(sql).toContain("Profile avatar reference owner does not match profile");
    expect(sql).toContain("Profile avatar cannot be attached during account deletion");
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF id, avatar_url ON public\.profiles/);
    expect(sql).toContain("NEW.id IS NOT DISTINCT FROM OLD.id");
  });

  it("serializes holds and keeps hold state orthogonal", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toContain("account_deletion_profile_media_invalidate_precommit_claims");
    expect(sql).toContain("create_account_deletion_storage_preservation_hold_inner");
    expect(sql).toMatch(
      /FROM public\.account_deletion_execution_attempts[\s\S]{0,250}FOR UPDATE/
    );
    expect(sql).toContain("account_deletion_storage_preservation_hold_active");
    expect(sql).not.toMatch(
      /disposition_snapshot\s*=\s*'DEFER_PROFILE'[\s\S]{0,300}'blocked_on_hold'/i
    );
    const releaseBody = sql.match(
      /CREATE OR REPLACE FUNCTION public\.release_account_deletion_storage_preservation_hold_inner\([\s\S]*?\n\$\$;/
    )?.[0];
    expect(releaseBody).toBeTruthy();
    expect(releaseBody).toContain(
      "WHERE attempt_row.deletion_request_id = hold_row.deletion_request_id;"
    );
    expect(releaseBody).not.toMatch(
      /attempt_row\.stage\s*=\s*'database_completed'/i
    );
    expect(releaseBody).toContain(
      "IF hold_row.execution_attempt_id IS NOT NULL THEN"
    );
  });

  it("adds bounded audit vocabulary and readiness composition", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    for (const event of [
      "profile_media_claimed",
      "profile_media_claim_reclaimed",
      "profile_media_delete_authorized",
      "profile_media_completed",
    ]) {
      expect(sql).toContain(event);
    }
    expect(sql).toContain("verify_account_deletion_profile_media_ready");
    expect(sql).toContain("verify_account_deletion_profile_stage_ready");
    expect(sql).toContain("verify_account_deletion_storage_stage_runner_ready");
    expect(sql).toContain("verify_account_deletion_schema_execution_ready");
    expect(sql).toContain("journey-private-media");
    expect(sql).toContain("ordinary_storage_authority_remains_journey_only");
  });

  it("recognizes the revised coherence contract and behaviorally probes exact origins", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).not.toContain("translate(lower(parser_def)");
    expect(sql).toContain(
      "profile_media_operator_attested_origin_configured"
    );
    expect(sql).toContain("approved_origin_count = 1");
    expect(sql).toContain(
      "environment identity verification is an external deployment gate"
    );
    expect(sql).toContain("profile_media_parser_behavior");
    expect(sql).toContain("account-deletion-foreign-probe.supabase.co");
    expect(sql).toContain("foreign_parse->>'kind' <> 'internal'");
    expect(sql).toContain(
      "verify_ad_storage_execution_foundation_ready_pre_3b4b1"
    );
    expect(sql).toContain(
      "account_deletion_storage_execution_results_disposition_state_coherence"
    );
    expect(
      sql.match(
        /account_deletion_storage_execution_results_delete_work_only_for_delete_private/g
      )
    ).toHaveLength(1);
    expect(sql).toContain(
      "CHECK enforces exact ordinary DELETE_PRIVATE and DEFER_PROFILE state contracts"
    );

    const coherence = sql.match(
      /ADD CONSTRAINT account_deletion_storage_execution_results_disposition_state_coherence CHECK \(([\s\S]*?)\n  \);/
    )?.[1];
    expect(coherence).toBeTruthy();
    const deletePrivateBranch =
      coherence?.split("OR (")[0] ?? "";
    for (const state of [
      "pending",
      "blocked_on_hold",
      "deleting",
      "deleted",
      "missing",
      "failed_retryable",
      "failed_terminal",
    ]) {
      expect(deletePrivateBranch).toContain(`'${state}'::text`);
    }
    for (const profileOnlyState of [
      "deferred_profile",
      "preserved",
      "blocked",
    ]) {
      expect(deletePrivateBranch).not.toContain(`'${profileOnlyState}'::text`);
    }
    expect(sql).toContain(
      "public.account_deletion_storage_destructive_bucket_allowed('journey-private-media'::text)"
    );
    expect(sql).toContain(
      "NOT public.account_deletion_storage_destructive_bucket_allowed('profile-avatars'::text)"
    );
  });

  it("validates the exact enabled avatar trigger semantics from catalog metadata", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toContain("trigger_row.tgenabled = 'O'::\"char\"");
    expect(sql).toContain(
      "trigger_row.tgfoid = to_regprocedure("
    );
    expect(sql).toContain("trigger_row.tgtype = 23");
    expect(sql).toContain(
      "cardinality(trigger_row.tgattr::smallint[]) = 2"
    );
    expect(sql).toContain(
      "id_column.attnum = ANY (trigger_row.tgattr::smallint[])"
    );
    expect(sql).toContain(
      "avatar_column.attnum = ANY (trigger_row.tgattr::smallint[])"
    );
  });

  it("requires lifecycle authority in the future completion predicate", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    const progress = sql.match(
      /CREATE OR REPLACE FUNCTION public\.account_deletion_profile_media_progress_snapshot\([\s\S]*?\n\$\$;/
    )?.[0];
    expect(progress).toBeTruthy();
    expect(progress).toContain("request_not_in_progress");
    expect(progress).toContain("att.status <> 'active'::text");
    expect(progress).toContain("att.stage <> 'profile'::text");
    expect(progress).toContain("storage_manifest_not_finalized");
    expect(progress).toContain("total_count <> result_count");
    expect(sql).toContain("account_deletion_database_execution_context");
  });

  it("does not expand ordinary authority or add physical/profile/Auth deletion", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).not.toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.account_deletion_storage_destructive_bucket_allowed/i
    );
    expect(sql).not.toMatch(/\bDELETE\s+FROM\s+storage\.objects\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\s+public\.profiles\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\s+auth\.users\b/i);
    expect(sql).not.toMatch(/\.storage\.from\s*\(/i);
    expect(sql).not.toMatch(/\.remove\s*\(/i);
    expect(sql).not.toMatch(/auth\.admin|deleteUser/i);
    expect(sql).not.toMatch(
      /UPDATE\s+public\.account_deletion_execution_attempts[\s\S]{0,250}stage\s*=\s*'profile_completed'/i
    );
    expect(ACCOUNT_DELETION_PROFILE_MEDIA_EXECUTION_FOUNDATION_NOTE).toContain(
      "no Storage/Auth/profile DELETE"
    );
  });

  it("keeps profile-media authority service-role-only and helper functions sealed", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    const normalized = sql
      .replace(/\s+/g, " ")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")");
    for (const signature of [
      "claim_account_deletion_profile_media_execution_result(uuid, uuid, uuid, integer)",
      "authorize_account_deletion_profile_media_delete(uuid, uuid, uuid, uuid)",
      "complete_account_deletion_profile_media_execution_result(uuid, uuid, uuid, uuid, text, text)",
    ]) {
      expect(normalized).toContain(
        `GRANT EXECUTE ON FUNCTION public.${signature} TO service_role`
      );
      for (const role of ["authenticated", "anon", "PUBLIC"]) {
        expect(normalized.toLowerCase()).toContain(
          `REVOKE ALL ON FUNCTION public.${signature} FROM ${role}`.toLowerCase()
        );
      }
    }
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = ''");
  });
});

describe("profile-media foundation has no invocation surface", () => {
  it("is not imported by route/handler; orchestrator delegates ticks only", () => {
    const route = readFileSync(
      "app/api/admin/account-deletion/[requestId]/execute/route.ts",
      "utf8"
    );
    const handler = readFileSync(
      "lib/server/accountDeletionExecuteHandler.ts",
      "utf8"
    );
    const orchestrator = readFileSync(
      "lib/server/accountDeletionExecutionOrchestrator.ts",
      "utf8"
    );
    const entrypoints = `${route}\n${handler}`;
    expect(entrypoints).not.toContain("accountDeletionProfileMedia");
    expect(entrypoints).not.toContain(
      "claim_account_deletion_profile_media_execution_result"
    );
    expect(entrypoints).not.toContain("authorize_account_deletion_profile_media_delete");
    expect(entrypoints).not.toContain(
      "complete_account_deletion_profile_media_execution_result"
    );
    expect(orchestrator).toContain("runAccountDeletionProfileMediaTick");
    expect(orchestrator).not.toContain("accountDeletionProfileMediaObjectExecutor");
    expect(orchestrator).not.toContain("executeAccountDeletionProfileMediaObject");
  });

  it("has no API, cron, worker, queue, or UI caller", () => {
    const files = (root: string): string[] =>
      readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const path = join(root, entry.name);
        return entry.isDirectory() ? files(path) : [path];
      });
    const appSource = files("app")
      .filter((path) => /\.(ts|tsx|js|jsx)$/.test(path))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(appSource).not.toContain("accountDeletionProfileMedia");
    expect(appSource).not.toContain(
      "claim_account_deletion_profile_media_execution_result"
    );
    expect(appSource).not.toContain("authorize_account_deletion_profile_media_delete");
    expect(appSource).not.toContain(
      "complete_account_deletion_profile_media_execution_result"
    );
  });
});
