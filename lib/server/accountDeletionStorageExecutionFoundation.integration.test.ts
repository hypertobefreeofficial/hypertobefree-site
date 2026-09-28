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
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REQUEST_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const THREAD = "11111111-1111-4111-8111-111111111111";
const OBJECT = "22222222-2222-4222-8222-222222222222";

type RpcPayload = {
  ok?: boolean;
  code?: string;
  inserted_count?: number;
  result_count?: number;
  hold_id?: string;
  claim_token?: string;
  execution_state?: string;
  ready?: boolean;
};

let serviceRoleGrantsApplied = false;
let authenticatedGrantsApplied = false;

async function ensureServiceRole(client: Client) {
  if (serviceRoleGrantsApplied) return;
  await client.query(`
    GRANT USAGE ON SCHEMA public TO service_role;
    ALTER ROLE service_role BYPASSRLS;
  `);
  serviceRoleGrantsApplied = true;
}

async function ensureAuthenticatedGrants(client: Client) {
  if (authenticatedGrantsApplied) return;
  await client.query(`
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.account_deletion_requests TO authenticated;
    GRANT SELECT, UPDATE ON public.profiles TO authenticated;
  `);
  authenticatedGrantsApplied = true;
}

async function asServiceRole<T>(
  client: Client,
  sql: string,
  params: unknown[] = []
): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE service_role");
    const result = await client.query<{ payload: T }>(sql, params);
    await client.query("COMMIT");
    return result.rows[0]?.payload as T;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function asAuthenticatedOwner<T>(
  client: Client,
  sql: string,
  params: unknown[] = [],
  options: { aal2?: boolean } = {}
): Promise<T> {
  await ensureAuthenticatedGrants(client);
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({
        sub: OWNER,
        ...(options.aal2 ? { aal: "aal2" } : {}),
      }),
    ]);
    const result = await client.query<{ payload: T }>(sql, params);
    await client.query("COMMIT");
    return result.rows[0]?.payload as T;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function cleanup(client: Client) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // ignore
  }
  await client.query(`
    TRUNCATE TABLE
      public.account_deletion_storage_execution_audit,
      public.account_deletion_storage_execution_results,
      public.account_deletion_storage_preservation_holds,
      public.account_deletion_storage_manifest,
      public.account_deletion_storage_manifest_capture,
      public.account_deletion_story_freeze_scope,
      public.inbox_messages,
      public.prayer_video_responses,
      public.stories,
      public.account_deletion_execution_attempts,
      public.account_deletion_requests,
      public.profiles
    RESTART IDENTITY CASCADE
  `);
  await client.query(`DELETE FROM storage.objects`);
  await client.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [
    [TARGET, OTHER, OWNER],
  ]);
}

