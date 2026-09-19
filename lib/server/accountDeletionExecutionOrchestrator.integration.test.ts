import { Client } from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV,
  applyAccountDeletionMigrations,
  getAccountDeletionIntegrationDbUrl,
  resetAccountDeletionIntegrationSchema,
} from "./accountDeletionIntegrationHarness";
import {
  createAccountDeletionExecutionOrchestratorDeps,
  runAccountDeletionExecutionOrchestrator,
} from "./accountDeletionExecutionOrchestrator";

const dbUrl = getAccountDeletionIntegrationDbUrl();
const describeIntegration = dbUrl ? describe : describe.skip;

const TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SURVIVOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REQUEST_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STORY_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const REPLY_AB = "11111111-1111-4111-8111-111111111111";
const REPLY_BA = "22222222-2222-4222-8222-222222222222";
const REPLY_AA = "33333333-3333-4333-8333-333333333333";
const PRAYER_VIDEO_ID = "44444444-4444-4444-8444-444444444444";
const PRAYER_WRITTEN_ID = "55555555-5555-4555-8555-555555555555";
const PRAYER_UPDATE_ID = "66666666-6666-4666-8666-666666666666";
const INBOX_SURVIVING_ID = "77777777-7777-4777-8777-777777777777";
const INBOX_RECIPIENT_ID = "88888888-8888-4888-8888-888888888888";

const TARGET_EMAIL = "target-e2e@example.test";
const OWNER_EMAIL = "owner-e2e@example.test";
const SURVIVOR_EMAIL = "survivor-e2e@example.test";

let authenticatedDeletionGrantsApplied = false;
let serviceRoleGrantsApplied = false;

function createPgServiceRoleClient(pg: Client): SupabaseClient {
  async function runServiceRpc<T>(
    sql: string,
    params: unknown[]
  ): Promise<{ data: T | null; error: null }> {
    await pg.query("BEGIN");
    try {
      await pg.query("SET LOCAL ROLE service_role");
      const result = await pg.query<{ payload: T }>(sql, params);
      await pg.query("COMMIT");
      return { data: result.rows[0]?.payload ?? null, error: null };
    } catch (error) {
      await pg.query("ROLLBACK");
      throw error;
    }
  }

  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      switch (fn) {
        case "verify_account_deletion_schema_execution_ready":
          return runServiceRpc(
            `SELECT public.verify_account_deletion_schema_execution_ready() AS payload`,
            []
          );
        case "acquire_account_deletion_execution_lock":
          return runServiceRpc(
            `SELECT public.acquire_account_deletion_execution_lock($1::uuid, $2::uuid) AS payload`,
            [args.p_request_id, args.p_initiated_by]
          );
        case "advance_account_deletion_attempt_to_sessions_pending":
          return runServiceRpc(
            `SELECT public.advance_account_deletion_attempt_to_sessions_pending($1::uuid, $2::uuid) AS payload`,
            [args.p_request_id, args.p_attempt_id]
          );
        case "advance_account_deletion_attempt_to_sessions_revoked":
          return runServiceRpc(
            `SELECT public.advance_account_deletion_attempt_to_sessions_revoked($1::uuid, $2::uuid) AS payload`,
            [args.p_request_id, args.p_attempt_id]
          );
        case "record_account_deletion_session_revocation_failure":
          return runServiceRpc(
            `SELECT public.record_account_deletion_session_revocation_failure($1::uuid, $2::uuid, $3::text, $4::text) AS payload`,
            [
              args.p_request_id,
              args.p_attempt_id,
              args.p_error_code,
              args.p_error_fingerprint,
            ]
          );
        case "advance_account_deletion_attempt_to_inventory":
          return runServiceRpc(
            `SELECT public.advance_account_deletion_attempt_to_inventory($1::uuid, $2::uuid) AS payload`,
            [args.p_request_id, args.p_attempt_id]
          );
        case "execute_account_deletion_nondestructive_database_stage":
          return runServiceRpc(
            `SELECT public.execute_account_deletion_nondestructive_database_stage($1::uuid, $2::uuid) AS payload`,
            [args.p_request_id, args.p_attempt_id]
          );
        default:
          throw new Error(`unsupported rpc in integration shim: ${fn}`);
      }
    },
    from(table: string) {
      return {
        select(cols: string) {
          return {
            eq(column: string, value: unknown) {
              return {
                maybeSingle: async () => {
                  const result = await pg.query(
                    `SELECT ${cols} FROM public.${table} WHERE ${column} = $1 LIMIT 1`,
                    [value]
                  );
                  return { data: result.rows[0] ?? null, error: null };
                },
              };
            },
          };
        },
      };
    },
    auth: {
      admin: {
        signOut: async () => ({ error: null }),
      },
    },
  } as unknown as SupabaseClient;
}

