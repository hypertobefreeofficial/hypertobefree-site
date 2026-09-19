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
const REQUEST_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const WRONG_REQUEST = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

type StagePayload = {
  ok?: boolean;
  code?: string;
  stage?: string;
  retry_count?: number;
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
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.account_deletion_requests TO authenticated;
    GRANT SELECT, UPDATE ON public.profiles TO authenticated;
  `);
  authenticatedDeletionGrantsApplied = true;
}

async function callStageRpc(
  client: Client,
  rpcName: string,
  requestId: string,
  attemptId: string,
  options?: { manageRole?: boolean }
): Promise<StagePayload> {
  const manageRole = options?.manageRole !== false;
  if (manageRole) {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE service_role");
  }
  try {
    const result = await client.query<{ payload: StagePayload }>(
      `SELECT public.${rpcName}($1::uuid, $2::uuid) AS payload`,
      [requestId, attemptId]
    );
    if (manageRole) {
      await client.query("COMMIT");
    }
    return result.rows[0]?.payload ?? {};
  } catch (error) {
    if (manageRole) {
      await client.query("ROLLBACK");
    }
    throw error;
  }
}

async function cleanupScenario(client: Client) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // no open transaction
  }
  await client.query(`
    TRUNCATE TABLE
      public.account_deletion_story_freeze_scope,
      public.account_deletion_execution_attempts,
      public.account_deletion_requests,
      public.profiles
    RESTART IDENTITY CASCADE
  `);
  await client.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [
    [TARGET, OWNER],
  ]);
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
        id, user_id, status, target_username_snapshot, email
      ) VALUES ($1, $2, 'submitted', 'target_user', 'target@test.local')
      `,
      [REQUEST_ID, TARGET]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
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
      SET status = 'approved', approved_at = now(), approved_by = $2,
          reviewed_at = now(), reviewed_by = $2
      WHERE id = $1 AND status = 'submitted'
      `,
      [REQUEST_ID, OWNER]
    );
    expect(update.rowCount).toBe(1);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function seedApprovedAndAcquire(client: Client): Promise<string> {
  await client.query(
    `
    INSERT INTO auth.users (id, email) VALUES ($1, 'target@test.local'), ($2, 'owner@test.local')
    ON CONFLICT (id) DO NOTHING
    `,
    [TARGET, OWNER]
  );
  await client.query(
    `
    INSERT INTO public.profiles (id, email, username, display_name, is_owner, is_admin)
    VALUES ($1, 'target@test.local', 'target_user', 'Target User', false, false),
           ($2, 'owner@test.local', 'owner_user', 'Owner User', false, false)
    ON CONFLICT (id) DO NOTHING
    `,
    [TARGET, OWNER]
  );
  await bootstrapFirstOwnerProfile(client);
  await ensureAuthenticatedDeletionRequestGrants(client);
  await submitDeletionRequestAsTarget(client);
  await approveDeletionRequestAsOwner(client);

  await client.query("BEGIN");
  let acquired;
  try {
    await client.query("SET LOCAL ROLE service_role");
    acquired = await client.query<{ payload: StagePayload & { attempt_id?: string } }>(
      `SELECT public.acquire_account_deletion_execution_lock($1::uuid, $2::uuid) AS payload`,
      [REQUEST_ID, OWNER]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  const payload = acquired!.rows[0]?.payload;
  expect(payload?.ok).toBe(true);
  expect(typeof payload?.attempt_id).toBe("string");
  return payload!.attempt_id!;
}

describeIntegration(
  `account deletion session transition integration (${ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV})`,
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

    it("ST-A: lock_acquired → sessions_pending advanced", async () => {
      await cleanupScenario(client);
      const attemptId = await seedApprovedAndAcquire(client);
      const payload = await callStageRpc(
        client,
        "advance_account_deletion_attempt_to_sessions_pending",
        REQUEST_ID,
        attemptId
      );
      expect(payload).toMatchObject({ ok: true, code: "advanced", stage: "sessions_pending" });
    });

    it("ST-B: repeat sessions_pending = already_at_stage", async () => {
      await cleanupScenario(client);
      const attemptId = await seedApprovedAndAcquire(client);
      await callStageRpc(
        client,
        "advance_account_deletion_attempt_to_sessions_pending",
        REQUEST_ID,
        attemptId
      );
      const second = await callStageRpc(
        client,
        "advance_account_deletion_attempt_to_sessions_pending",
        REQUEST_ID,
        attemptId
      );
      expect(second).toMatchObject({ ok: true, code: "already_at_stage", stage: "sessions_pending" });
    });

    it("ST-C: cannot skip lock_acquired → sessions_revoked", async () => {
      await cleanupScenario(client);
      const attemptId = await seedApprovedAndAcquire(client);
      const payload = await callStageRpc(
        client,
        "advance_account_deletion_attempt_to_sessions_revoked",
        REQUEST_ID,
        attemptId
      );
      expect(payload).toMatchObject({ ok: false, code: "stage_conflict" });
    });

    it("ST-D/E: sessions_pending → sessions_revoked and idempotent retry", async () => {
      await cleanupScenario(client);
      const attemptId = await seedApprovedAndAcquire(client);
      await callStageRpc(
        client,
        "advance_account_deletion_attempt_to_sessions_pending",
        REQUEST_ID,
        attemptId
      );
      const advanced = await callStageRpc(
        client,
        "advance_account_deletion_attempt_to_sessions_revoked",
        REQUEST_ID,
        attemptId
      );
      expect(advanced).toMatchObject({ ok: true, code: "advanced", stage: "sessions_revoked" });
      const second = await callStageRpc(
        client,
        "advance_account_deletion_attempt_to_sessions_revoked",
        REQUEST_ID,
        attemptId
      );
      expect(second).toMatchObject({ ok: true, code: "already_at_stage", stage: "sessions_revoked" });
    });

    it("ST-F: cannot skip sessions_pending → inventory", async () => {
      await cleanupScenario(client);
      const attemptId = await seedApprovedAndAcquire(client);
      await callStageRpc(
        client,
        "advance_account_deletion_attempt_to_sessions_pending",
        REQUEST_ID,
        attemptId
      );
      const payload = await callStageRpc(
        client,
        "advance_account_deletion_attempt_to_inventory",
        REQUEST_ID,
        attemptId
      );
      expect(payload).toMatchObject({ ok: false, code: "stage_conflict" });
    });

    it("ST-G/H: sessions_revoked → inventory and idempotent retry", async () => {
      await cleanupScenario(client);
      const attemptId = await seedApprovedAndAcquire(client);
      await callStageRpc(
        client,
        "advance_account_deletion_attempt_to_sessions_pending",
        REQUEST_ID,
        attemptId
      );
      await callStageRpc(
        client,
        "advance_account_deletion_attempt_to_sessions_revoked",
        REQUEST_ID,
        attemptId
      );
      const advanced = await callStageRpc(
        client,
        "advance_account_deletion_attempt_to_inventory",
        REQUEST_ID,
        attemptId
      );
      expect(advanced).toMatchObject({ ok: true, code: "advanced", stage: "inventory" });
      const second = await callStageRpc(
        client,
        "advance_account_deletion_attempt_to_inventory",
        REQUEST_ID,
        attemptId
      );
      expect(second).toMatchObject({ ok: true, code: "already_at_stage", stage: "inventory" });
    });

    it("ST-I: database_completed cannot move backward via inventory RPC", async () => {
      await cleanupScenario(client);
      const attemptId = await seedApprovedAndAcquire(client);
      await client.query(
        `UPDATE public.account_deletion_execution_attempts SET stage = 'database_completed' WHERE id = $1`,
        [attemptId]
      );
      const payload = await callStageRpc(
        client,
        "advance_account_deletion_attempt_to_inventory",
        REQUEST_ID,
        attemptId
      );
      expect(payload).toMatchObject({ ok: false, code: "stage_conflict" });
    });

    it("ST-J: wrong request/attempt pair fails", async () => {
      await cleanupScenario(client);
      const attemptId = await seedApprovedAndAcquire(client);
      const payload = await callStageRpc(
        client,
        "advance_account_deletion_attempt_to_sessions_pending",
        WRONG_REQUEST,
        attemptId
      );
      expect(payload.ok).toBe(false);
      expect(payload.code).toMatch(/attempt_request_mismatch|request_not_found/);
    });

    it("ST-K: inactive attempt fails", async () => {
      await cleanupScenario(client);
      const attemptId = await seedApprovedAndAcquire(client);
      await client.query(
        `UPDATE public.account_deletion_execution_attempts SET status = 'failed' WHERE id = $1`,
        [attemptId]
      );
      const payload = await callStageRpc(
        client,
        "advance_account_deletion_attempt_to_sessions_pending",
        REQUEST_ID,
        attemptId
      );
      expect(payload).toMatchObject({ ok: false, code: "attempt_not_active" });
    });

    it("ST-L: request not deletion_in_progress fails", async () => {
      await cleanupScenario(client);
      const attemptId = await seedApprovedAndAcquire(client);
      await client.query(
        `UPDATE public.account_deletion_requests SET status = 'approved' WHERE id = $1`,
        [REQUEST_ID]
      );
      const payload = await callStageRpc(
        client,
        "advance_account_deletion_attempt_to_sessions_pending",
        REQUEST_ID,
        attemptId
      );
      expect(payload).toMatchObject({ ok: false, code: "request_not_in_progress" });
    });

    it("ST-M: authenticated cannot execute transition RPC", async () => {
      await cleanupScenario(client);
      const attemptId = await seedApprovedAndAcquire(client);
      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL ROLE authenticated");
        await expect(
          client.query(
            `SELECT public.advance_account_deletion_attempt_to_sessions_pending($1::uuid, $2::uuid)`,
            [REQUEST_ID, attemptId]
          )
        ).rejects.toThrow(/permission denied/i);
      } finally {
        await client.query("ROLLBACK");
      }
    });

    it("ST-N: service_role direct UPDATE of attempt stage denied", async () => {
      await cleanupScenario(client);
      const attemptId = await seedApprovedAndAcquire(client);
      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL ROLE service_role");
        await expect(
          client.query(
            `UPDATE public.account_deletion_execution_attempts SET stage = 'sessions_pending' WHERE id = $1`,
            [attemptId]
          )
        ).rejects.toThrow(/permission denied/i);
      } finally {
        await client.query("ROLLBACK");
      }
    });

    it("ST-O: session-revocation failure RPC records metadata and stays pending", async () => {
      await cleanupScenario(client);
      const attemptId = await seedApprovedAndAcquire(client);
      await callStageRpc(
        client,
        "advance_account_deletion_attempt_to_sessions_pending",
        REQUEST_ID,
        attemptId
      );

      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE service_role");
      const recorded = await client.query<{ payload: StagePayload }>(
        `
        SELECT public.record_account_deletion_session_revocation_failure(
          $1::uuid, $2::uuid, $3::text, $4::text
        ) AS payload
        `,
        [REQUEST_ID, attemptId, "session_revocation_failed", "fp-safe"]
      );
      await client.query("COMMIT");

      expect(recorded.rows[0]?.payload).toMatchObject({
        ok: true,
        code: "recorded",
        stage: "sessions_pending",
        retry_count: 1,
      });
    });

    it("ST-O-b: failure RPC rejects wrong stage", async () => {
      await cleanupScenario(client);
      const attemptId = await seedApprovedAndAcquire(client);
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE service_role");
      const payload = await client.query<{ payload: StagePayload }>(
        `
        SELECT public.record_account_deletion_session_revocation_failure(
          $1::uuid, $2::uuid, 'session_revocation_failed', 'fp'
        ) AS payload
        `,
        [REQUEST_ID, attemptId]
      );
      await client.query("COMMIT");
      expect(payload.rows[0]?.payload).toMatchObject({ ok: false, code: "stage_conflict" });
    });

    it("ST-P: repeated stage requests cannot skip stages", async () => {
      await cleanupScenario(client);
      const attemptId = await seedApprovedAndAcquire(client);
      const skip = await callStageRpc(
        client,
        "advance_account_deletion_attempt_to_inventory",
        REQUEST_ID,
        attemptId
      );
      expect(skip).toMatchObject({ ok: false, code: "stage_conflict" });
      const pending = await callStageRpc(
        client,
        "advance_account_deletion_attempt_to_sessions_pending",
        REQUEST_ID,
        attemptId
      );
      expect(pending).toMatchObject({ ok: true, code: "advanced" });
    });

    it("ST-Q: acquisition still creates exactly one active attempt", async () => {
      await cleanupScenario(client);
      await seedApprovedAndAcquire(client);
      const count = await client.query<{ count: string }>(
        `
        SELECT count(*)::text AS count
        FROM public.account_deletion_execution_attempts
        WHERE deletion_request_id = $1 AND status = 'active'
        `,
        [REQUEST_ID]
      );
      expect(Number(count.rows[0]?.count ?? 0)).toBe(1);
    });

    it("readiness includes session transition foundation", async () => {
      const ready = await client.query<{ ready: boolean }>(
        `
        SELECT (public.verify_account_deletion_session_transition_foundation_ready()->>'ready')::boolean AS ready
        `
      );
      expect(ready.rows[0]?.ready).toBe(true);
    });
  }
);
