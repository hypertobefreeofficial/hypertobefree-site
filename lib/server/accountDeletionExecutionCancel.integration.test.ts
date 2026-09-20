import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV,
  applyAccountDeletionMigrations,
  getAccountDeletionIntegrationDbUrl,
  resetAccountDeletionIntegrationSchema,
} from "./accountDeletionIntegrationHarness";

const dbUrl = getAccountDeletionIntegrationDbUrl();
const describeIntegration = dbUrl ? describe : describe.skip;

const TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REQUEST_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OTHER_REQUEST = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const STORY_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const MISMATCH_TARGET = "99999999-9999-4999-8999-999999999999";

type CancelPayload = {
  ok?: boolean;
  code?: string;
  last_stage?: string;
  reauthentication_may_be_required?: boolean;
  attempt_id?: string;
};

let authenticatedDeletionGrantsApplied = false;
let serviceRoleGrantsApplied = false;

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
    GRANT USAGE ON SCHEMA public TO anon;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.account_deletion_requests TO authenticated;
    GRANT SELECT, UPDATE ON public.profiles TO authenticated;
  `);
  authenticatedDeletionGrantsApplied = true;
}

async function cleanupScenario(client: Client) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // no open transaction
  }
  await client.query(`
    TRUNCATE TABLE
      public.account_deletion_storage_manifest,
      public.account_deletion_storage_manifest_capture,
      public.account_deletion_story_freeze_scope,
      public.account_deletion_database_execution_context,
      public.stories,
      public.account_deletion_execution_attempts,
      public.account_deletion_requests,
      public.profiles
    RESTART IDENTITY CASCADE
  `);
  await client.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [
    [TARGET, OWNER, OTHER, MISMATCH_TARGET],
  ]);
}

async function bootstrapFirstOwnerProfile(client: Client) {
  await client.query("BEGIN");
  try {
    await client.query(
      `ALTER TABLE public.profiles DISABLE TRIGGER protect_profile_roles_trigger`
    );
    const update = await client.query(
      `UPDATE public.profiles SET is_owner = true, is_admin = true WHERE id = $1`,
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

async function submitRequest(
  client: Client,
  requestId: string,
  userId: string,
  email: string
) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId }),
    ]);
    await client.query(
      `
      INSERT INTO public.account_deletion_requests (
        id, user_id, status, target_username_snapshot, email
      ) VALUES ($1, $2, 'submitted', 'user', $3)
      `,
      [requestId, userId, email]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function approveRequest(client: Client, requestId: string) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: OWNER }),
    ]);
    const update = await client.query(
      `
      UPDATE public.account_deletion_requests
      SET status = 'approved', approved_at = now(), approved_by = $2,
          reviewed_at = now(), reviewed_by = $2
      WHERE id = $1 AND status = 'submitted'
      `,
      [requestId, OWNER]
    );
    expect(update.rowCount).toBe(1);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function acquire(client: Client, requestId: string): Promise<string> {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE service_role");
    const acquired = await client.query<{ payload: CancelPayload }>(
      `SELECT public.acquire_account_deletion_execution_lock($1::uuid, $2::uuid) AS payload`,
      [requestId, OWNER]
    );
    await client.query("COMMIT");
    const payload = acquired.rows[0]?.payload;
    expect(payload?.ok).toBe(true);
    expect(typeof payload?.attempt_id).toBe("string");
    return payload!.attempt_id!;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function seedUsers(client: Client) {
  await client.query(
    `
    INSERT INTO auth.users (id, email) VALUES
      ($1, 'target@test.local'),
      ($2, 'owner@test.local'),
      ($3, 'other@test.local')
    ON CONFLICT (id) DO NOTHING
    `,
    [TARGET, OWNER, OTHER]
  );
  await client.query(
    `
    INSERT INTO public.profiles (id, email, username, display_name, is_owner, is_admin)
    VALUES
      ($1, 'target@test.local', 'target_user', 'Target User', false, false),
      ($2, 'owner@test.local', 'owner_user', 'Owner User', false, false),
      ($3, 'other@test.local', 'other_user', 'Other User', false, false)
    ON CONFLICT (id) DO NOTHING
    `,
    [TARGET, OWNER, OTHER]
  );
}

async function insertApprovedStory(client: Client) {
  await client.query(
    `
    INSERT INTO public.stories (
      id, user_id, name, email, location, story_text, video_url, status
    ) VALUES (
      $1, $2, 'Target Author', 'target@test.local', 'City', 'Body', 'story-videos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/v.mp4', 'approved'
    )
    `,
    [STORY_ID, TARGET]
  );
}

async function seedAcquired(
  client: Client,
  stage: "lock_acquired" | "sessions_pending" | "sessions_revoked" | "inventory",
  options: { storyBeforeAcquire?: boolean } = {}
): Promise<string> {
  await seedUsers(client);
  await bootstrapFirstOwnerProfile(client);
  await ensureAuthenticatedDeletionRequestGrants(client);
  await submitRequest(client, REQUEST_ID, TARGET, "target@test.local");
  await approveRequest(client, REQUEST_ID);
  if (options.storyBeforeAcquire) {
    await insertApprovedStory(client);
  }
  const attemptId = await acquire(client, REQUEST_ID);

  const steps =
    stage === "lock_acquired"
      ? []
      : stage === "sessions_pending"
        ? ["advance_account_deletion_attempt_to_sessions_pending"]
        : stage === "sessions_revoked"
          ? [
              "advance_account_deletion_attempt_to_sessions_pending",
              "advance_account_deletion_attempt_to_sessions_revoked",
            ]
          : [
              "advance_account_deletion_attempt_to_sessions_pending",
              "advance_account_deletion_attempt_to_sessions_revoked",
              "advance_account_deletion_attempt_to_inventory",
            ];

  for (const rpcName of steps) {
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL ROLE service_role");
      const result = await client.query<{ payload: CancelPayload }>(
        `SELECT public.${rpcName}($1::uuid, $2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );
      expect(result.rows[0]?.payload?.ok).toBe(true);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  return attemptId;
}

