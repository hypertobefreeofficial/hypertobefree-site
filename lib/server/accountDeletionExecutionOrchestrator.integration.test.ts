import { Client } from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV,
  applyAccountDeletionMigrations,
  getAccountDeletionIntegrationDbUrl,
  resetAccountDeletionIntegrationSchema,
} from "./accountDeletionIntegrationHarness";
import {
  createAccountDeletionExecutionOrchestratorDeps,
  runAccountDeletionExecutionOrchestrator,
  type AccountDeletionExecutionOrchestratorDeps,
} from "./accountDeletionExecutionOrchestrator";
import type { AccountDeletionStorageStageTickResult } from "./accountDeletionStorageStageRunner";
import {
  asServiceRole,
  createPgSupabaseShim,
  isDedicatedVanillaIntegrationDb,
  RUNNER_IT_OWNER,
  RUNNER_IT_TARGET,
} from "./accountDeletionStorageStageRunner.integrationHarness";
import {
  assertFreshMigrationProfileHelperPrivileges,
  driveLifecycleToStorageCompleted,
  ensureProfileIntegrationGrants,
} from "./accountDeletionProfileStage.integrationHarness";

const dbUrl = getAccountDeletionIntegrationDbUrl();
const describeIntegration =
  dbUrl && isDedicatedVanillaIntegrationDb(dbUrl) ? describe : describe.skip;

type RpcPayload = Record<string, unknown>;

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

function createPgServiceRoleClient(
  pg: Client,
  options: { signOut?: () => Promise<{ error: null }> } = {}
): SupabaseClient {
  const signOut =
    options.signOut ?? (async () => ({ error: null as const }));
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
        case "capture_account_deletion_storage_manifest":
          return runServiceRpc(
            `SELECT public.capture_account_deletion_storage_manifest($1::uuid, $2::uuid) AS payload`,
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
              const sql = `SELECT ${cols} FROM public.${table} WHERE ${column} = $1`;
              const builder = {
                maybeSingle: async () => {
                  const result = await pg.query(`${sql} LIMIT 1`, [value]);
                  return { data: result.rows[0] ?? null, error: null };
                },
                then(
                  onFulfilled: (value: { data: unknown[]; error: null }) => unknown,
                  onRejected?: (reason: unknown) => unknown
                ) {
                  return pg
                    .query(sql, [value])
                    .then((result) =>
                      onFulfilled({ data: result.rows, error: null })
                    )
                    .catch(onRejected);
                },
              };
              return builder;
            },
          };
        },
      };
    },
    auth: {
      admin: {
        signOut,
      },
    },
  } as unknown as SupabaseClient;
}

async function ensureServiceRoleExecutionGrants(client: Client) {
  await client.query(`
    GRANT USAGE ON SCHEMA public TO service_role;
    ALTER ROLE service_role BYPASSRLS;
  `);
}

async function ensureAuthenticatedDeletionRequestGrants(client: Client) {
  await client.query(`
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.account_deletion_requests TO authenticated;
    GRANT SELECT, UPDATE ON public.profiles TO authenticated;
  `);
}

