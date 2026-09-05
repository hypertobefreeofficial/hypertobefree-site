import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCOUNT_DELETION_EXECUTION_ENV_FLAG } from "./accountDeletionExecutionPolicy";
import { isSchemaExecutionReady } from "./accountDeletionDatabasePolicy";

export const ACCOUNT_DELETION_WRITE_FREEZE_MIGRATION = {
  version: "20260830110000",
  filename: "20260830110000_account_deletion_write_freeze_phase4c7b1e2b0a.sql",
  relativePath:
    "supabase/migrations/20260830110000_account_deletion_write_freeze_phase4c7b1e2b0a.sql",
  phase: "4C.7B.1E.2B.0A",
} as const;

const MIGRATION_PATH = ACCOUNT_DELETION_WRITE_FREEZE_MIGRATION.relativePath;

const WRITE_BLOCK_PUBLIC_TABLES = [
  "stories",
  "profiles",
  "prayer_written_responses",
  "prayer_updates",
  "inbox_messages",
  "story_reactions",
  "story_video_replies",
  "saved_content",
  "prayer_follows",
  "prayer_search_preferences",
  "blocked_users",
  "content_reports",
  "account_deletion_requests",
  "prayer_video_responses",
] as const;

const WRITE_BLOCK_POLICY_SUFFIXES = ["insert", "update", "delete"] as const;

const STORAGE_WRITE_BLOCK_POLICY_SUFFIXES = ["insert", "update", "delete"] as const;