async function seedUsers(client: Client) {
  await client.query(
    `INSERT INTO auth.users (id, email) VALUES ($1,'t@test'),($2,'o@test'),($3,'w@test')
     ON CONFLICT (id) DO NOTHING`,
    [TARGET, OTHER, OWNER]
  );
  await client.query("BEGIN");
  try {
    await client.query(
      `ALTER TABLE public.profiles DISABLE TRIGGER protect_profile_roles_trigger`
    );
    await client.query(
      `INSERT INTO public.profiles (id, email, username, display_name, is_owner, is_admin)
       VALUES
         ($1,'target-se@test.local','target_se','Target',false,false),
         ($2,'other-se@test.local','other_se','Other',false,false),
         ($3,'owner-se@test.local','owner_se','Owner',false,false)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
      [TARGET, OTHER, OWNER]
    );
    await client.query(
      `UPDATE public.profiles SET is_owner = true, is_admin = true WHERE id = $1`,
      [OWNER]
    );
    await client.query(
      `ALTER TABLE public.profiles ENABLE TRIGGER protect_profile_roles_trigger`
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function insertJourneyObject(client: Client, objectPath: string) {
  await client.query(
    `INSERT INTO storage.objects (bucket_id, name, owner)
     VALUES ('journey-private-media', $1, $2) ON CONFLICT DO NOTHING`,
    [objectPath, TARGET]
  );
}

async function seedApprovedAcquiredInventory(
  client: Client,
  requestId: string = REQUEST_ID
): Promise<string> {
  await ensureAuthenticatedGrants(client);
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: TARGET }),
    ]);
    await client.query(
      `INSERT INTO public.account_deletion_requests (
        id, user_id, status, target_username_snapshot, email
      ) VALUES ($1, $2, 'submitted', 'target_se', $3)`,
      [requestId, TARGET, "target-se@test.local"]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: OWNER }),
    ]);
    await client.query(
      `UPDATE public.account_deletion_requests
       SET status = 'approved', approved_at = now(), approved_by = $2,
           reviewed_at = now(), reviewed_by = $2
       WHERE id = $1`,
      [requestId, OWNER]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  await client.query("BEGIN");
  let attemptId: string;
  try {
    await client.query("SET LOCAL ROLE service_role");
    const acquired = await client.query<{
      payload: { ok?: boolean; attempt_id?: string };
    }>(
      `SELECT public.acquire_account_deletion_execution_lock($1::uuid, $2::uuid) AS payload`,
      [requestId, OWNER]
    );
    await client.query("COMMIT");
    attemptId = acquired.rows[0]?.payload?.attempt_id ?? "";
    expect(acquired.rows[0]?.payload?.ok).toBe(true);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  for (const rpc of [
    "advance_account_deletion_attempt_to_sessions_pending",
    "advance_account_deletion_attempt_to_sessions_revoked",
    "advance_account_deletion_attempt_to_inventory",
  ]) {
    const advanced = await asServiceRole<RpcPayload>(
      client,
      `SELECT public.${rpc}($1::uuid, $2::uuid) AS payload`,
      [requestId, attemptId]
    );
    expect(advanced.ok).toBe(true);
  }

  return attemptId;
}

async function captureAndMarkDatabaseCompleted(
  client: Client,
  requestId: string,
  attemptId: string
) {
  const captured = await asServiceRole<RpcPayload>(
    client,
    `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
    [requestId, attemptId]
  );
  expect(captured.ok).toBe(true);

  await client.query(
    `UPDATE public.account_deletion_execution_attempts
     SET stage = 'database_completed'
     WHERE id = $1`,
    [attemptId]
  );
}

async function initResults(
  client: Client,
  requestId: string,
  attemptId: string
) {
  return asServiceRole<RpcPayload>(
    client,
    `SELECT public.initialize_account_deletion_storage_execution_results($1::uuid,$2::uuid) AS payload`,
    [requestId, attemptId]
  );
}

describeIntegration(
  `account deletion storage execution foundation (${ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV})`,
  () => {
    let client: Client;

    beforeAll(async () => {
      client = new Client({ connectionString: dbUrl! });
      await client.connect();
      await resetAccountDeletionIntegrationSchema(client);
      await applyAccountDeletionMigrations(client);
      await client.query(`
        CREATE OR REPLACE FUNCTION public.hashtextextended(text, bigint)
        RETURNS bigint
        LANGUAGE sql
        IMMUTABLE PARALLEL SAFE STRICT
        AS $$ SELECT pg_catalog.hashtextextended($1, $2) $$;
      `);
      await ensureServiceRole(client);
    });

    afterAll(async () => {
      await cleanup(client);
      await client?.end();
    });

    it("readiness + privilege matrix", async () => {
      const ready = await asServiceRole<{ ready?: boolean }>(
        client,
        `SELECT public.verify_account_deletion_storage_execution_foundation_ready() AS payload`
      );
      expect(ready.ready).toBe(true);

      const schema = await asServiceRole<{ ready?: boolean; prerequisites?: unknown[] }>(
        client,
        `SELECT public.verify_account_deletion_schema_execution_ready() AS payload`
      );
      expect(schema.ready).toBe(true);
      const ids = (schema.prerequisites ?? []).map(
        (p) => (p as { id?: string }).id
      );
      const foundationCount = ids.filter(
        (id) => id === "storage_manifest_foundation_ready_composed"
      ).length;
      expect(foundationCount).toBe(1);

      const privs = await client.query<{
        insert_results: boolean;
        update_results: boolean;
        insert_holds: boolean;
      }>(`
        SELECT
          has_table_privilege('service_role', 'public.account_deletion_storage_execution_results', 'INSERT') AS insert_results,
          has_table_privilege('service_role', 'public.account_deletion_storage_execution_results', 'UPDATE') AS update_results,
          has_table_privilege('service_role', 'public.account_deletion_storage_preservation_holds', 'INSERT') AS insert_holds
      `);
      expect(privs.rows[0]).toMatchObject({
        insert_results: false,
        update_results: false,
        insert_holds: false,
      });
    });

    it("SE-A: empty finalized manifest → zero result rows", async () => {
      await cleanup(client);
      await seedUsers(client);
      const attemptId = await seedApprovedAcquiredInventory(client);
      await captureAndMarkDatabaseCompleted(client, REQUEST_ID, attemptId);
      const init = await initResults(client, REQUEST_ID, attemptId);
      expect(init).toMatchObject({ ok: true, result_count: 0, inserted_count: 0 });
    });

    it("SE-B through SE-F + SE-N: disposition mapping and idempotent init", async () => {
      await cleanup(client);
      await seedUsers(client);

      await client.query(
        `UPDATE public.profiles SET avatar_url = $2 WHERE id = $1`,
        [TARGET, `profile-avatars/${TARGET}/avatar.png`]
      );
      await client.query(
        `INSERT INTO public.stories (id, user_id, name, email, story_text, image_url, status)
         VALUES ($1,$2,'n','e@t','body',$3,'approved')`,
        [
          "ffffffff-ffff-4fff-8fff-ffffffffffff",
          TARGET,
          `story-images/${TARGET}/img.png`,
        ]
      );

      const exclusivePath = `${TARGET}/${THREAD}/${OBJECT}.mp4`;
      await insertJourneyObject(client, exclusivePath);
      await client.query(
        `INSERT INTO public.inbox_messages (id, user_id, sender_user_id, title, body, video_url, thread_id)
         VALUES ($1,$2,$2,'t','b',$3,$4)`,
        [
          "77777777-7777-4777-8777-777777777777",
          TARGET,
          `journey-private-media/${exclusivePath}`,
          THREAD,
        ]
      );
      const sharedPath = `${TARGET}/${THREAD}/33333333-3333-4333-8333-333333333333.mp4`;
      await insertJourneyObject(client, sharedPath);
      await client.query(
        `INSERT INTO public.inbox_messages (id, user_id, sender_user_id, title, body, video_url, thread_id)
         VALUES
           ($1,$2,$3,'sent','b',$4,$5),
           ($6,$3,$3,'own','b',$4,$5)`,
        [
          "88888888-8888-4888-8888-888888888888",
          OTHER,
          TARGET,
          `journey-private-media/${sharedPath}`,
          THREAD,
          "99999999-9999-4999-8999-999999999999",
        ]
      );

      await client.query(
        `INSERT INTO storage.objects (bucket_id, name, owner)
         VALUES ('journey-private-media', $1, $2)`,
        [`${TARGET}/${THREAD}/orphan-unreferenced.mp4`, TARGET]
      );

      const attemptId = await seedApprovedAcquiredInventory(client);
      await captureAndMarkDatabaseCompleted(client, REQUEST_ID, attemptId);
      const first = await initResults(client, REQUEST_ID, attemptId);
      expect(first.ok).toBe(true);

      const rows = await client.query<{
        object_path: string;
        disposition_snapshot: string;
        execution_state: string;
      }>(
        `SELECT object_path, disposition_snapshot, execution_state
         FROM public.account_deletion_storage_execution_results
         WHERE execution_attempt_id = $1`,
        [attemptId]
      );

      expect(
        rows.rows.find((r) => r.object_path.endsWith("img.png"))
      ).toMatchObject({
        disposition_snapshot: "PRESERVE_PUBLIC",
        execution_state: "preserved",
      });
      expect(
        rows.rows.find((r) => r.object_path.endsWith("avatar.png"))
      ).toMatchObject({
        disposition_snapshot: "DEFER_PROFILE",
        execution_state: "deferred_profile",
      });
      expect(
        rows.rows.find((r) => r.object_path === exclusivePath)
      ).toMatchObject({
        disposition_snapshot: "DELETE_PRIVATE",
        execution_state: "pending",
      });
      expect(
        rows.rows.find((r) => r.object_path.includes("orphan-unreferenced"))
      ).toMatchObject({
        disposition_snapshot: "BLOCK_UNRESOLVED",
        execution_state: "blocked",
      });
      expect(
        rows.rows.find((r) => r.object_path === sharedPath)
      ).toMatchObject({
        disposition_snapshot: "PRESERVE_SHARED",
        execution_state: "preserved",
      });

      const again = await initResults(client, REQUEST_ID, attemptId);
      expect(again).toMatchObject({ ok: true, inserted_count: 0 });
      expect(again.result_count).toBe(first.result_count);
    });

    it("SE-G/SE-H/SE-S/SE-T: holds block DELETE_PRIVATE; release restores eligibility", async () => {
      await cleanup(client);
      await seedUsers(client);
      const exclusivePath = `${TARGET}/${THREAD}/${OBJECT}.mp4`;
      await insertJourneyObject(client, exclusivePath);
      await client.query(
        `INSERT INTO public.inbox_messages (id, user_id, sender_user_id, title, body, video_url, thread_id)
         VALUES ($1,$2,$2,'t','b',$3,$4)`,
        [
          "77777777-7777-4777-8777-777777777777",
          TARGET,
          `journey-private-media/${exclusivePath}`,
          THREAD,
        ]
      );

      const attemptId = await seedApprovedAcquiredInventory(client);
      await captureAndMarkDatabaseCompleted(client, REQUEST_ID, attemptId);
      await initResults(client, REQUEST_ID, attemptId);

      const manifest = await client.query<{ id: string; object_path: string }>(
        `SELECT id, object_path FROM public.account_deletion_storage_manifest
         WHERE execution_attempt_id = $1 AND disposition = 'DELETE_PRIVATE'`,
        [attemptId]
      );
      const deleteObj = manifest.rows[0]!;

      const hold = await asAuthenticatedOwner<RpcPayload>(
        client,
        `SELECT public.create_account_deletion_storage_preservation_hold(
          $1::uuid,'manifest_object'::text,'legal_hold'::text,$2::uuid,$3::uuid,NULL
        ) AS payload`,
        [REQUEST_ID, attemptId, deleteObj.id]
      );
      expect(hold.ok).toBe(true);

      const blocked = await client.query<{ execution_state: string }>(
        `SELECT execution_state FROM public.account_deletion_storage_execution_results
         WHERE manifest_object_id = $1`,
        [deleteObj.id]
      );
      expect(blocked.rows[0]?.execution_state).toBe("blocked_on_hold");

      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
          [REQUEST_ID, attemptId, deleteObj.id]
        )
      ).toMatchObject({ ok: false, code: "preservation_hold_active" });

      const released = await asAuthenticatedOwner<RpcPayload>(
        client,
        `SELECT public.release_account_deletion_storage_preservation_hold($1::uuid) AS payload`,
        [hold.hold_id],
        { aal2: true }
      );
      expect(released.ok).toBe(true);

      const pending = await client.query<{ execution_state: string }>(
        `SELECT execution_state FROM public.account_deletion_storage_execution_results
         WHERE manifest_object_id = $1`,
        [deleteObj.id]
      );
      expect(pending.rows[0]?.execution_state).toBe("pending");

      const reqHold = await asAuthenticatedOwner<RpcPayload>(
        client,
        `SELECT public.create_account_deletion_storage_preservation_hold(
          $1::uuid,'request'::text,'litigation_preservation'::text,NULL,NULL,NULL
        ) AS payload`,
        [REQUEST_ID]
      );
      expect(reqHold.ok).toBe(true);
      expect(
        (
          await client.query<{ c: number }>(
            `SELECT count(*)::int AS c FROM public.account_deletion_storage_execution_results
             WHERE execution_attempt_id = $1 AND disposition_snapshot = 'DELETE_PRIVATE'
               AND execution_state = 'blocked_on_hold'`,
            [attemptId]
          )
        ).rows[0]?.c
      ).toBeGreaterThan(0);
    });

    it("SE-K/L/M: stage, finalize, and cross-attempt isolation", async () => {
      await cleanup(client);
      await seedUsers(client);
      const attemptId = await seedApprovedAcquiredInventory(client);
      await asServiceRole<RpcPayload>(
        client,
        `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );

      expect(
        await initResults(client, REQUEST_ID, attemptId)
      ).toMatchObject({ ok: false, code: "invalid_stage" });

      await captureAndMarkDatabaseCompleted(client, REQUEST_ID, attemptId);
      await client.query(
        `UPDATE public.account_deletion_execution_attempts
         SET storage_manifest_status = 'open' WHERE id = $1`,
        [attemptId]
      );
      expect(
        await initResults(client, REQUEST_ID, attemptId)
      ).toMatchObject({ ok: false, code: "storage_manifest_not_finalized" });

      await client.query(
        `UPDATE public.account_deletion_execution_attempts
         SET storage_manifest_status = 'finalized' WHERE id = $1`,
        [attemptId]
      );
      await initResults(client, REQUEST_ID, attemptId);

      expect(
        await initResults(
          client,
          REQUEST_ID,
          "00000000-0000-4000-8000-000000000099"
        )
      ).toMatchObject({ ok: false, code: "attempt_mismatch" });
    });

    it("SE-O/P/Q: direct table mutation and authenticated denied", async () => {
      await cleanup(client);
      await seedUsers(client);
      const attemptId = await seedApprovedAcquiredInventory(client);
      await captureAndMarkDatabaseCompleted(client, REQUEST_ID, attemptId);

      await initResults(client, REQUEST_ID, attemptId);

      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL ROLE service_role");
        await expect(
          client.query(
            `INSERT INTO public.account_deletion_storage_execution_results (
              deletion_request_id, execution_attempt_id, manifest_object_id,
              target_user_id, bucket, object_path, disposition_snapshot,
              preservation_required_snapshot, execution_state
            ) VALUES (
              $1,$2,'00000000-0000-4000-8000-000000000001'::uuid,
              $3,'journey-private-media','x','DELETE_PRIVATE',false,'pending'
            )`,
            [REQUEST_ID, attemptId, TARGET]
          )
        ).rejects.toThrow(/permission denied/i);
      } finally {
        await client.query("ROLLBACK");
      }

      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL ROLE service_role");
        await expect(
          client.query(
            `UPDATE public.account_deletion_storage_execution_results
             SET execution_state = 'deleted' WHERE execution_attempt_id = $1`,
            [attemptId]
          )
        ).rejects.toThrow(/permission denied/i);
      } finally {
        await client.query("ROLLBACK");
      }

      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL ROLE authenticated");
        await expect(
          client.query(
            `SELECT public.initialize_account_deletion_storage_execution_results($1::uuid,$2::uuid)`,
            [REQUEST_ID, attemptId]
          )
        ).rejects.toThrow(/permission denied/i);
      } finally {
        await client.query("ROLLBACK");
      }
    });

    it("SE-U through SE-X: claim lease foundation", async () => {
      await cleanup(client);
      await seedUsers(client);
      const exclusivePath = `${TARGET}/${THREAD}/${OBJECT}.mp4`;
      await insertJourneyObject(client, exclusivePath);
      await client.query(
        `INSERT INTO public.inbox_messages (id, user_id, sender_user_id, title, body, video_url, thread_id)
         VALUES ($1,$2,$2,'t','b',$3,$4)`,
        [
          "77777777-7777-4777-8777-777777777777",
          TARGET,
          `journey-private-media/${exclusivePath}`,
          THREAD,
        ]
      );

      const attemptId = await seedApprovedAcquiredInventory(client);
      await captureAndMarkDatabaseCompleted(client, REQUEST_ID, attemptId);
      await initResults(client, REQUEST_ID, attemptId);

      const manifest = await client.query<{ id: string }>(
        `SELECT id FROM public.account_deletion_storage_manifest
         WHERE execution_attempt_id = $1 AND disposition = 'DELETE_PRIVATE'`,
        [attemptId]
      );
      const manifestId = manifest.rows[0]!.id;
      const preserveId = (
        await client.query<{ id: string }>(
          `SELECT id FROM public.account_deletion_storage_manifest
           WHERE execution_attempt_id = $1 AND disposition = 'PRESERVE_PUBLIC' LIMIT 1`,
          [attemptId]
        )
      ).rows[0]?.id;

      if (preserveId) {
        expect(
          await asServiceRole<RpcPayload>(
            client,
            `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
            [REQUEST_ID, attemptId, preserveId]
          )
        ).toMatchObject({ ok: false, code: "not_delete_eligible" });
      }

      const claim1 = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [REQUEST_ID, attemptId, manifestId]
      );
      expect(claim1).toMatchObject({ ok: true, code: "claimed" });

      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
          [REQUEST_ID, attemptId, manifestId]
        )
      ).toMatchObject({ ok: false, code: "not_claimable" });

      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET claim_lease_expires_at = now() - interval '2 minutes'
         WHERE manifest_object_id = $1`,
        [manifestId]
      );

      const reclaim = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [REQUEST_ID, attemptId, manifestId]
      );
      expect(reclaim).toMatchObject({ ok: true, code: "claimed" });
    });
  }
);