async function cancel(
  client: Client,
  requestId: string,
  attemptId: string,
  initiatedBy: string = OWNER
): Promise<CancelPayload> {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE service_role");
    const result = await client.query<{ payload: CancelPayload }>(
      `SELECT public.cancel_account_deletion_execution($1::uuid, $2::uuid, $3::uuid) AS payload`,
      [requestId, attemptId, initiatedBy]
    );
    await client.query("COMMIT");
    return result.rows[0]?.payload ?? {};
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function requestState(client: Client) {
  const result = await client.query<{
    status: string;
    execution_started_at: string | null;
    approved_at: string | null;
  }>(
    `SELECT status, execution_started_at, approved_at FROM public.account_deletion_requests WHERE id = $1`,
    [REQUEST_ID]
  );
  return result.rows[0];
}

async function attemptState(client: Client, attemptId: string) {
  const result = await client.query<{
    status: string;
    stage: string;
    last_error_code: string | null;
    completed_at: string | null;
    updated_at: string;
    retry_count: number;
  }>(
    `
    SELECT status, stage, last_error_code, completed_at, updated_at, retry_count
    FROM public.account_deletion_execution_attempts
    WHERE id = $1
    `,
    [attemptId]
  );
  return result.rows[0];
}

describeIntegration(
  `account deletion execution cancel integration (${ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV})`,
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
      await client.end();
    });

    it("RC-A: cancel at lock_acquired restores approved without scope or active attempt", async () => {
      await cleanupScenario(client);
      const attemptId = await seedAcquired(client, "lock_acquired");
      const approvedBefore = (await requestState(client))?.approved_at;
      const payload = await cancel(client, REQUEST_ID, attemptId);
      expect(payload).toMatchObject({
        ok: true,
        code: "cancelled",
        last_stage: "lock_acquired",
        reauthentication_may_be_required: false,
      });
      const request = await requestState(client);
      expect(request?.status).toBe("approved");
      expect(request?.execution_started_at).toBeNull();
      expect(String(request?.approved_at)).toBe(String(approvedBefore));
      const attempt = await attemptState(client, attemptId);
      expect(attempt).toMatchObject({
        status: "failed",
        stage: "lock_acquired",
        last_error_code: "execution_cancelled",
      });
      expect(attempt?.completed_at).toBeTruthy();
      const active = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.account_deletion_execution_attempts WHERE deletion_request_id = $1 AND status = 'active'`,
        [REQUEST_ID]
      );
      expect(Number(active.rows[0]?.count)).toBe(0);
      const scope = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.account_deletion_story_freeze_scope WHERE deletion_request_id = $1`,
        [REQUEST_ID]
      );
      expect(Number(scope.rows[0]?.count)).toBe(0);
    });

    it("RC-B: sessions_pending cancel keeps stage and flags reauthentication", async () => {
      await cleanupScenario(client);
      const attemptId = await seedAcquired(client, "sessions_pending");
      const payload = await cancel(client, REQUEST_ID, attemptId);
      expect(payload).toMatchObject({
        ok: true,
        code: "cancelled",
        last_stage: "sessions_pending",
        reauthentication_may_be_required: true,
      });
      expect((await requestState(client))?.status).toBe("approved");
      expect(await attemptState(client, attemptId)).toMatchObject({
        status: "failed",
        stage: "sessions_pending",
      });
    });

    it("RC-C: sessions_revoked cancel keeps stage and flags reauthentication", async () => {
      await cleanupScenario(client);
      const attemptId = await seedAcquired(client, "sessions_revoked");
      const payload = await cancel(client, REQUEST_ID, attemptId);
      expect(payload).toMatchObject({
        ok: true,
        last_stage: "sessions_revoked",
        reauthentication_may_be_required: true,
      });
      expect(await attemptState(client, attemptId)).toMatchObject({
        status: "failed",
        stage: "sessions_revoked",
      });
    });

    it("RC-D: inventory cancel before 3B.1 leaves scope empty", async () => {
      await cleanupScenario(client);
      const attemptId = await seedAcquired(client, "inventory");
      const payload = await cancel(client, REQUEST_ID, attemptId);
      expect(payload).toMatchObject({
        ok: true,
        last_stage: "inventory",
        reauthentication_may_be_required: true,
      });
      const scope = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.account_deletion_story_freeze_scope WHERE deletion_request_id = $1`,
        [REQUEST_ID]
      );
      expect(Number(scope.rows[0]?.count)).toBe(0);
      expect((await requestState(client))?.status).toBe("approved");
    });

    it("RC-E: database_completed cancel is irreversible and changes nothing", async () => {
      await cleanupScenario(client);
      const attemptId = await seedAcquired(client, "inventory", {
        storyBeforeAcquire: true,
      });
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE service_role");
      const capture = await client.query<{ payload: CancelPayload }>(
        `SELECT public.capture_account_deletion_storage_manifest($1::uuid, $2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );
      expect(capture.rows[0]?.payload?.ok).toBe(true);
      const stage = await client.query<{ payload: CancelPayload }>(
        `SELECT public.execute_account_deletion_nondestructive_database_stage($1::uuid, $2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );
      await client.query("COMMIT");
      expect(stage.rows[0]?.payload?.ok).toBe(true);

      const beforeRequest = await requestState(client);
      const beforeAttempt = await attemptState(client, attemptId);
      const payload = await cancel(client, REQUEST_ID, attemptId);
      expect(payload).toMatchObject({ ok: false, code: "irreversible_stage" });
      expect(await requestState(client)).toMatchObject({
        status: beforeRequest?.status,
        execution_started_at: beforeRequest?.execution_started_at,
      });
      expect(await attemptState(client, attemptId)).toMatchObject({
        status: beforeAttempt?.status,
        stage: "database_completed",
      });
      const story = await client.query<{ user_id: string | null }>(
        `SELECT user_id FROM public.stories WHERE id = $1`,
        [STORY_ID]
      );
      expect(story.rows[0]?.user_id).toBeNull();
      const scope = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.account_deletion_story_freeze_scope WHERE deletion_request_id = $1`,
        [REQUEST_ID]
      );
      expect(Number(scope.rows[0]?.count)).toBe(1);
    });

    it("RC-F: unexpected scope rows block cancellation with zero recovery writes", async () => {
      await cleanupScenario(client);
      const attemptId = await seedAcquired(client, "inventory", {
        storyBeforeAcquire: true,
      });
      await client.query(
        `INSERT INTO public.account_deletion_story_freeze_scope (deletion_request_id, story_id) VALUES ($1, $2)`,
        [REQUEST_ID, STORY_ID]
      );
      const payload = await cancel(client, REQUEST_ID, attemptId);
      expect(payload).toMatchObject({ ok: false, code: "irreversible_state" });
      expect((await requestState(client))?.status).toBe("deletion_in_progress");
      expect(await attemptState(client, attemptId)).toMatchObject({
        status: "active",
        stage: "inventory",
      });
    });

    it("RC-G: wrong request/attempt pair writes nothing", async () => {
      await cleanupScenario(client);
      const attemptId = await seedAcquired(client, "lock_acquired");
      await submitRequest(client, OTHER_REQUEST, OTHER, "other@test.local");
      await approveRequest(client, OTHER_REQUEST);
      const payload = await cancel(client, OTHER_REQUEST, attemptId);
      expect(payload).toMatchObject({ ok: false, code: "attempt_request_mismatch" });
      expect((await requestState(client))?.status).toBe("deletion_in_progress");
      const other = await client.query<{ status: string }>(
        `SELECT status FROM public.account_deletion_requests WHERE id = $1`,
        [OTHER_REQUEST]
      );
      expect(other.rows[0]?.status).toBe("approved");
    });

    it("RC-H: target mismatch writes nothing", async () => {
      await cleanupScenario(client);
      const attemptId = await seedAcquired(client, "lock_acquired");
      await client.query(
        `INSERT INTO auth.users (id, email) VALUES ($1, 'mismatch@test.local') ON CONFLICT DO NOTHING`,
        [MISMATCH_TARGET]
      );
      await client.query("BEGIN");
      await client.query(
        `ALTER TABLE public.account_deletion_execution_attempts DISABLE TRIGGER account_deletion_execution_attempt_target_validation`
      );
      await client.query(
        `UPDATE public.account_deletion_execution_attempts SET target_user_id = $2 WHERE id = $1`,
        [attemptId, MISMATCH_TARGET]
      );
      await client.query(
        `ALTER TABLE public.account_deletion_execution_attempts ENABLE TRIGGER account_deletion_execution_attempt_target_validation`
      );
      await client.query("COMMIT");
      const payload = await cancel(client, REQUEST_ID, attemptId);
      expect(payload).toMatchObject({ ok: false, code: "target_mismatch" });
      expect((await requestState(client))?.status).toBe("deletion_in_progress");
    });

    it("RC-I: non-owner initiated_by is owner_required", async () => {
      await cleanupScenario(client);
      const attemptId = await seedAcquired(client, "lock_acquired");
      const payload = await cancel(client, REQUEST_ID, attemptId, TARGET);
      expect(payload).toMatchObject({ ok: false, code: "owner_required" });
      expect((await requestState(client))?.status).toBe("deletion_in_progress");
    });

    it("RC-J: authenticated and anon cannot execute cancel RPC", async () => {
      await cleanupScenario(client);
      const attemptId = await seedAcquired(client, "lock_acquired");
      for (const role of ["authenticated", "anon"]) {
        await client.query("BEGIN");
        await client.query(`SET LOCAL ROLE ${role}`);
        await expect(
          client.query(
            `SELECT public.cancel_account_deletion_execution($1::uuid, $2::uuid, $3::uuid)`,
            [REQUEST_ID, attemptId, OWNER]
          )
        ).rejects.toThrow(/permission denied/i);
        await client.query("ROLLBACK");
      }
      expect((await requestState(client))?.status).toBe("deletion_in_progress");
    });

    it("RC-K: second cancel is already_cancelled and does not rewrite timestamps", async () => {
      await cleanupScenario(client);
      const attemptId = await seedAcquired(client, "lock_acquired");
      expect((await cancel(client, REQUEST_ID, attemptId)).code).toBe("cancelled");
      const first = await attemptState(client, attemptId);
      const second = await cancel(client, REQUEST_ID, attemptId);
      expect(second).toMatchObject({
        ok: true,
        code: "already_cancelled",
        last_stage: "lock_acquired",
      });
      const after = await attemptState(client, attemptId);
      expect(String(after?.completed_at)).toBe(String(first?.completed_at));
      expect(String(after?.updated_at)).toBe(String(first?.updated_at));
    });

    it("RC-L: cancel then acquisition creates a new attempt and keeps history", async () => {
      await cleanupScenario(client);
      const oldAttempt = await seedAcquired(client, "lock_acquired");
      expect((await cancel(client, REQUEST_ID, oldAttempt)).ok).toBe(true);
      const newAttempt = await acquire(client, REQUEST_ID);
      expect(newAttempt).not.toBe(oldAttempt);
      const rows = await client.query<{ id: string; status: string }>(
        `SELECT id, status FROM public.account_deletion_execution_attempts WHERE deletion_request_id = $1 ORDER BY started_at`,
        [REQUEST_ID]
      );
      expect(rows.rows).toEqual([
        { id: oldAttempt, status: "failed" },
        { id: newAttempt, status: "active" },
      ]);
    });

    it("RC-M: old cancelled attempt cannot affect a newer execution", async () => {
      await cleanupScenario(client);
      const oldAttempt = await seedAcquired(client, "lock_acquired");
      expect((await cancel(client, REQUEST_ID, oldAttempt)).ok).toBe(true);
      const newAttempt = await acquire(client, REQUEST_ID);
      const payload = await cancel(client, REQUEST_ID, oldAttempt);
      expect(payload.ok).toBe(false);
      expect((await requestState(client))?.status).toBe("deletion_in_progress");
      expect(await attemptState(client, newAttempt)).toMatchObject({
        status: "active",
        stage: "lock_acquired",
      });
      expect(await attemptState(client, oldAttempt)).toMatchObject({
        status: "failed",
        last_error_code: "execution_cancelled",
      });
    });

    it("RC-N: cancel blocks later 3B.1 on the old attempt", async () => {
      await cleanupScenario(client);
      const attemptId = await seedAcquired(client, "inventory");
      expect((await cancel(client, REQUEST_ID, attemptId)).ok).toBe(true);
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE service_role");
      const stage = await client.query<{ payload: CancelPayload }>(
        `SELECT public.execute_account_deletion_nondestructive_database_stage($1::uuid, $2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );
      await client.query("COMMIT");
      // Gate runs before _inner for all pre-database_completed stages, so a
      // cancelled attempt without a finalized manifest is refused at the gate.
      expect(stage.rows[0]?.payload).toMatchObject({
        ok: false,
        code: "storage_manifest_not_finalized",
      });
      expect((await requestState(client))?.status).toBe("approved");
    });

    it("denies direct service_role attempt and request updates", async () => {
      await cleanupScenario(client);
      const attemptId = await seedAcquired(client, "lock_acquired");
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE service_role");
      await expect(
        client.query(
          `UPDATE public.account_deletion_execution_attempts SET status = 'failed' WHERE id = $1`,
          [attemptId]
        )
      ).rejects.toThrow(/permission denied/i);
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE service_role");
      await expect(
        client.query(
          `UPDATE public.account_deletion_requests SET status = 'approved' WHERE id = $1`,
          [REQUEST_ID]
        )
      ).rejects.toThrow(/permission denied/i);
      await client.query("ROLLBACK");
    });
  }
);