const USER_CALLABLE_MUTATION_RPCS = [
  "edit_my_story",
  "remove_my_story",
  "remove_my_video_story",
  "remove_my_prayer_video_response",
  "hide_prayer_video_response",
  "submit_prayer_video_response",
  "can_insert_inbox_message",
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

describe("account deletion write-freeze migration (Phase 4C.7B.1E.2B.0A)", () => {
  it("wraps changes in a transaction", () => {
    const migration = readMigration();
    expect(migration).toMatch(/^\s*BEGIN;/m);
    expect(migration).toMatch(/^\s*COMMIT;/m);
  });

  it("documents account_deletion_requests as the sole write-freeze source of truth", () => {
    const migration = readMigration();
    expect(migration).toContain(
      "account_deletion_requests.status = 'deletion_in_progress'"
    );
    expect(migration).not.toContain("deletion_write_frozen_at");
    expect(migration).not.toContain("profiles.deletion_write");
  });

  it("defines current_user_account_write_blocked with expected security contract", () => {
    const migration = readMigration();
    const helper = functionBody(migration, "current_user_account_write_blocked");

    expect(helper).toMatch(/RETURNS boolean/i);
    expect(helper).toMatch(/LANGUAGE sql/i);
    expect(helper).toMatch(/STABLE/i);
    expect(helper).toMatch(/SECURITY DEFINER/i);
    expect(helper).toMatch(/SET search_path = ''/i);
    expect(helper).toContain("public.account_deletion_requests");
    expect(helper).toContain("auth.uid()");
    expect(helper).toContain("deletion_in_progress");
    expect(helper).toMatch(/EXISTS\s*\(/i);
    expect(helper).toContain("request_row.user_id = auth.uid()");
    expect(helper).toMatch(
      /request_row\.user_id IS NULL[\s\S]*request_row\.target_user_id_snapshot = auth\.uid\(\)/
    );
    expect(helper).not.toMatch(
      /request_row\.user_id = auth\.uid\(\)\s*\n\s*OR\s*\n\s*request_row\.target_user_id_snapshot = auth\.uid\(\)/
    );
    expect(helper).toMatch(/auth\.uid\(\) IS NOT NULL/i);
    expect(helper).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i);
  });

  it("revokes public execute on the write-block helper", () => {
    const migration = readMigration();
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.current_user_account_write_blocked() FROM PUBLIC"
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.current_user_account_write_blocked() TO authenticated"
    );
  });

  it("adds partial indexes for deletion_in_progress lookup", () => {
    const migration = readMigration();
    expect(migration).toContain("account_deletion_requests_write_block_user_id_idx");
    expect(migration).toContain(
      "account_deletion_requests_write_block_target_snapshot_idx"
    );
    expect(migration).toMatch(
      /WHERE status = 'deletion_in_progress'::text[\s\S]*user_id/
    );
    expect(migration).toMatch(
      /WHERE status = 'deletion_in_progress'::text[\s\S]*target_user_id_snapshot/
    );
  });

  it("restricts ordinary-user deletion request submission to submitted status", () => {
    const migration = readMigration();
    expect(migration).toContain('"Users can create their own deletion request"');
    expect(migration).toMatch(
      /WITH CHECK\s*\([\s\S]*auth\.uid\(\) = user_id[\s\S]*status = 'submitted'::text/
    );
    expect(migration).toContain("enforce_account_deletion_request_submission");
    expect(migration).toContain("account_deletion_requests_submission_guard");
    expect(migration).toMatch(
      /must be created with status submitted/i
    );
  });

  it("forces target_user_id_snapshot to auth.uid() on ordinary-user submission", () => {
    const migration = readMigration();
    const trigger = functionBody(
      migration,
      "enforce_account_deletion_request_submission"
    );

    expect(trigger).toContain("NEW.target_user_id_snapshot := auth.uid()");
    expect(trigger).toMatch(/IF public\.current_user_is_admin\(\) = true THEN[\s\S]*RETURN NEW/i);
    expect(trigger).toContain(
      "target_username_snapshot is audit/display only"
    );
  });

  it("drops and recreates all 0A-owned write-freeze policies including legacy combined names", () => {
    const migration = readMigration();

    for (const table of WRITE_BLOCK_PUBLIC_TABLES) {
      expect(migration).toContain(
        `DROP POLICY IF EXISTS account_deletion_write_block ON public.${table};`
      );
      for (const suffix of WRITE_BLOCK_POLICY_SUFFIXES) {
        expect(migration).toContain(
          `DROP POLICY IF EXISTS account_deletion_write_block_${suffix} ON public.${table};`
        );
      }
    }

    expect(migration).toContain(
      "DROP POLICY IF EXISTS account_deletion_storage_write_block ON storage.objects;"
    );
    for (const suffix of STORAGE_WRITE_BLOCK_POLICY_SUFFIXES) {
      expect(migration).toContain(
        `DROP POLICY IF EXISTS account_deletion_storage_write_block_${suffix} ON storage.objects;`
      );
    }

    expect(migration).not.toContain(
      'DROP POLICY IF EXISTS "Admins can manage deletion requests"'
    );
  });

  it("rejects invalid comma-separated CREATE POLICY command syntax", () => {
    const migration = readMigration();
    expect(migration).not.toMatch(/FOR INSERT, UPDATE, DELETE/i);
  });

  it("adds RESTRICTIVE command-specific write-block policies on required public tables", () => {
    const migration = readMigration();

    for (const table of WRITE_BLOCK_PUBLIC_TABLES) {
      const insertPolicy = migration.match(
        new RegExp(
          `CREATE POLICY account_deletion_write_block_insert\\s+ON public\\.${table}[\\s\\S]*?WITH CHECK \\(NOT public\\.current_user_account_write_blocked\\(\\)\\);`,
          "i"
        )
      );
      expect(insertPolicy, `missing INSERT write-block policy for ${table}`).toBeTruthy();
      expect(insertPolicy![0]).toContain("AS RESTRICTIVE");
      expect(insertPolicy![0]).toMatch(/FOR INSERT/i);
      expect(insertPolicy![0]).not.toMatch(/FOR SELECT/i);
      expect(insertPolicy![0]).not.toMatch(/\bUSING\b/i);

      const updatePolicy = migration.match(
        new RegExp(
          `CREATE POLICY account_deletion_write_block_update\\s+ON public\\.${table}[\\s\\S]*?WITH CHECK \\(NOT public\\.current_user_account_write_blocked\\(\\)\\);`,
          "i"
        )
      );
      expect(updatePolicy, `missing UPDATE write-block policy for ${table}`).toBeTruthy();
      expect(updatePolicy![0]).toContain("AS RESTRICTIVE");
      expect(updatePolicy![0]).toMatch(/FOR UPDATE/i);
      expect(updatePolicy![0]).toMatch(/\bUSING\b/i);

      const deletePolicy = migration.match(
        new RegExp(
          `CREATE POLICY account_deletion_write_block_delete\\s+ON public\\.${table}[\\s\\S]*?USING \\(NOT public\\.current_user_account_write_blocked\\(\\)\\);`,
          "i"
        )
      );
      expect(deletePolicy, `missing DELETE write-block policy for ${table}`).toBeTruthy();
      expect(deletePolicy![0]).toContain("AS RESTRICTIVE");
      expect(deletePolicy![0]).not.toMatch(/WITH CHECK/i);
    }
  });

  it("blocks frozen users from authenticated storage mutations without touching reads", () => {
    const migration = readMigration();
    expect(migration).toContain("ON storage.objects");
    expect(migration).not.toMatch(/FOR INSERT, UPDATE, DELETE/i);

    for (const suffix of STORAGE_WRITE_BLOCK_POLICY_SUFFIXES) {
      expect(migration).toContain(`account_deletion_storage_write_block_${suffix}`);
    }

    expect(migration).toMatch(
      /account_deletion_storage_write_block_insert[\s\S]*FOR INSERT[\s\S]*WITH CHECK \(NOT public\.current_user_account_write_blocked\(\)\)/
    );
    expect(migration).toMatch(
      /account_deletion_storage_write_block_update[\s\S]*FOR UPDATE[\s\S]*USING \(NOT public\.current_user_account_write_blocked\(\)\)[\s\S]*WITH CHECK \(NOT public\.current_user_account_write_blocked\(\)\)/
    );
    expect(migration).toMatch(
      /account_deletion_storage_write_block_delete[\s\S]*FOR DELETE[\s\S]*USING \(NOT public\.current_user_account_write_blocked\(\)\)/
    );
    expect(migration).not.toMatch(
      /account_deletion_storage_write_block[\s\S]*FOR SELECT/i
    );
  });

  it("patches user-callable SECURITY DEFINER mutation RPCs to fail when write-blocked", () => {
    const migration = readMigration();

    for (const rpc of USER_CALLABLE_MUTATION_RPCS) {
      const body = functionBody(migration, rpc);
      expect(body, `${rpc} should consult write-block helper`).toContain(
        "current_user_account_write_blocked()"
      );
      expect(body).toMatch(/SET search_path = ''/i);
    }
  });

  it("guards submit_prayer_video_response even with row_security disabled", () => {
    const migration = readMigration();
    const body = functionBody(migration, "submit_prayer_video_response");

    expect(body).toMatch(/SET row_security TO 'off'/i);
    expect(body).toMatch(
      /current_user_account_write_blocked\(\)[\s\S]*Account deletion in progress/i
    );
    expect(body).toMatch(
      /IF public\.current_user_account_write_blocked\(\) THEN[\s\S]*RAISE EXCEPTION/i
    );
  });

  it("checks write block in can_insert_inbox_message after admin bypass", () => {
    const migration = readMigration();
    const body = functionBody(migration, "can_insert_inbox_message");
    const adminIndex = body.indexOf("current_user_is_admin()");
    const blockIndex = body.indexOf("current_user_account_write_blocked()");
    expect(adminIndex).toBeGreaterThan(-1);
    expect(blockIndex).toBeGreaterThan(adminIndex);
  });

  it("does not patch mark_my_prayer_answered because it is not in production baseline", () => {
    const migration = readMigration();
    expect(migration).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.mark_my_prayer_answered/i
    );
    expect(migration).toContain("mark_my_prayer_answered");
  });

  it("defines verify_account_deletion_schema_execution_ready as a live catalog probe", () => {
    const migration = readMigration();
    const probe = functionBody(
      migration,
      "verify_account_deletion_schema_execution_ready"
    );

    expect(probe).toMatch(/RETURNS jsonb/i);
    expect(probe).toMatch(/STABLE/i);
    expect(probe).toMatch(/SECURITY DEFINER/i);
    expect(probe).toMatch(/SET search_path = ''/i);
    expect(probe).toContain("information_schema.columns");
    expect(probe).toContain("pg_catalog.pg_constraint");
    expect(probe).toContain("confdeltype = 'n'");
    expect(probe).toContain("pg_catalog.pg_policies");
    expect(probe).toContain("'ready', all_ready");
    expect(probe).toContain("'prerequisites', prerequisites");
    expect(probe).not.toContain("schema_migrations");
    expect(probe).toContain("current_user_account_write_blocked_present");
    expect(probe).toContain("write_freeze_public_rls_present");
    expect(probe).toContain("write_freeze_storage_rls_present");
  });

  it("verifies helper security properties and command-specific RLS checks in the schema probe", () => {
    const migration = readMigration();
    const probe = functionBody(
      migration,
      "verify_account_deletion_schema_execution_ready"
    );

    expect(probe).toContain("prosecdef = true");
    expect(probe).toContain("provolatile = 's'");
    expect(probe).toContain("pg_get_function_identity_arguments");
    expect(probe).toContain("search_path=%");
    expect(probe).toContain("ILIKE '%current_user_account_write_blocked%'");
    expect(probe).toContain("missing_rls_expression_policies");
    expect(probe).not.toContain("pol.cmd <> 'r'");
    expect(probe).toContain("pol.cmd = 'INSERT'");
    expect(probe).toContain("pol.cmd = 'UPDATE'");
    expect(probe).toContain("pol.cmd = 'DELETE'");
    expect(probe).toContain("account_deletion_write_block_insert");
    expect(probe).toContain("account_deletion_write_block_update");
    expect(probe).toContain("account_deletion_write_block_delete");
    expect(probe).toContain("account_deletion_storage_write_block_insert");
    expect(probe).toContain("account_deletion_storage_write_block_update");
    expect(probe).toContain("account_deletion_storage_write_block_delete");
  });

  it("restricts schema probe EXECUTE to service_role only", () => {
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
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.verify_account_deletion_schema_execution_ready\(\) TO authenticated/i
    );
  });

  it("contains no destructive application data operations", () => {
    const sql = migrationSqlStatements(readMigration());
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDROP TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP COLUMN\b/i);
    expect(sql).not.toContain("auth.admin.deleteUser");
    expect(sql).not.toContain("auth.admin.signOut");
    expect(sql).not.toContain("storage.remove");
  });

  it("does not enable execution or wire destructive execute behavior", () => {
    const executeRoute = readFileSync(
      "app/api/admin/account-deletion/[requestId]/execute/route.ts",
      "utf8"
    );
    const executeHandler = readFileSync(
      "lib/server/accountDeletionExecuteHandler.ts",
      "utf8"
    );

    expect(isSchemaExecutionReady()).toBe(false);
    expect(process.env[ACCOUNT_DELETION_EXECUTION_ENV_FLAG]).toBeUndefined();
    expect(executeRoute).toContain("handleAccountDeletionExecuteRequest");
    expect(executeHandler).not.toContain("write_freeze");
    expect(executeHandler).not.toContain("current_user_account_write_blocked");
  });
});