async function ensureHashtextextendedStub(client: Client) {
  await client.query(`
    CREATE OR REPLACE FUNCTION public.hashtextextended(text, bigint)
    RETURNS bigint
    LANGUAGE sql
    IMMUTABLE PARALLEL SAFE STRICT
    AS $$ SELECT pg_catalog.hashtextextended($1, $2) $$;
  `);
}

async function ensureServiceRoleExecutionGrants(client: Client) {
  if (serviceRoleGrantsApplied) {
    return;
  }
  await client.query(`
    GRANT USAGE ON SCHEMA public TO service_role;
    ALTER ROLE service_role BYPASSRLS;
  `);
  serviceRoleGrantsApplied = true;
}

async function ensureAuthenticatedDeletionRequestGrants(client: Client) {
  if (authenticatedDeletionGrantsApplied) {
    return;
  }
  await client.query(`
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.account_deletion_requests TO authenticated;
    GRANT SELECT, UPDATE ON public.profiles TO authenticated;
  `);
  authenticatedDeletionGrantsApplied = true;
}

async function bootstrapFirstOwnerProfile(client: Client) {
  await client.query("BEGIN");
  try {
    await client.query(
      `ALTER TABLE public.profiles DISABLE TRIGGER protect_profile_roles_trigger`
    );
    const update = await client.query(
      `
      UPDATE public.profiles
      SET is_owner = true,
          is_admin = true
      WHERE id = $1
      `,
      [OWNER]
    );
    expect(update.rowCount).toBe(1);
    await client.query(
      `ALTER TABLE public.profiles ENABLE TRIGGER protect_profile_roles_trigger`
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function submitDeletionRequestAsTarget(client: Client) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: TARGET }),
    ]);
    await client.query(
      `
      INSERT INTO public.account_deletion_requests (
        id,
        user_id,
        status,
        target_username_snapshot,
        email
      ) VALUES (
        $1,
        $2,
        'submitted',
        'target_user',
        $3
      )
      `,
      [REQUEST_ID, TARGET, TARGET_EMAIL]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  const request = await client.query<{ status: string }>(
    `SELECT status FROM public.account_deletion_requests WHERE id = $1`,
    [REQUEST_ID]
  );
  expect(request.rows[0]?.status).toBe("submitted");
}

async function approveDeletionRequestAsOwner(client: Client) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: OWNER }),
    ]);
    const update = await client.query(
      `
      UPDATE public.account_deletion_requests
      SET
        status = 'approved',
        approved_at = now(),
        approved_by = $2,
        reviewed_at = now(),
        reviewed_by = $2
      WHERE id = $1
        AND status = 'submitted'
      `,
      [REQUEST_ID, OWNER]
    );
    expect(update.rowCount).toBe(1);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  const request = await client.query<{ status: string }>(
    `SELECT status FROM public.account_deletion_requests WHERE id = $1`,
    [REQUEST_ID]
  );
  expect(request.rows[0]?.status).toBe("approved");
}

async function seedTargetContentBeforeAcquisition(client: Client) {
  await client.query(
    `
    INSERT INTO public.stories (
      id, user_id, name, email, location, story_text, video_url, status
    ) VALUES (
      $1, $2, 'Target Author', $3, 'City', 'Substantive story body', 'https://example.com/v.mp4', 'approved'
    )
    `,
    [STORY_ID, TARGET, TARGET_EMAIL]
  );

  await client.query(
    `
    INSERT INTO public.story_video_replies (
      id, story_id, user_id, recipient_user_id, message, deleted_by_sender, deleted_by_recipient
    ) VALUES
      ($1, $4, $2, $3, 'Original A to B message', false, false),
      ($5, $4, $3, $2, 'Original B to A message must stay', false, false),
      ($6, $4, $2, $2, 'Original A to A message', false, false)
    `,
    [REPLY_AB, TARGET, SURVIVOR, STORY_ID, REPLY_BA, REPLY_AA]
  );

  await client.query(
    `
    INSERT INTO public.prayer_video_responses (
      id, story_id, user_id, video_url, body, status
    ) VALUES (
      $1, $2, $3, 'https://example.com/response.mp4', 'Prayer video body', 'approved'
    )
    `,
    [PRAYER_VIDEO_ID, STORY_ID, TARGET]
  );

  await client.query(
    `
    INSERT INTO public.prayer_written_responses (
      id, story_id, author_user_id, body
    ) VALUES (
      $1, $2, $3, 'Written prayer body'
    )
    `,
    [PRAYER_WRITTEN_ID, STORY_ID, TARGET]
  );

  await client.query(
    `
    INSERT INTO public.prayer_updates (
      id, story_id, author_user_id, body
    ) VALUES (
      $1, $2, $3, 'Prayer update body'
    )
    `,
    [PRAYER_UPDATE_ID, STORY_ID, TARGET]
  );

  await client.query(
    `
    INSERT INTO public.inbox_messages (
      id, user_id, sender_user_id, title, body, video_url, image_url
    ) VALUES
      ($1, $3, $2, 'Someone sent you a private video prayer', 'Surviving inbox body', 'https://example.com/inbox.mp4', 'https://example.com/inbox.png'),
      ($4, $2, $2, 'Your copy', 'Recipient-owned body', null, null)
    `,
    [INBOX_SURVIVING_ID, TARGET, SURVIVOR, INBOX_RECIPIENT_ID]
  );
}

