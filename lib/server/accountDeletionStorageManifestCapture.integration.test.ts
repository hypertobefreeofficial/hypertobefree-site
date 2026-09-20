import { createHash } from "node:crypto";
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
const THREAD = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OBJECT = "11111111-1111-4111-8111-111111111111";

type RpcPayload = {
  ok?: boolean;
  code?: string;
  disposition?: string;
  blocked_count?: number;
  delete_private_count?: number;
  has_block_unresolved?: boolean;
  object_count?: number;
  fingerprint?: string;
  ready?: boolean;
  detail?: string;
};

let serviceRoleGrantsApplied = false;
let authenticatedGrantsApplied = false;

async function ensureHashtextextendedStub(client: Client) {
  await client.query(`
    CREATE OR REPLACE FUNCTION public.hashtextextended(text, bigint)
    RETURNS bigint
    LANGUAGE sql
    IMMUTABLE PARALLEL SAFE STRICT
    AS $$ SELECT pg_catalog.hashtextextended($1, $2) $$;
  `);
}

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

async function cleanup(client: Client) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // ignore
  }
  await client.query(`
    TRUNCATE TABLE
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
         ($1,'target-cap@test.local','target_cap','Target',false,false),
         ($2,'other-cap@test.local','other_cap','Other',false,false),
         ($3,'owner-cap@test.local','owner_cap','Owner',false,false)
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

async function callStageRpcAsServiceRole(
  client: Client,
  rpcName: string,
  requestId: string,
  attemptId: string
): Promise<RpcPayload & { stage?: string }> {
  return asServiceRole<RpcPayload & { stage?: string }>(
    client,
    `SELECT public.${rpcName}($1::uuid, $2::uuid) AS payload`,
    [requestId, attemptId]
  );
}

async function seedActiveAttemptAtStage(
  client: Client,
  stage: "lock_acquired" | "sessions_pending" | "sessions_revoked" | "inventory",
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
      `
      INSERT INTO public.account_deletion_requests (
        id, user_id, status, target_username_snapshot, email
      ) VALUES ($1, $2, 'submitted', 'target_cap', $3)
      `,
      [requestId, TARGET, "target-cap@test.local"]
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
      `
      UPDATE public.account_deletion_requests
      SET status = 'approved', approved_at = now(), approved_by = $2,
          reviewed_at = now(), reviewed_by = $2
      WHERE id = $1 AND status = 'submitted'
      `,
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
      payload: { ok?: boolean; code?: string; attempt_id?: string };
    }>(
      `SELECT public.acquire_account_deletion_execution_lock($1::uuid, $2::uuid) AS payload`,
      [requestId, OWNER]
    );
    await client.query("COMMIT");
    const payload = acquired.rows[0]?.payload;
    expect(payload?.ok).toBe(true);
    attemptId = payload?.attempt_id ?? "";
    if (!attemptId) {
      throw new Error(`acquire failed: ${payload?.code ?? "unknown"}`);
    }
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  }

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
    const advanced = await callStageRpcAsServiceRole(
      client,
      rpcName,
      requestId,
      attemptId
    );
    expect(advanced.ok).toBe(true);
    expect(advanced.code).toBe("advanced");
  }

  const stageRow = await client.query<{ stage: string }>(
    `SELECT stage FROM public.account_deletion_execution_attempts WHERE id = $1`,
    [attemptId]
  );
  expect(stageRow.rows[0]?.stage).toBe(stage);

  return attemptId;
}

async function seedInventoryAttempt(
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
      `
      INSERT INTO public.account_deletion_requests (
        id, user_id, status, target_username_snapshot, email
      ) VALUES ($1, $2, 'submitted', 'target_cap', $3)
      `,
      [requestId, TARGET, "target-cap@test.local"]
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
      `
      UPDATE public.account_deletion_requests
      SET status = 'approved', approved_at = now(), approved_by = $2,
          reviewed_at = now(), reviewed_by = $2
      WHERE id = $1 AND status = 'submitted'
      `,
      [requestId, OWNER]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE service_role");
    const acquired = await client.query<{
      payload: { ok?: boolean; code?: string; attempt_id?: string };
    }>(
      `SELECT public.acquire_account_deletion_execution_lock($1::uuid, $2::uuid) AS payload`,
      [requestId, OWNER]
    );
    await client.query("COMMIT");
    const payload = acquired.rows[0]?.payload;
    expect(payload?.ok).toBe(true);
    const attemptId = payload?.attempt_id;
    if (!attemptId) {
      throw new Error(`acquire failed: ${payload?.code ?? "unknown"}`);
    }
    await client.query(
      `UPDATE public.account_deletion_execution_attempts
       SET stage = 'inventory', storage_manifest_status = NULL
       WHERE id = $1`,
      [attemptId]
    );
    return attemptId;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  }
}

async function insertJourneyObject(client: Client, objectPath: string) {
  await client.query(
    `INSERT INTO storage.objects (bucket_id, name, owner)
     VALUES ('journey-private-media', $1, $2)
     ON CONFLICT DO NOTHING`,
    [objectPath, TARGET]
  );
}

describeIntegration(
  `account deletion storage manifest capture (${ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV})`,
  () => {
    let client: Client;

    beforeAll(async () => {
      client = new Client({ connectionString: dbUrl! });
      await client.connect();
      await resetAccountDeletionIntegrationSchema(client);
      await applyAccountDeletionMigrations(client);
      await ensureHashtextextendedStub(client);
      await ensureServiceRole(client);
    }, 300_000);

    afterAll(async () => {
      await cleanup(client);
      await client?.end();
    });

    it("privilege matrix + readiness seals _inner from service_role", async () => {
      const matrix = await client.query<{
        fn: string;
        service_role: boolean;
        authenticated: boolean;
        anon: boolean;
        public_exec: boolean;
      }>(`
        SELECT f.fn,
          has_function_privilege('service_role', f.fn, 'EXECUTE') AS service_role,
          has_function_privilege('authenticated', f.fn, 'EXECUTE') AS authenticated,
          has_function_privilege('anon', f.fn, 'EXECUTE') AS anon,
          EXISTS (
            SELECT 1 FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
            WHERE p.oid = to_regprocedure(f.fn)
              AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
          ) AS public_exec
        FROM (VALUES
          ('public.capture_account_deletion_storage_manifest(uuid,uuid)'),
          ('public.account_deletion_storage_manifest_authoritative_write(uuid,uuid,uuid,text,text,text,text,text,text,boolean,text,text,integer,integer,text)'),
          ('public.account_deletion_storage_manifest_expected_inventory(uuid)'),
          ('public.account_deletion_journey_reference_evidence(uuid,text)'),
          ('public.verify_account_deletion_storage_manifest_ready_for_3b1(uuid,uuid)'),
          ('public.execute_account_deletion_nondestructive_database_stage(uuid,uuid)'),
          ('public.execute_account_deletion_nondestructive_database_stage_inner(uuid,uuid)'),
          ('public.verify_account_deletion_storage_manifest_capture_ready()')
        ) AS f(fn)
      `);

      const byFn = Object.fromEntries(
        matrix.rows.map((r) => [r.fn, r])
      );
      expect(
        byFn[
          "public.execute_account_deletion_nondestructive_database_stage_inner(uuid,uuid)"
        ]
      ).toMatchObject({
        service_role: false,
        authenticated: false,
        anon: false,
        public_exec: false,
      });
      expect(
        byFn[
          "public.account_deletion_storage_manifest_authoritative_write(uuid,uuid,uuid,text,text,text,text,text,text,boolean,text,text,integer,integer,text)"
        ]
      ).toMatchObject({ service_role: false, public_exec: false });
      expect(
        byFn[
          "public.account_deletion_storage_manifest_expected_inventory(uuid)"
        ]
      ).toMatchObject({ service_role: false });
      expect(
        byFn["public.capture_account_deletion_storage_manifest(uuid,uuid)"]
      ).toMatchObject({ service_role: true });
      expect(
        byFn[
          "public.execute_account_deletion_nondestructive_database_stage(uuid,uuid)"
        ]
      ).toMatchObject({ service_role: true });

      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL ROLE service_role");
        await expect(
          client.query(
            `SELECT public.execute_account_deletion_nondestructive_database_stage_inner(
              '00000000-0000-4000-8000-000000000001'::uuid,
              '00000000-0000-4000-8000-000000000002'::uuid
            )`
          )
        ).rejects.toThrow(/permission denied/i);
      } finally {
        await client.query("ROLLBACK");
      }

      const ready = await asServiceRole<{
        ready?: boolean;
        prerequisites?: Array<{ id?: string; ready?: boolean }>;
      }>(
        client,
        `SELECT public.verify_account_deletion_storage_manifest_capture_ready() AS payload`
      );
      expect(ready.ready).toBe(true);
      expect(
        ready.prerequisites?.find(
          (p) => p.id === "storage_manifest_3b1_inner_not_caller_executable"
        )?.ready
      ).toBe(true);

      // Negative: restore grant temporarily → readiness false
      await client.query("BEGIN");
      try {
        await client.query(`
          GRANT EXECUTE ON FUNCTION
            public.execute_account_deletion_nondestructive_database_stage_inner(uuid, uuid)
          TO service_role
        `);
        const bad = await client.query<{ payload: { ready?: boolean } }>(
          `SELECT public.verify_account_deletion_storage_manifest_capture_ready() AS payload`
        );
        expect(bad.rows[0]?.payload?.ready).toBe(false);
      } finally {
        await client.query(`
          REVOKE ALL ON FUNCTION
            public.execute_account_deletion_nondestructive_database_stage_inner(uuid, uuid)
          FROM service_role
        `);
        await client.query("ROLLBACK");
      }
    });

    it("CAP-A/P/Q/T + GATE-A/G: empty capture; foundation ban; idempotent finalize; 3B.1 gated", async () => {
      await cleanup(client);
      await seedUsers(client);
      const attemptId = await seedInventoryAttempt(client);

      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.execute_account_deletion_nondestructive_database_stage($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({ ok: false, code: "storage_manifest_not_finalized" });

      const captured = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );
      expect(captured).toMatchObject({
        ok: true,
        object_count: 0,
        blocked_count: 0,
        has_block_unresolved: false,
      });
      expect(captured.fingerprint).toBe(
        createHash("sha256").update("[]", "utf8").digest("hex")
      );

      const again = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );
      expect(again).toMatchObject({
        ok: true,
        code: "already_finalized",
        fingerprint: captured.fingerprint,
        object_count: 0,
      });

      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.upsert_account_deletion_storage_manifest_object(
            $1::uuid,$2::uuid,'journey-private-media',$3::text,'journey_private_media','x',
            'DELETE_PRIVATE','nope',false,NULL,'exclusive',1,0,'abc'
          ) AS payload`,
          [REQUEST_ID, attemptId, `${TARGET}/${THREAD}/${OBJECT}.mp4`]
        )
      ).toMatchObject({
        ok: false,
        code: "delete_authority_not_available_in_foundation",
      });

      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.execute_account_deletion_nondestructive_database_stage($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({ ok: true });
    });

    it("CAP-B/C/G/I/J/K/M + GATE-F/I + storage existence: avatar/story/journey", async () => {
      await cleanup(client);
      await seedUsers(client);

      await client.query(
        `UPDATE public.profiles SET avatar_url = $2 WHERE id = $1`,
        [TARGET, `profile-avatars/${TARGET}/avatar.png`]
      );
      await client.query(
        `INSERT INTO public.stories (id, user_id, name, email, story_text, image_url, video_url, thumbnail_url, status)
         VALUES ($1,$2,'n','e@t','body',$3,$4,$5,'approved')`,
        [
          "ffffffff-ffff-4fff-8fff-ffffffffffff",
          TARGET,
          `story-images/${TARGET}/img.png`,
          `story-videos/${TARGET}/vid.mp4`,
          `story-thumbnails/${TARGET}/thumb.jpg`,
        ]
      );

      const exclusivePath = `${TARGET}/${THREAD}/${OBJECT}.mp4`;
      const sharedPath = `${TARGET}/${THREAD}/22222222-2222-4222-8222-222222222222.mp4`;
      const foreignPath = `${OTHER}/${THREAD}/33333333-3333-4333-8333-333333333333.mp4`;
      await insertJourneyObject(client, exclusivePath);
      await insertJourneyObject(client, sharedPath);

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
        `INSERT INTO public.inbox_messages (id, user_id, sender_user_id, title, body, video_url)
         VALUES ($1,$2,$3,'recv','b',$4)`,
        [
          "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
          TARGET,
          OTHER,
          `journey-private-media/${foreignPath}`,
        ]
      );

      const attemptId = await seedInventoryAttempt(client);
      const captured = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );
      expect(captured.ok).toBe(true);
      expect(captured.has_block_unresolved).toBe(false);
      expect(captured.delete_private_count).toBeGreaterThanOrEqual(1);

      const rows = await client.query<{
        object_path: string;
        disposition: string;
        media_category: string;
        reference_fingerprint: string | null;
      }>(
        `SELECT object_path, disposition, media_category, reference_fingerprint
         FROM public.account_deletion_storage_manifest
         WHERE execution_attempt_id = $1
         ORDER BY object_path`,
        [attemptId]
      );

      expect(
        rows.rows.find((r) => r.object_path === `${TARGET}/avatar.png`)
      ).toMatchObject({
        disposition: "DEFER_PROFILE",
        media_category: "profile_avatar",
      });
      expect(
        rows.rows.find((r) => r.object_path === `${TARGET}/img.png`)
      ).toMatchObject({ disposition: "PRESERVE_PUBLIC" });
      expect(
        rows.rows.find((r) => r.object_path === exclusivePath)
      ).toMatchObject({ disposition: "DELETE_PRIVATE" });
      expect(
        rows.rows.find((r) => r.object_path === exclusivePath)
          ?.reference_fingerprint
      ).toMatch(/^[a-f0-9]{64}$/);
      expect(
        rows.rows.find((r) => r.object_path === sharedPath)
      ).toMatchObject({ disposition: "PRESERVE_SHARED" });
      expect(
        rows.rows.find((r) => r.object_path === foreignPath)
      ).toMatchObject({ disposition: "PRESERVE_SHARED" });

      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.verify_account_deletion_storage_manifest_ready_for_3b1($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({ ok: true, code: "manifest_ready_for_3b1" });

      await client.query(
        `ALTER TABLE public.inbox_messages DISABLE TRIGGER USER`
      );
      try {
        await client.query(
          `INSERT INTO public.inbox_messages (id, user_id, sender_user_id, title, body, video_url)
           VALUES ($1,$2,$3,'late','b',$4)`,
          [
            "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb",
            OTHER,
            TARGET,
            `journey-private-media/${exclusivePath}`,
          ]
        );
      } finally {
        await client.query(
          `ALTER TABLE public.inbox_messages ENABLE TRIGGER USER`
        );
      }
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.verify_account_deletion_storage_manifest_ready_for_3b1($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({ ok: false, code: "storage_manifest_state_drift" });
    });

    it("CAP-F/GATE-F: prefix orphan storage.objects → BLOCK_UNRESOLVED blocks 3B.1", async () => {
      await cleanup(client);
      await seedUsers(client);
      await client.query(
        `INSERT INTO storage.objects (bucket_id, name, owner)
         VALUES ('journey-private-media', $1, $2)`,
        [`${TARGET}/${THREAD}/orphan.mp4`, TARGET]
      );
      const attemptId = await seedInventoryAttempt(client);
      const captured = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );
      expect(captured).toMatchObject({
        ok: true,
        has_block_unresolved: true,
      });
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.execute_account_deletion_nondestructive_database_stage($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({ ok: false, code: "storage_manifest_blocked" });
    });

    it("CAP-D prayer video+thumb PRESERVE_PUBLIC; unparseable fails closed", async () => {
      await cleanup(client);
      await seedUsers(client);
      const prayerId = "12121212-1212-4121-8121-121212121212";
      const storyId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
      await client.query(
        `INSERT INTO public.stories (id, user_id, name, email, story_text, status)
         VALUES ($1,$2,'n','e@t','body','approved')`,
        [storyId, TARGET]
      );
      await client.query(
        `INSERT INTO public.prayer_video_responses (
           id, user_id, story_id, video_url, thumbnail_url, body
         ) VALUES ($1,$2,$3,$4,$5,'prayer')`,
        [
          prayerId,
          TARGET,
          storyId,
          `story-videos/${TARGET}/prayer.mp4`,
          `story-thumbnails/${TARGET}/prayer-thumb.jpg`,
        ]
      );

      const attemptId = await seedInventoryAttempt(client);
      const captured = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );
      expect(captured.ok).toBe(true);
      expect(captured.delete_private_count ?? 0).toBe(0);
      const rows = await client.query<{
        object_path: string;
        disposition: string;
        media_category: string;
      }>(
        `SELECT object_path, disposition, media_category
         FROM public.account_deletion_storage_manifest
         WHERE execution_attempt_id = $1`,
        [attemptId]
      );
      expect(
        rows.rows.find((r) => r.object_path === `${TARGET}/prayer.mp4`)
      ).toMatchObject({
        disposition: "PRESERVE_PUBLIC",
        media_category: "prayer_video",
      });
      expect(
        rows.rows.find(
          (r) => r.object_path === `${TARGET}/prayer-thumb.jpg`
        )
      ).toMatchObject({
        disposition: "PRESERVE_PUBLIC",
        media_category: "prayer_thumbnail",
      });

      // Unparseable prayer URL → fail closed
      await cleanup(client);
      await seedUsers(client);
      await client.query(
        `INSERT INTO public.stories (id, user_id, name, email, story_text, status)
         VALUES ($1,$2,'n','e@t','body','approved')`,
        [storyId, TARGET]
      );
      await client.query(
        `INSERT INTO public.prayer_video_responses (
           id, user_id, story_id, video_url, thumbnail_url, body
         ) VALUES ($1,$2,$3,$4,$5,'prayer')`,
        [
          prayerId,
          TARGET,
          storyId,
          "https://cdn.example/prayer.mp4",
          `story-thumbnails/${TARGET}/prayer-thumb.jpg`,
        ]
      );
      const attempt2 = await seedInventoryAttempt(client);
      const bad = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attempt2]
      );
      expect(bad).toMatchObject({
        ok: false,
        code: "storage_manifest_unresolved_media_reference",
      });
      const capStatus = await client.query<{ status: string }>(
        `SELECT status FROM public.account_deletion_storage_manifest_capture
         WHERE execution_attempt_id = $1`,
        [attempt2]
      );
      expect(capStatus.rows[0]?.status).toBe("open");
    });

    it("CAP-E Creator Studio story → PRESERVE_PUBLIC creator_studio_media", async () => {
      await cleanup(client);
      await seedUsers(client);
      await client.query(
        `INSERT INTO public.stories (
           id, user_id, name, email, story_text, image_url, status,
           creation_mode, ai_suggestions
         ) VALUES (
           $1,$2,'n','e@t','body',$3,'approved',
           'creator-studio',
           $4::jsonb
         )`,
        [
          "ffffffff-ffff-4fff-8fff-ffffffffffff",
          TARGET,
          `story-images/${TARGET}/cs.png`,
          JSON.stringify({
            sourceMode: "upload-photo",
            layers: [{ type: "text", text: "hello" }],
          }),
        ]
      );
      await client.query(
        `INSERT INTO storage.objects (bucket_id, name, owner)
         VALUES ('story-images', $1, $2)`,
        [`${TARGET}/cs.png`, TARGET]
      );
      const attemptId = await seedInventoryAttempt(client);
      const captured = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );
      expect(captured.ok).toBe(true);
      const row = await client.query<{
        disposition: string;
        media_category: string;
      }>(
        `SELECT disposition, media_category FROM public.account_deletion_storage_manifest
         WHERE execution_attempt_id = $1 AND object_path = $2`,
        [attemptId, `${TARGET}/cs.png`]
      );
      expect(row.rows[0]).toMatchObject({
        disposition: "PRESERVE_PUBLIC",
        media_category: "creator_studio_media",
      });
    });

    it("CAP-N/O/X dual media + fingerprint determinism/change", async () => {
      await cleanup(client);
      await seedUsers(client);
      const videoPath = `${TARGET}/${THREAD}/dual-video.mp4`;
      const imagePath = `${TARGET}/${THREAD}/dual-image.png`;
      await insertJourneyObject(client, videoPath);
      await insertJourneyObject(client, imagePath);
      const msgId = "77777777-7777-4777-8777-777777777777";
      await client.query(
        `INSERT INTO public.inbox_messages (
           id, user_id, sender_user_id, title, body, video_url, image_url, thread_id
         ) VALUES ($1,$2,$2,'t','b',$3,$4,$5)`,
        [
          msgId,
          TARGET,
          `journey-private-media/${videoPath}`,
          `journey-private-media/${imagePath}`,
          THREAD,
        ]
      );

      // evidence helper is not service_role-executable — call as postgres owner
      const ev1 = await client.query<{
        payload: {
          reference_fingerprint: string;
          total_reference_count: number;
        };
      }>(
        `SELECT public.account_deletion_journey_reference_evidence($1::uuid, $2::text) AS payload`,
        [TARGET, videoPath]
      );
      const ev1b = await client.query<{
        payload: { reference_fingerprint: string };
      }>(
        `SELECT public.account_deletion_journey_reference_evidence($1::uuid, $2::text) AS payload`,
        [TARGET, videoPath]
      );
      expect(ev1.rows[0].payload.reference_fingerprint).toBe(
        ev1b.rows[0].payload.reference_fingerprint
      );
      expect(ev1.rows[0].payload.total_reference_count).toBe(1);

      const evImage = await client.query<{
        payload: { total_reference_count: number; reference_fingerprint: string };
      }>(
        `SELECT public.account_deletion_journey_reference_evidence($1::uuid, $2::text) AS payload`,
        [TARGET, imagePath]
      );
      expect(evImage.rows[0].payload.total_reference_count).toBe(1);
      expect(evImage.rows[0].payload.reference_fingerprint).not.toBe(
        ev1.rows[0].payload.reference_fingerprint
      );

      const attemptId = await seedInventoryAttempt(client);
      const captured = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );
      expect(captured.ok).toBe(true);
      const paths = await client.query<{ object_path: string; disposition: string }>(
        `SELECT object_path, disposition FROM public.account_deletion_storage_manifest
         WHERE execution_attempt_id = $1 AND bucket = 'journey-private-media'
         ORDER BY object_path`,
        [attemptId]
      );
      expect(paths.rows.map((r) => r.object_path).sort()).toEqual(
        [imagePath, videoPath].sort()
      );
      expect(paths.rows.every((r) => r.disposition === "DELETE_PRIVATE")).toBe(
        true
      );

      // CAP-O: change path → fingerprint changes
      await client.query(
        `ALTER TABLE public.inbox_messages DISABLE TRIGGER USER`
      );
      try {
        await client.query(
          `UPDATE public.inbox_messages SET video_url = $2 WHERE id = $1`,
          [msgId, `journey-private-media/${TARGET}/${THREAD}/changed.mp4`]
        );
      } finally {
        await client.query(
          `ALTER TABLE public.inbox_messages ENABLE TRIGGER USER`
        );
      }
      const evChanged = await client.query<{
        payload: { reference_fingerprint: string; total_reference_count: number };
      }>(
        `SELECT public.account_deletion_journey_reference_evidence($1::uuid, $2::text) AS payload`,
        [TARGET, videoPath]
      );
      expect(evChanged.rows[0].payload.total_reference_count).toBe(0);
    });

    it("CAP-W exact storage existence required for DELETE_PRIVATE", async () => {
      await cleanup(client);
      await seedUsers(client);
      const exclusivePath = `${TARGET}/${THREAD}/${OBJECT}.mp4`;
      await client.query(
        `INSERT INTO public.inbox_messages (id, user_id, sender_user_id, title, body, video_url)
         VALUES ($1,$2,$2,'t','b',$3)`,
        [
          "77777777-7777-4777-8777-777777777777",
          TARGET,
          `journey-private-media/${exclusivePath}`,
        ]
      );
      const attemptId = await seedInventoryAttempt(client);
      const without = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );
      expect(without.ok).toBe(true);
      const blocked = await client.query<{ disposition: string }>(
        `SELECT disposition FROM public.account_deletion_storage_manifest
         WHERE execution_attempt_id = $1 AND object_path = $2`,
        [attemptId, exclusivePath]
      );
      expect(blocked.rows[0]?.disposition).toBe("BLOCK_UNRESOLVED");

      await cleanup(client);
      await seedUsers(client);
      await insertJourneyObject(client, exclusivePath);
      await client.query(
        `INSERT INTO public.inbox_messages (id, user_id, sender_user_id, title, body, video_url)
         VALUES ($1,$2,$2,'t','b',$3)`,
        [
          "77777777-7777-4777-8777-777777777777",
          TARGET,
          `journey-private-media/${exclusivePath}`,
        ]
      );
      const attempt2 = await seedInventoryAttempt(client);
      const withObj = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attempt2]
      );
      expect(withObj.delete_private_count).toBeGreaterThanOrEqual(1);
      const ok = await client.query<{ disposition: string }>(
        `SELECT disposition FROM public.account_deletion_storage_manifest
         WHERE execution_attempt_id = $1 AND object_path = $2`,
        [attempt2, exclusivePath]
      );
      expect(ok.rows[0]?.disposition).toBe("DELETE_PRIVATE");
    });

    it("CAP-Q: capture RPC refused outside inventory; succeeds after advance to inventory", async () => {
      await cleanup(client);
      await seedUsers(client);
      const attemptId = await seedActiveAttemptAtStage(
        client,
        "sessions_revoked"
      );

      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({ ok: false, code: "invalid_stage" });

      const stageAfter = await client.query<{ stage: string }>(
        `SELECT stage FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [attemptId]
      );
      expect(stageAfter.rows[0]?.stage).toBe("sessions_revoked");

      const captureRows = await client.query<{ status: string | null }>(
        `SELECT status FROM public.account_deletion_storage_manifest_capture
         WHERE execution_attempt_id = $1`,
        [attemptId]
      );
      expect(captureRows.rows).toHaveLength(0);

      const manifestObjects = await client.query<{ c: number }>(
        `SELECT count(*)::int AS c FROM public.account_deletion_storage_manifest
         WHERE execution_attempt_id = $1`,
        [attemptId]
      );
      expect(manifestObjects.rows[0]?.c).toBe(0);

      const advanced = await callStageRpcAsServiceRole(
        client,
        "advance_account_deletion_attempt_to_inventory",
        REQUEST_ID,
        attemptId
      );
      expect(advanced).toMatchObject({ ok: true, code: "advanced", stage: "inventory" });

      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({ ok: true });
    });

    it("CAP-R request not in progress refuses capture", async () => {
      await cleanup(client);
      await seedUsers(client);
      const attemptId = await seedInventoryAttempt(client);
      await client.query(
        `UPDATE public.account_deletion_requests SET status = 'approved' WHERE id = $1`,
        [REQUEST_ID]
      );
      // may need to bypass triggers
      await client.query(
        `ALTER TABLE public.account_deletion_requests DISABLE TRIGGER USER`
      );
      try {
        await client.query(
          `UPDATE public.account_deletion_requests SET status = 'approved' WHERE id = $1`,
          [REQUEST_ID]
        );
      } finally {
        await client.query(
          `ALTER TABLE public.account_deletion_requests ENABLE TRIGGER USER`
        );
      }
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({ ok: false, code: "request_not_in_progress" });
    });

    it("CAP-S/GATE-K stale attempt cannot capture or authorize 3B.1 via wrapper", async () => {
      await cleanup(client);
      await seedUsers(client);
      const storyId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
      await client.query(
        `INSERT INTO public.stories (id, user_id, name, email, story_text, video_url, status)
         VALUES ($1,$2,'Author','e@t','body',$3,'approved')`,
        [storyId, TARGET, `story-videos/${TARGET}/stale-cap.mp4`]
      );

      const attemptId = await seedActiveAttemptAtStage(client, "inventory");
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({ ok: true });

      await client.query(
        `UPDATE public.account_deletion_execution_attempts
         SET status = 'failed', last_error_code = 'execution_cancelled'
         WHERE id = $1`,
        [attemptId]
      );

      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({ ok: false, code: "attempt_not_active" });

      const storyBefore = await client.query<{ user_id: string }>(
        `SELECT user_id FROM public.stories WHERE id = $1`,
        [storyId]
      );
      const freezeBefore = await client.query<{ c: number }>(
        `SELECT count(*)::int AS c FROM public.account_deletion_story_freeze_scope
         WHERE deletion_request_id = $1`,
        [REQUEST_ID]
      );
      const contextBefore = await client.query<{ c: number }>(
        `SELECT count(*)::int AS c FROM public.account_deletion_database_execution_context
         WHERE attempt_id = $1`,
        [attemptId]
      );

      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.execute_account_deletion_nondestructive_database_stage($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({ ok: false, code: "attempt_mismatch" });

      const storyAfter = await client.query<{ user_id: string }>(
        `SELECT user_id FROM public.stories WHERE id = $1`,
        [storyId]
      );
      expect(storyAfter.rows[0]).toEqual(storyBefore.rows[0]);
      expect(storyAfter.rows[0]?.user_id).toBe(TARGET);

      const freezeAfter = await client.query<{ c: number }>(
        `SELECT count(*)::int AS c FROM public.account_deletion_story_freeze_scope
         WHERE deletion_request_id = $1`,
        [REQUEST_ID]
      );
      expect(freezeAfter.rows[0]?.c).toBe(freezeBefore.rows[0]?.c);

      const contextAfter = await client.query<{ c: number }>(
        `SELECT count(*)::int AS c FROM public.account_deletion_database_execution_context
         WHERE attempt_id = $1`,
        [attemptId]
      );
      expect(contextAfter.rows[0]?.c).toBe(contextBefore.rows[0]?.c);

      const attemptStage = await client.query<{ stage: string; status: string }>(
        `SELECT stage, status FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [attemptId]
      );
      expect(attemptStage.rows[0]).toMatchObject({
        stage: "inventory",
        status: "failed",
      });
    });

    it("GATE-B open manifest refuses 3B.1 before mutation", async () => {
      await cleanup(client);
      await seedUsers(client);
      const attemptId = await seedInventoryAttempt(client);
      await asServiceRole(
        client,
        `SELECT public.initialize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );
      const before = await client.query<{ user_id: string | null }>(
        `SELECT id::text AS user_id FROM public.profiles WHERE id = $1`,
        [TARGET]
      );
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.execute_account_deletion_nondestructive_database_stage($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({ ok: false, code: "storage_manifest_not_finalized" });
      const after = await client.query<{ user_id: string | null }>(
        `SELECT id::text AS user_id FROM public.profiles WHERE id = $1`,
        [TARGET]
      );
      expect(after.rows[0]).toEqual(before.rows[0]);
      const stories = await client.query(
        `SELECT count(*)::int AS c FROM public.stories WHERE user_id = $1`,
        [TARGET]
      );
      expect(stories.rows[0].c).toBe(0);
    });

    it("GATE-D/E fingerprint and count drift refuse 3B.1", async () => {
      await cleanup(client);
      await seedUsers(client);
      const attemptId = await seedInventoryAttempt(client);
      await asServiceRole<RpcPayload>(
        client,
        `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );

      // Fingerprint drift via test-owner direct update on attempt columns
      await client.query(
        `UPDATE public.account_deletion_execution_attempts
         SET storage_manifest_fingerprint = repeat('0', 64)
         WHERE id = $1`,
        [attemptId]
      );
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.verify_account_deletion_storage_manifest_ready_for_3b1($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({ ok: false, code: "storage_manifest_integrity_failed" });

      // Restore fingerprint, drift count
      const realFp = await client.query<{ fingerprint: string }>(
        `SELECT fingerprint FROM public.account_deletion_storage_manifest_capture
         WHERE execution_attempt_id = $1`,
        [attemptId]
      );
      await client.query(
        `UPDATE public.account_deletion_execution_attempts
         SET storage_manifest_fingerprint = $2, storage_objects_expected = 99
         WHERE id = $1`,
        [attemptId, realFp.rows[0].fingerprint]
      );
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.verify_account_deletion_storage_manifest_ready_for_3b1($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({ ok: false, code: "storage_manifest_integrity_failed" });
    });

    it("GATE-Z/AA prefix + DB-reference TOCTOU refuse before mutation", async () => {
      await cleanup(client);
      await seedUsers(client);
      const attemptId = await seedInventoryAttempt(client);
      await asServiceRole<RpcPayload>(
        client,
        `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );

      // Prefix TOCTOU: privileged insert of new target-prefix object
      await client.query(
        `INSERT INTO storage.objects (bucket_id, name, owner)
         VALUES ('journey-private-media', $1, $2)`,
        [`${TARGET}/${THREAD}/toctou-orphan.mp4`, TARGET]
      );
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.verify_account_deletion_storage_manifest_ready_for_3b1($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({ ok: false, code: "storage_manifest_state_drift" });

      await cleanup(client);
      await seedUsers(client);
      const attempt2 = await seedInventoryAttempt(client);
      await asServiceRole<RpcPayload>(
        client,
        `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attempt2]
      );
      // DB reference TOCTOU: privileged story media insert
      await client.query(
        `ALTER TABLE public.stories DISABLE TRIGGER USER`
      );
      try {
        await client.query(
          `INSERT INTO public.stories (id, user_id, name, email, story_text, image_url, status)
           VALUES ($1,$2,'n','e@t','body',$3,'approved')`,
          [
            "ffffffff-ffff-4fff-8fff-ffffffffffff",
            TARGET,
            `story-images/${TARGET}/late.png`,
          ]
        );
      } finally {
        await client.query(`ALTER TABLE public.stories ENABLE TRIGGER USER`);
      }
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.verify_account_deletion_storage_manifest_ready_for_3b1($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attempt2]
        )
      ).toMatchObject({ ok: false, code: "storage_manifest_state_drift" });
    });

    it("GATE-C attempt A/B isolation: A manifest never authorizes B", async () => {
      await cleanup(client);
      await seedUsers(client);
      const attemptA = await seedInventoryAttempt(client);
      const capA = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptA]
      );
      expect(capA.ok).toBe(true);

      // Owner cancel
      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL ROLE service_role");
        const cancelled = await client.query<{ payload: RpcPayload }>(
          `SELECT public.cancel_account_deletion_execution($1::uuid,$2::uuid,$3::uuid) AS payload`,
          [REQUEST_ID, attemptA, OWNER]
        );
        await client.query("COMMIT");
        expect(cancelled.rows[0]?.payload?.ok).toBe(true);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }

      // Re-approve + reacquire B
      await client.query(
        `ALTER TABLE public.account_deletion_requests DISABLE TRIGGER USER`
      );
      try {
        await client.query(
          `UPDATE public.account_deletion_requests
           SET status = 'approved', approved_at = now(), approved_by = $2
           WHERE id = $1`,
          [REQUEST_ID, OWNER]
        );
      } finally {
        await client.query(
          `ALTER TABLE public.account_deletion_requests ENABLE TRIGGER USER`
        );
      }

      await client.query("BEGIN");
      let attemptB: string;
      try {
        await client.query("SET LOCAL ROLE service_role");
        const acquired = await client.query<{
          payload: { ok?: boolean; attempt_id?: string; code?: string };
        }>(
          `SELECT public.acquire_account_deletion_execution_lock($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, OWNER]
        );
        await client.query("COMMIT");
        expect(acquired.rows[0]?.payload?.ok).toBe(true);
        attemptB = acquired.rows[0]!.payload!.attempt_id!;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }

      await client.query(
        `UPDATE public.account_deletion_execution_attempts
         SET stage = 'inventory' WHERE id = $1`,
        [attemptB]
      );

      expect(attemptB).not.toBe(attemptA);
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.execute_account_deletion_nondestructive_database_stage($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptB]
        )
      ).toMatchObject({ ok: false, code: "storage_manifest_not_finalized" });

      // Historical A must not authorize B via gate helper either
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.verify_account_deletion_storage_manifest_ready_for_3b1($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptB]
        )
      ).toMatchObject({ ok: false, code: "storage_manifest_not_finalized" });

      const capB = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptB]
      );
      expect(capB.ok).toBe(true);
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.execute_account_deletion_nondestructive_database_stage($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptB]
        )
      ).toMatchObject({ ok: true });
    });

    it("unparseable story media fails closed (never silent finalize)", async () => {
      await cleanup(client);
      await seedUsers(client);
      await client.query(
        `INSERT INTO public.stories (id, user_id, name, email, story_text, image_url, status)
         VALUES ($1,$2,'n','e@t','body',$3,'approved')`,
        [
          "ffffffff-ffff-4fff-8fff-ffffffffffff",
          TARGET,
          "https://cdn.example/broken.png",
        ]
      );
      const attemptId = await seedInventoryAttempt(client);
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({
        ok: false,
        code: "storage_manifest_unresolved_media_reference",
      });
    });
  }
);