describe("write-freeze migration adversarial contracts", () => {
  it("uses EXISTS semantics rather than assuming one active request row", () => {
    const helper = functionBody(
      readMigration(),
      "current_user_account_write_blocked"
    );
    expect(helper).toMatch(/EXISTS\s*\(/i);
    expect(helper).not.toMatch(/LIMIT 1/i);
  });

  it("does not freeze a third party via forged target_user_id_snapshot while user_id is populated", () => {
    const helper = functionBody(
      readMigration(),
      "current_user_account_write_blocked"
    );

    expect(helper).toMatch(
      /request_row\.user_id = auth\.uid\(\)[\s\S]*OR\s*\([\s\S]*request_row\.user_id IS NULL[\s\S]*request_row\.target_user_id_snapshot = auth\.uid\(\)/
    );
  });

  it("still recognizes deletion target after user_id becomes NULL via snapshot", () => {
    const helper = functionBody(
      readMigration(),
      "current_user_account_write_blocked"
    );

    expect(helper).toContain("request_row.user_id IS NULL");
    expect(helper).toContain("request_row.target_user_id_snapshot = auth.uid()");
  });

  it("prevents ordinary users from submitting forged target_user_id_snapshot values", () => {
    const trigger = functionBody(
      readMigration(),
      "enforce_account_deletion_request_submission"
    );

    expect(trigger).toContain("NEW.target_user_id_snapshot := auth.uid()");
    expect(trigger).toMatch(
      /NEW\.user_id IS DISTINCT FROM auth\.uid\(\)[\s\S]*42501/
    );
    expect(trigger).toMatch(
      /NEW\.status IS DISTINCT FROM 'submitted'::text[\s\S]*42501/
    );
  });

  it("preserves admin bypass in submission trigger for lifecycle operations", () => {
    const trigger = functionBody(
      readMigration(),
      "enforce_account_deletion_request_submission"
    );

    expect(trigger).toMatch(
      /IF public\.current_user_is_admin\(\) = true THEN[\s\S]*RETURN NEW/i
    );
    expect(trigger.indexOf("current_user_is_admin")).toBeLessThan(
      trigger.indexOf("NEW.target_user_id_snapshot := auth.uid()")
    );
  });

  it("does not grant execute on the helper to anon", () => {
    const migration = readMigration();
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.current_user_account_write_blocked\(\) TO anon/i
    );
  });

  it("preserves admin deletion-request management policy from lifecycle migration", () => {
    const migration = readMigration();
    expect(migration).not.toContain(
      'DROP POLICY IF EXISTS "Admins can manage deletion requests"'
    );
    expect(migration).not.toContain(
      'DROP POLICY IF EXISTS "Users can cancel their own deletion request"'
    );
  });

  it("blocks INSERT UPDATE DELETE for frozen users without adding SELECT restrictions", () => {
    const migration = readMigration();
    const insertPolicies = migration.match(
      /CREATE POLICY account_deletion_write_block_insert[\s\S]*?;/g
    );
    const updatePolicies = migration.match(
      /CREATE POLICY account_deletion_write_block_update[\s\S]*?;/g
    );
    const deletePolicies = migration.match(
      /CREATE POLICY account_deletion_write_block_delete[\s\S]*?;/g
    );

    expect(insertPolicies?.length).toBe(WRITE_BLOCK_PUBLIC_TABLES.length);
    expect(updatePolicies?.length).toBe(WRITE_BLOCK_PUBLIC_TABLES.length);
    expect(deletePolicies?.length).toBe(WRITE_BLOCK_PUBLIC_TABLES.length);

    for (const policy of insertPolicies ?? []) {
      expect(policy).toMatch(/FOR INSERT/i);
      expect(policy).not.toMatch(/FOR SELECT/i);
      expect(policy).not.toMatch(/FOR ALL/i);
    }

    for (const policy of updatePolicies ?? []) {
      expect(policy).toMatch(/FOR UPDATE/i);
      expect(policy).not.toMatch(/FOR SELECT/i);
    }

    for (const policy of deletePolicies ?? []) {
      expect(policy).toMatch(/FOR DELETE/i);
      expect(policy).not.toMatch(/FOR SELECT/i);
    }

    expect(migration).not.toMatch(
      /CREATE POLICY account_deletion_write_block[\s\S]*FOR SELECT/i
    );
    expect(migration).not.toMatch(
      /CREATE POLICY account_deletion_storage_write_block[\s\S]*FOR SELECT/i
    );
  });
});