async function seedApprovedDeletionLifecycle(client: Client) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // no open transaction
  }

  await client.query(`
    TRUNCATE TABLE
      public.account_deletion_story_freeze_scope,
      public.account_deletion_database_execution_context,
      public.inbox_messages,
      public.prayer_updates,
      public.prayer_written_responses,
      public.prayer_video_responses,
      public.story_video_replies,
      public.stories,
      public.account_deletion_execution_attempts,
      public.account_deletion_requests,
      public.profiles
    RESTART IDENTITY CASCADE
  `);
  await client.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [
    [TARGET, SURVIVOR, OWNER],
  ]);

  await client.query(
    `
    INSERT INTO auth.users (id, email) VALUES
      ($1, $2),
      ($3, $4),
      ($5, $6)
    `,
    [TARGET, TARGET_EMAIL, SURVIVOR, SURVIVOR_EMAIL, OWNER, OWNER_EMAIL]
  );

  await client.query(
    `
    INSERT INTO public.profiles (id, email, username, display_name, is_owner, is_admin)
    VALUES
      ($1, $2, 'target_user', 'Target User', false, false),
      ($3, $4, 'survivor_user', 'Survivor User', false, false),
      ($5, $6, 'owner_user', 'Owner User', false, false)
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      username = EXCLUDED.username,
      display_name = EXCLUDED.display_name
    `,
    [TARGET, TARGET_EMAIL, SURVIVOR, SURVIVOR_EMAIL, OWNER, OWNER_EMAIL]
  );

  await ensureAuthenticatedDeletionRequestGrants(client);
  await bootstrapFirstOwnerProfile(client);
  await seedTargetContentBeforeAcquisition(client);
  await submitDeletionRequestAsTarget(client);
  await approveDeletionRequestAsOwner(client);
}

describeIntegration(
  `account deletion execution orchestrator integration (${ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV})`,
  () => {
    let client: Client;

    beforeAll(async () => {
      client = new Client({ connectionString: dbUrl! });
      await client.connect();
      await resetAccountDeletionIntegrationSchema(client);
      await applyAccountDeletionMigrations(client);
      await ensureHashtextextendedStub(client);
      await ensureServiceRoleExecutionGrants(client);
    }, 300_000);

    afterAll(async () => {
      await client?.end();
    });

    it("runs acquisition → session → inventory → 3B.1 and retries idempotently", async () => {
      await seedApprovedDeletionLifecycle(client);

      const serviceRoleClient = createPgServiceRoleClient(client);
      const deps = createAccountDeletionExecutionOrchestratorDeps(serviceRoleClient);

      const first = await runAccountDeletionExecutionOrchestrator({
        requestId: REQUEST_ID,
        initiatedBy: OWNER,
        deps,
      });

      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.code).toBe("database_completed");

      const attempt = await client.query<{ stage: string; status: string }>(
        `
        SELECT stage, status
        FROM public.account_deletion_execution_attempts
        WHERE deletion_request_id = $1
        `,
        [REQUEST_ID]
      );
      expect(attempt.rows).toHaveLength(1);
      expect(attempt.rows[0]?.stage).toBe("database_completed");
      expect(attempt.rows[0]?.status).toBe("active");

      const second = await runAccountDeletionExecutionOrchestrator({
        requestId: REQUEST_ID,
        initiatedBy: OWNER,
        deps,
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.code).toBe("already_completed");
      expect(second.attemptId).toBe(first.attemptId);
    }, 120_000);
  }
);