function createPipelineOrchestratorDeps(
  serviceRoleClient: SupabaseClient
): AccountDeletionExecutionOrchestratorDeps {
  const base = createAccountDeletionExecutionOrchestratorDeps(serviceRoleClient);
  return {
    ...base,
    isGlobalExecutionEnabled: () => true,
    isStorageOrchestrationEnabled: () => false,
  };
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

async function seedTargetContentBeforeAcquisition(
  client: Client,
  storyStatus: "approved" | "pending" | "submitted" = "approved"
) {
  await client.query(
    `
    INSERT INTO public.stories (
      id, user_id, name, email, location, story_text, video_url, status
    ) VALUES (
      $1, $2, 'Target Author', $3, 'City', 'Substantive story body', 'story-videos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/v.mp4', $4
    )
    `,
    [STORY_ID, TARGET, TARGET_EMAIL, storyStatus]
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
      $1, $2, $3, 'story-videos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/response.mp4', 'Prayer video body', 'approved'
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
      ($1, $3, $2, 'Someone sent you a private video prayer', 'Surviving inbox body', 'journey-private-media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/inbox/surviving.mp4', 'journey-private-media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/inbox/surviving.png'),
      ($4, $2, $2, 'Your copy', 'Recipient-owned body', null, null)
    `,
    [INBOX_SURVIVING_ID, TARGET, SURVIVOR, INBOX_RECIPIENT_ID]
  );
}

async function seedApprovedDeletionLifecycle(
  client: Client,
  storyStatus: "approved" | "pending" | "submitted" = "approved"
) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // no open transaction
  }

  await client.query(`
    TRUNCATE TABLE
      public.account_deletion_storage_execution_audit,
      public.account_deletion_storage_execution_results,
      public.account_deletion_storage_manifest,
      public.account_deletion_storage_manifest_capture,
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
  await seedTargetContentBeforeAcquisition(client, storyStatus);
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
      await ensureServiceRoleExecutionGrants(client);
      await ensureAuthenticatedDeletionRequestGrants(client);
    }, 300_000);

    afterAll(async () => {
      await client?.end();
    });

    it("preflight blocks pending never-published story with zero execution side effects", async () => {
      await seedApprovedDeletionLifecycle(client, "pending");

      const signOut = vi.fn(async () => ({ error: null as const }));
      const serviceRoleClient = createPgServiceRoleClient(client, { signOut });
      const deps = createPipelineOrchestratorDeps(serviceRoleClient);

      const result = await runAccountDeletionExecutionOrchestrator({
        requestId: REQUEST_ID,
        initiatedBy: OWNER,
        deps,
      });

      expect(result).toEqual({
        ok: false,
        code: "execution_preflight_blocked",
      });
      expect(signOut).not.toHaveBeenCalled();

      const request = await client.query<{ status: string }>(
        `SELECT status FROM public.account_deletion_requests WHERE id = $1`,
        [REQUEST_ID]
      );
      expect(request.rows[0]?.status).toBe("approved");

      const inProgress = await client.query<{ count: string }>(
        `
        SELECT count(*)::text AS count
        FROM public.account_deletion_requests
        WHERE id = $1 AND status = 'deletion_in_progress'
        `,
        [REQUEST_ID]
      );
      expect(Number(inProgress.rows[0]?.count ?? 0)).toBe(0);

      const attempts = await client.query<{ count: string }>(
        `
        SELECT count(*)::text AS count
        FROM public.account_deletion_execution_attempts
        WHERE deletion_request_id = $1
        `,
        [REQUEST_ID]
      );
      expect(Number(attempts.rows[0]?.count ?? 0)).toBe(0);

      const story = await client.query<{ status: string }>(
        `SELECT status FROM public.stories WHERE id = $1`,
        [STORY_ID]
      );
      expect(story.rows[0]?.status).toBe("pending");
    }, 120_000);

    it("runs acquisition → session → inventory → 3B.1 and retries idempotently", async () => {
      await seedApprovedDeletionLifecycle(client);

      const serviceRoleClient = createPgServiceRoleClient(client);
      const deps = createPipelineOrchestratorDeps(serviceRoleClient);

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

function buildOrchestratorDeps(
  client: Client,
  options: {
    signOut?: () => Promise<{ error: null }>;
    globalEnabled?: boolean;
    storageEnabled?: boolean;
    runStorageStageTick?: AccountDeletionExecutionOrchestratorDeps["runStorageStageTick"];
    wrap?: {
      runSessionPhase?: AccountDeletionExecutionOrchestratorDeps["runSessionPhase"];
      captureStorageManifest?: AccountDeletionExecutionOrchestratorDeps["captureStorageManifest"];
      executeDatabaseStage?: AccountDeletionExecutionOrchestratorDeps["executeDatabaseStage"];
    };
  } = {}
) {
  const signOut =
    options.signOut ?? (async () => ({ error: null as const }));
  const serviceRoleClient = createPgServiceRoleClient(client, { signOut });
  const base = createAccountDeletionExecutionOrchestratorDeps(serviceRoleClient);
  return {
    signOut,
    deps: {
      ...base,
      isGlobalExecutionEnabled: () => options.globalEnabled ?? true,
      isStorageOrchestrationEnabled: () => options.storageEnabled ?? false,
      runStorageStageTick:
        options.runStorageStageTick ?? base.runStorageStageTick,
      runSessionPhase:
        options.wrap?.runSessionPhase ?? base.runSessionPhase,
      captureStorageManifest:
        options.wrap?.captureStorageManifest ?? base.captureStorageManifest,
      executeDatabaseStage:
        options.wrap?.executeDatabaseStage ?? base.executeDatabaseStage,
    } satisfies AccountDeletionExecutionOrchestratorDeps,
  };
}

async function runOrchestratorToDatabaseCompleted(client: Client) {
  const { deps } = buildOrchestratorDeps(client, {
    globalEnabled: true,
    storageEnabled: false,
  });
  const result = await runAccountDeletionExecutionOrchestrator({
    requestId: REQUEST_ID,
    initiatedBy: OWNER,
    deps,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected database_completed path");
  }
  return result;
}

async function getSingleAttemptId(client: Client): Promise<string> {
  const row = await client.query<{ id: string }>(
    `SELECT id FROM public.account_deletion_execution_attempts
     WHERE deletion_request_id = $1 LIMIT 1`,
    [REQUEST_ID]
  );
  const attemptId = row.rows[0]?.id;
  if (!attemptId) {
    throw new Error("attempt missing");
  }
  return attemptId;
}

async function driveAttemptToStorage(client: Client, attemptId: string) {
  const init = await asServiceRole<RpcPayload>(
    client,
    `SELECT public.initialize_account_deletion_storage_execution_results($1::uuid,$2::uuid) AS payload`,
    [REQUEST_ID, attemptId]
  );
  expect(init.ok).toBe(true);
  const advanced = await asServiceRole<RpcPayload>(
    client,
    `SELECT public.advance_account_deletion_attempt_to_storage($1::uuid,$2::uuid) AS payload`,
    [REQUEST_ID, attemptId]
  );
  expect(advanced.ok).toBe(true);
}

async function terminalizeStorageResultsForCompletion(
  client: Client,
  attemptId: string
) {
  await client.query(
    `
    UPDATE public.account_deletion_storage_execution_results
    SET
      execution_state = CASE
        WHEN disposition_snapshot = 'DELETE_PRIVATE'::text THEN 'deleted'::text
        ELSE 'preserved'::text
      END,
      completed_at = now(),
      updated_at = now()
    WHERE execution_attempt_id = $1
    `,
    [attemptId]
  );
}

async function driveAttemptToStorageCompleted(
  client: Client,
  attemptId: string,
  options?: { alreadyAtStorage?: boolean }
) {
  if (!options?.alreadyAtStorage) {
    await driveAttemptToStorage(client, attemptId);
  }
  await terminalizeStorageResultsForCompletion(client, attemptId);
  const complete = await asServiceRole<RpcPayload>(
    client,
    `SELECT public.advance_account_deletion_attempt_to_storage_completed($1::uuid,$2::uuid) AS payload`,
    [REQUEST_ID, attemptId]
  );
  expect(complete.ok).toBe(true);
}

describeIntegration(
  `3B.3F.2 storage orchestration wiring integration (${ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV} vanilla PG)`,
  () => {
    let client: Client;

    beforeAll(async () => {
      client = new Client({ connectionString: dbUrl! });
      await client.connect();
      await resetAccountDeletionIntegrationSchema(client);
      await applyAccountDeletionMigrations(client);
      await ensureServiceRoleExecutionGrants(client);
      await ensureAuthenticatedDeletionRequestGrants(client);
    }, 300_000);

    afterAll(async () => {
      await client?.end();
    });

    it("W-INT-GLOBAL-OFF: orchestrator execution_disabled with zero side effects", async () => {
      await seedApprovedDeletionLifecycle(client);
      const tick = vi.fn();
      const { deps } = buildOrchestratorDeps(client, {
        globalEnabled: false,
        runStorageStageTick: tick,
      });

      const result = await runAccountDeletionExecutionOrchestrator({
        requestId: REQUEST_ID,
        initiatedBy: OWNER,
        deps,
      });

      expect(result).toEqual({ ok: false, code: "execution_disabled" });
      expect(tick).not.toHaveBeenCalled();

      const request = await client.query<{ status: string }>(
        `SELECT status FROM public.account_deletion_requests WHERE id = $1`,
        [REQUEST_ID]
      );
      expect(request.rows[0]?.status).toBe("approved");

      const attempts = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.account_deletion_execution_attempts WHERE deletion_request_id = $1`,
        [REQUEST_ID]
      );
      expect(Number(attempts.rows[0]?.count ?? 0)).toBe(0);
    }, 120_000);

    it("W-INT-STORAGE-OFF-FRESH: real pipeline stops at database_completed", async () => {
      await seedApprovedDeletionLifecycle(client);
      const tick = vi.fn();
      const { deps } = buildOrchestratorDeps(client, {
        globalEnabled: true,
        storageEnabled: false,
        runStorageStageTick: tick,
      });

      const result = await runAccountDeletionExecutionOrchestrator({
        requestId: REQUEST_ID,
        initiatedBy: OWNER,
        deps,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.code).toBe("database_completed");
      expect(tick).not.toHaveBeenCalled();

      const attempt = await client.query<{ stage: string }>(
        `SELECT stage FROM public.account_deletion_execution_attempts WHERE deletion_request_id = $1`,
        [REQUEST_ID]
      );
      expect(attempt.rows[0]?.stage).toBe("database_completed");

      const results = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.account_deletion_storage_execution_results WHERE deletion_request_id = $1`,
        [REQUEST_ID]
      );
      expect(Number(results.rows[0]?.count ?? 0)).toBe(0);

      const request = await client.query<{ status: string }>(
        `SELECT status FROM public.account_deletion_requests WHERE id = $1`,
        [REQUEST_ID]
      );
      expect(request.rows[0]?.status).toBe("deletion_in_progress");
    }, 120_000);

    it("W-INT-STORAGE-OFF-DB-RESUME: database_completed resume without Storage tick", async () => {
      await seedApprovedDeletionLifecycle(client);
      await runOrchestratorToDatabaseCompleted(client);
      const attemptId = await getSingleAttemptId(client);

      const tick = vi.fn();
      const signOut = vi.fn(async () => ({ error: null as const }));
      const base = buildOrchestratorDeps(client, {
        globalEnabled: true,
        storageEnabled: false,
        signOut,
        runStorageStageTick: tick,
      });
      const captureSpy = vi.fn(base.deps.captureStorageManifest);
      const dbSpy = vi.fn(base.deps.executeDatabaseStage);
      const deps = {
        ...base.deps,
        captureStorageManifest: captureSpy,
        executeDatabaseStage: dbSpy,
      };

      const second = await runAccountDeletionExecutionOrchestrator({
        requestId: REQUEST_ID,
        initiatedBy: OWNER,
        deps,
      });

      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(["database_completed", "already_completed"]).toContain(second.code);
      expect(tick).not.toHaveBeenCalled();
      expect(signOut).not.toHaveBeenCalled();
      expect(captureSpy).not.toHaveBeenCalled();
      expect(dbSpy).not.toHaveBeenCalled();

      const stage = await client.query<{ stage: string }>(
        `SELECT stage FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [attemptId]
      );
      expect(stage.rows[0]?.stage).toBe("database_completed");
    }, 120_000);

    it("W-INT-STORAGE-OFF-STORAGE-RESUME: storage stage returns storage_execution_disabled", async () => {
      await seedApprovedDeletionLifecycle(client);
      await runOrchestratorToDatabaseCompleted(client);
      const attemptId = await getSingleAttemptId(client);
      await driveAttemptToStorage(client, attemptId);

      const tick = vi.fn();
      const signOut = vi.fn(async () => ({ error: null as const }));
      const base = buildOrchestratorDeps(client, {
        globalEnabled: true,
        storageEnabled: false,
        signOut,
        runStorageStageTick: tick,
      });
      const captureSpy = vi.fn(base.deps.captureStorageManifest);
      const dbSpy = vi.fn(base.deps.executeDatabaseStage);

      const result = await runAccountDeletionExecutionOrchestrator({
        requestId: REQUEST_ID,
        initiatedBy: OWNER,
        deps: {
          ...base.deps,
          captureStorageManifest: captureSpy,
          executeDatabaseStage: dbSpy,
        },
      });

      expect(result).toEqual({ ok: false, code: "storage_execution_disabled" });
      expect(tick).not.toHaveBeenCalled();
      expect(signOut).not.toHaveBeenCalled();
      expect(captureSpy).not.toHaveBeenCalled();
      expect(dbSpy).not.toHaveBeenCalled();

      const stage = await client.query<{ stage: string }>(
        `SELECT stage FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [attemptId]
      );
      expect(stage.rows[0]?.stage).toBe("storage");
    }, 120_000);

    it("W-INT-STORAGE-COMPLETED-RESUME: idempotent storage_completed without tick", async () => {
      await seedApprovedDeletionLifecycle(client);
      await runOrchestratorToDatabaseCompleted(client);
      const attemptId = await getSingleAttemptId(client);
      await driveAttemptToStorageCompleted(client, attemptId);

      for (const storageEnabled of [false, true]) {
        const tick = vi.fn();
        const signOut = vi.fn(async () => ({ error: null as const }));
        const base = buildOrchestratorDeps(client, {
          globalEnabled: true,
          storageEnabled,
          signOut,
          runStorageStageTick: tick,
        });
        const captureSpy = vi.fn(base.deps.captureStorageManifest);
        const dbSpy = vi.fn(base.deps.executeDatabaseStage);

        const result = await runAccountDeletionExecutionOrchestrator({
          requestId: REQUEST_ID,
          initiatedBy: OWNER,
          deps: {
            ...base.deps,
            captureStorageManifest: captureSpy,
            executeDatabaseStage: dbSpy,
          },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.code).toBe("storage_completed");
        expect(tick).not.toHaveBeenCalled();
        expect(signOut).not.toHaveBeenCalled();
        expect(captureSpy).not.toHaveBeenCalled();
        expect(dbSpy).not.toHaveBeenCalled();
      }

      await seedApprovedDeletionLifecycle(client);
      await runOrchestratorToDatabaseCompleted(client);
      const completedAttemptId = await getSingleAttemptId(client);
      await driveAttemptToStorageCompleted(client, completedAttemptId);
      const tick = vi.fn();
      const globalOff = buildOrchestratorDeps(client, {
        globalEnabled: false,
        runStorageStageTick: tick,
      });
      expect(
        await runAccountDeletionExecutionOrchestrator({
          requestId: REQUEST_ID,
          initiatedBy: OWNER,
          deps: globalOff.deps,
        })
      ).toEqual({ ok: false, code: "execution_disabled" });
      expect(tick).not.toHaveBeenCalled();
    }, 120_000);

    it("W-INT-STORAGE-ON-DB-RESUME: one injected tick from database_completed", async () => {
      await seedApprovedDeletionLifecycle(client);
      await runOrchestratorToDatabaseCompleted(client);

      const tick = vi.fn(async (): Promise<AccountDeletionStorageStageTickResult> => ({
        ok: true,
        code: "in_progress",
      }));
      const { deps } = buildOrchestratorDeps(client, {
        globalEnabled: true,
        storageEnabled: true,
        runStorageStageTick: tick,
      });

      const result = await runAccountDeletionExecutionOrchestrator({
        requestId: REQUEST_ID,
        initiatedBy: OWNER,
        deps,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.code).toBe("storage_in_progress");
      expect(tick).toHaveBeenCalledOnce();
      expect(tick).toHaveBeenCalledWith({
        requestId: REQUEST_ID,
        attemptId: expect.any(String),
      });
      const callArg = tick.mock.calls[0]?.[0] as {
        requestId: string;
        attemptId: string;
      };
      expect(Object.keys(callArg).sort()).toEqual(["attemptId", "requestId"]);
    }, 120_000);

    it("W-INT-STORAGE-ON-STORAGE-RESUME: one tick at storage without pre-Storage replay", async () => {
      await seedApprovedDeletionLifecycle(client);
      await runOrchestratorToDatabaseCompleted(client);
      const attemptId = await getSingleAttemptId(client);
      await driveAttemptToStorage(client, attemptId);

      const tick = vi.fn(async (): Promise<AccountDeletionStorageStageTickResult> => ({
        ok: true,
        code: "storage_completed",
        stage: "storage_completed",
      }));
      const signOut = vi.fn(async () => ({ error: null as const }));
      const base = buildOrchestratorDeps(client, {
        globalEnabled: true,
        storageEnabled: true,
        signOut,
        runStorageStageTick: tick,
      });
      const captureSpy = vi.fn(base.deps.captureStorageManifest);
      const dbSpy = vi.fn(base.deps.executeDatabaseStage);

      const result = await runAccountDeletionExecutionOrchestrator({
        requestId: REQUEST_ID,
        initiatedBy: OWNER,
        deps: {
          ...base.deps,
          captureStorageManifest: captureSpy,
          executeDatabaseStage: dbSpy,
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.code).toBe("storage_completed");
      expect(tick).toHaveBeenCalledOnce();
      expect(signOut).not.toHaveBeenCalled();
      expect(captureSpy).not.toHaveBeenCalled();
      expect(dbSpy).not.toHaveBeenCalled();
    }, 120_000);

    it("W-INT-BLOCKED: maps runner blocked to storage_blocked", async () => {
      await seedApprovedDeletionLifecycle(client);
      await runOrchestratorToDatabaseCompleted(client);

      const tick = vi.fn(async (): Promise<AccountDeletionStorageStageTickResult> => ({
        ok: false,
        code: "blocked",
      }));
      const { deps } = buildOrchestratorDeps(client, {
        globalEnabled: true,
        storageEnabled: true,
        runStorageStageTick: tick,
      });

      const result = await runAccountDeletionExecutionOrchestrator({
        requestId: REQUEST_ID,
        initiatedBy: OWNER,
        deps,
      });

      expect(result).toEqual({ ok: false, code: "storage_blocked" });
      expect(tick).toHaveBeenCalledOnce();
    }, 120_000);

    it("W-INT-PRECONDITION: maps precondition_failed to storage_precondition_failed", async () => {
      await seedApprovedDeletionLifecycle(client);
      await runOrchestratorToDatabaseCompleted(client);

      const tick = vi.fn(async (): Promise<AccountDeletionStorageStageTickResult> => ({
        ok: false,
        code: "precondition_failed",
      }));
      const { deps } = buildOrchestratorDeps(client, {
        globalEnabled: true,
        storageEnabled: true,
        runStorageStageTick: tick,
      });

      const result = await runAccountDeletionExecutionOrchestrator({
        requestId: REQUEST_ID,
        initiatedBy: OWNER,
        deps,
      });

      expect(result).toEqual({ ok: false, code: "storage_precondition_failed" });
      expect(tick).toHaveBeenCalledOnce();
    }, 120_000);

    it("W-INT-ONE-TICK: orchestrator never invokes Storage tick twice in one run", async () => {
      await seedApprovedDeletionLifecycle(client);
      await runOrchestratorToDatabaseCompleted(client);

      let calls = 0;
      const tick = vi.fn(async (): Promise<AccountDeletionStorageStageTickResult> => {
        calls += 1;
        return { ok: true, code: "in_progress" };
      });
      const { deps } = buildOrchestratorDeps(client, {
        globalEnabled: true,
        storageEnabled: true,
        runStorageStageTick: tick,
      });

      await runAccountDeletionExecutionOrchestrator({
        requestId: REQUEST_ID,
        initiatedBy: OWNER,
        deps,
      });

      expect(calls).toBe(1);
      expect(tick).toHaveBeenCalledOnce();
    }, 120_000);

    it("W-INT-RESUME-NO-REPLAY: storage and storage_completed skip capture and DB", async () => {
      await seedApprovedDeletionLifecycle(client);
      await runOrchestratorToDatabaseCompleted(client);
      const attemptId = await getSingleAttemptId(client);
      await driveAttemptToStorage(client, attemptId);

      const tickAtStorage = vi.fn(async (): Promise<AccountDeletionStorageStageTickResult> => ({
        ok: true,
        code: "in_progress",
      }));
      const signOutStorage = vi.fn(async () => ({ error: null as const }));
      const baseStorage = buildOrchestratorDeps(client, {
        globalEnabled: true,
        storageEnabled: true,
        signOut: signOutStorage,
        runStorageStageTick: tickAtStorage,
      });
      const captureAtStorage = vi.fn(baseStorage.deps.captureStorageManifest);
      const dbAtStorage = vi.fn(baseStorage.deps.executeDatabaseStage);

      await runAccountDeletionExecutionOrchestrator({
        requestId: REQUEST_ID,
        initiatedBy: OWNER,
        deps: {
          ...baseStorage.deps,
          captureStorageManifest: captureAtStorage,
          executeDatabaseStage: dbAtStorage,
        },
      });

      expect(signOutStorage).not.toHaveBeenCalled();
      expect(captureAtStorage).not.toHaveBeenCalled();
      expect(dbAtStorage).not.toHaveBeenCalled();

      await driveAttemptToStorageCompleted(client, attemptId, {
        alreadyAtStorage: true,
      });

      const tickCompleted = vi.fn();
      const signOutCompleted = vi.fn(async () => ({ error: null as const }));
      const baseCompleted = buildOrchestratorDeps(client, {
        globalEnabled: true,
        storageEnabled: true,
        signOut: signOutCompleted,
        runStorageStageTick: tickCompleted,
      });
      const captureCompleted = vi.fn(baseCompleted.deps.captureStorageManifest);
      const dbCompleted = vi.fn(baseCompleted.deps.executeDatabaseStage);

      await runAccountDeletionExecutionOrchestrator({
        requestId: REQUEST_ID,
        initiatedBy: OWNER,
        deps: {
          ...baseCompleted.deps,
          captureStorageManifest: captureCompleted,
          executeDatabaseStage: dbCompleted,
        },
      });

      expect(signOutCompleted).not.toHaveBeenCalled();
      expect(captureCompleted).not.toHaveBeenCalled();
      expect(dbCompleted).not.toHaveBeenCalled();
      expect(tickCompleted).not.toHaveBeenCalled();
    }, 120_000);

    it("W-INT-CONCURRENT-EXECUTION-CONTRACT: parallel orchestrator calls keep one active attempt", async () => {
      await seedApprovedDeletionLifecycle(client);
      const { deps } = buildOrchestratorDeps(client, {
        globalEnabled: true,
        storageEnabled: false,
      });

      const [first, second] = await Promise.all([
        runAccountDeletionExecutionOrchestrator({
          requestId: REQUEST_ID,
          initiatedBy: OWNER,
          deps,
        }),
        runAccountDeletionExecutionOrchestrator({
          requestId: REQUEST_ID,
          initiatedBy: OWNER,
          deps,
        }),
      ]);

      expect(first.ok || second.ok).toBe(true);
      const attempts = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.account_deletion_execution_attempts
         WHERE deletion_request_id = $1 AND status = 'active'`,
        [REQUEST_ID]
      );
      expect(Number(attempts.rows[0]?.count ?? 0)).toBe(1);
    }, 120_000);

    it("W-INT-NO-SECOND-SURFACE: orchestrator integration does not add routes", async () => {
      const { readFileSync } = await import("node:fs");
      const route = readFileSync(
        "app/api/admin/account-deletion/[requestId]/execute/route.ts",
        "utf8"
      );
      expect(route).not.toContain("accountDeletionStorageStageRunner");
      expect(route).toContain("handleAccountDeletionExecuteRequest");
    });
  }
);

describeIntegration(
  `3B.4C.3 profile orchestration wiring integration (${ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV} vanilla PG)`,
  () => {
    let client: Client;

    beforeAll(async () => {
      client = new Client({ connectionString: dbUrl! });
      await client.connect();
      await resetAccountDeletionIntegrationSchema(client);
      await applyAccountDeletionMigrations(client);
      await ensureProfileIntegrationGrants(client);
      await assertFreshMigrationProfileHelperPrivileges(client);
    }, 300_000);

    afterAll(async () => {
      await client?.end();
    });

    it("W-INT-PROFILE-COMPLETE: storage_completed → prepare → profile → finalize → profile_completed (zero avatar)", async () => {
      const fixture = await driveLifecycleToStorageCompleted(client, {
        neverHadAvatar: true,
        deletePrivateCount: 0,
      });

      const beforeAuth = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM auth.users WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );

      const shim = createPgSupabaseShim(client);
      const base = createAccountDeletionExecutionOrchestratorDeps(shim);
      const deps: AccountDeletionExecutionOrchestratorDeps = {
        ...base,
        isGlobalExecutionEnabled: () => true,
        isStorageOrchestrationEnabled: () => false,
        isProfileOrchestrationEnabled: () => true,
      };

      const result = await runAccountDeletionExecutionOrchestrator({
        requestId: fixture.requestId,
        initiatedBy: RUNNER_IT_OWNER,
        deps,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.code).toBe("profile_completed");
      expect(result.attemptId).toBe(fixture.attemptId);
      expect(result.targetUserId).toBe(RUNNER_IT_TARGET);

      const attempt = await client.query<{ stage: string }>(
        `SELECT stage FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [fixture.attemptId]
      );
      expect(attempt.rows[0]?.stage).toBe("profile_completed");

      const request = await client.query<{ status: string }>(
        `SELECT status FROM public.account_deletion_requests WHERE id = $1`,
        [fixture.requestId]
      );
      expect(request.rows[0]?.status).toBe("deletion_in_progress");

      const profile = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.profiles WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      expect(Number(profile.rows[0]?.count ?? 0)).toBe(0);

      const audit = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM public.account_deletion_storage_execution_audit
         WHERE deletion_request_id = $1
           AND execution_attempt_id = $2
           AND event_type = 'profile_shell_deleted'`,
        [fixture.requestId, fixture.attemptId]
      );
      expect(Number(audit.rows[0]?.count)).toBe(1);

      const afterAuth = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM auth.users WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      expect(afterAuth.rows[0]?.count).toBe(beforeAuth.rows[0]?.count);

      const second = await runAccountDeletionExecutionOrchestrator({
        requestId: fixture.requestId,
        initiatedBy: RUNNER_IT_OWNER,
        deps,
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.code).toBe("profile_completed");

      const auditRerun = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM public.account_deletion_storage_execution_audit
         WHERE deletion_request_id = $1
           AND execution_attempt_id = $2
           AND event_type = 'profile_shell_deleted'`,
        [fixture.requestId, fixture.attemptId]
      );
      expect(Number(auditRerun.rows[0]?.count)).toBe(1);
    }, 180_000);
  }
);
