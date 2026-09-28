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

type RpcPayload = Record<string, unknown>;

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

async function asAuthenticated<T>(
  client: Client,
  userId: string,
  sql: string,
  params: unknown[] = [],
  jwtExtra: Record<string, string> = {}
): Promise<T> {
  await ensureAuthenticatedGrants(client);
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, ...jwtExtra }),
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
         ($1,'target-ex@test.local','target_ex','Target',false,false),
         ($2,'other-ex@test.local','other_ex','Other',false,false),
         ($3,'owner-ex@test.local','owner_ex','Owner',false,false)
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

async function seedAttempt(client: Client): Promise<string> {
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
      ) VALUES ($1, $2, 'submitted', 'target_ex', $3)`,
      [REQUEST_ID, TARGET, "target-ex@test.local"]
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
      [REQUEST_ID, OWNER]
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
      [REQUEST_ID, OWNER]
    );
    await client.query("COMMIT");
    attemptId = acquired.rows[0]?.payload?.attempt_id ?? "";
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  for (const rpc of [
    "advance_account_deletion_attempt_to_sessions_pending",
    "advance_account_deletion_attempt_to_sessions_revoked",
    "advance_account_deletion_attempt_to_inventory",
  ]) {
    await asServiceRole<RpcPayload>(
      client,
      `SELECT public.${rpc}($1::uuid, $2::uuid) AS payload`,
      [REQUEST_ID, attemptId]
    );
  }

  await asServiceRole(client, `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`, [
    REQUEST_ID,
    attemptId,
  ]);
  await client.query(
    `UPDATE public.account_deletion_execution_attempts SET stage = 'database_completed' WHERE id = $1`,
    [attemptId]
  );
  await asServiceRole(
    client,
    `SELECT public.initialize_account_deletion_storage_execution_results($1::uuid,$2::uuid) AS payload`,
    [REQUEST_ID, attemptId]
  );

  return attemptId;
}

async function seedDeletePrivateFixture(client: Client) {
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
  const attemptId = await seedAttempt(client);
  const manifest = await client.query<{ id: string; bucket: string; object_path: string }>(
    `SELECT id, bucket, object_path FROM public.account_deletion_storage_manifest
     WHERE execution_attempt_id = $1 AND disposition = 'DELETE_PRIVATE' LIMIT 1`,
    [attemptId]
  );
  const result = await client.query<{ id: string }>(
    `SELECT id FROM public.account_deletion_storage_execution_results
     WHERE manifest_object_id = $1`,
    [manifest.rows[0]!.id]
  );
  return {
    attemptId,
    manifestId: manifest.rows[0]!.id,
    resultId: result.rows[0]!.id,
    objectPath: manifest.rows[0]!.object_path,
  };
}

async function cloneDeletePrivateResult(
  client: Client,
  requestId: string,
  attemptId: string,
  templateManifestId: string,
  pathSuffix: string
): Promise<{ manifestId: string; resultId: string }> {
  const template = await client.query<{
    target_user_id: string;
    bucket: string;
    object_path: string;
    media_category: string;
    ownership_basis: string;
    disposition_reason: string;
    reference_fingerprint: string;
    total_reference_count: number;
    status: string;
  }>(
    `SELECT target_user_id, bucket, object_path, media_category, ownership_basis,
            disposition_reason, reference_fingerprint, total_reference_count, status
     FROM public.account_deletion_storage_manifest WHERE id = $1`,
    [templateManifestId]
  );
  const t = template.rows[0]!;
  const newPath = `${t.object_path.replace(/\.mp4$/, "")}-${pathSuffix}.mp4`;
  await insertJourneyObject(client, newPath);
  await client.query(`SET session_replication_role = replica`);
  const manifestId = (
    await client.query<{ id: string }>(
      `INSERT INTO public.account_deletion_storage_manifest (
        deletion_request_id, execution_attempt_id, target_user_id, bucket, object_path,
        media_category, ownership_basis, disposition, disposition_reason,
        preservation_required, reference_state, total_reference_count, surviving_reference_count,
        reference_fingerprint, status
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,'DELETE_PRIVATE',$8,false,'exclusive',$9,0,$10,$11
      ) RETURNING id`,
      [
        requestId,
        attemptId,
        t.target_user_id,
        t.bucket,
        newPath,
        t.media_category,
        t.ownership_basis,
        t.disposition_reason,
        t.total_reference_count,
        t.reference_fingerprint,
        t.status,
      ]
    )
  ).rows[0]!.id;
  const resultId = (
    await client.query<{ id: string }>(
      `INSERT INTO public.account_deletion_storage_execution_results (
        deletion_request_id, execution_attempt_id, manifest_object_id, target_user_id,
        bucket, object_path, disposition_snapshot, preservation_required_snapshot, execution_state
      ) VALUES ($1,$2,$3,$4,$5,$6,'DELETE_PRIVATE',false,'pending')
      RETURNING id`,
      [requestId, attemptId, manifestId, t.target_user_id, t.bucket, newPath]
    )
  ).rows[0]!.id;
  await client.query(`SET session_replication_role = DEFAULT`);
  return { manifestId, resultId };
}

describeIntegration(
  `account deletion storage executor (${ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV})`,
  () => {
    let client: Client;

    beforeAll(async () => {
      client = new Client({ connectionString: dbUrl! });
      await client.connect();
      await resetAccountDeletionIntegrationSchema(client);
      await applyAccountDeletionMigrations(client);
      await client.query(`
        CREATE OR REPLACE FUNCTION public.hashtextextended(text, bigint)
        RETURNS bigint LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
        AS $$ SELECT pg_catalog.hashtextextended($1, $2) $$;
      `);
      await ensureServiceRole(client);
    });

    afterAll(async () => {
      await cleanup(client);
      await client?.end();
    });

    it("executor readiness + schema compose", async () => {
      const ready = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.verify_account_deletion_storage_executor_ready() AS payload`
      );
      expect(ready.ready).toBe(true);

      const schema = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.verify_account_deletion_schema_execution_ready() AS payload`
      );
      expect(schema.ready).toBe(true);
    });

    it("HD-A/B: non-owner cannot create/release hold", async () => {
      await cleanup(client);
      await seedUsers(client);
      const { attemptId, manifestId } = await seedDeletePrivateFixture(client);

      expect(
        await asAuthenticated<RpcPayload>(
          client,
          OTHER,
          `SELECT public.create_account_deletion_storage_preservation_hold(
            $1::uuid,'manifest_object'::text,'legal_hold'::text,$2::uuid,$3::uuid,NULL
          ) AS payload`,
          [REQUEST_ID, attemptId, manifestId]
        )
      ).toMatchObject({ ok: false, code: "owner_required" });

      const hold = await asAuthenticated<RpcPayload>(
        client,
        OWNER,
        `SELECT public.create_account_deletion_storage_preservation_hold(
          $1::uuid,'manifest_object'::text,'legal_hold'::text,$2::uuid,$3::uuid,NULL
        ) AS payload`,
        [REQUEST_ID, attemptId, manifestId]
      );
      expect(hold.ok).toBe(true);

      expect(
        await asAuthenticated<RpcPayload>(
          client,
          OTHER,
          `SELECT public.release_account_deletion_storage_preservation_hold($1::uuid) AS payload`,
          [hold.hold_id],
          { aal: "aal2" }
        )
      ).toMatchObject({ ok: false, code: "owner_required" });
    });

    it("HD-D: service_role cannot spoof inner hold RPC", async () => {
      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL ROLE service_role");
        await expect(
          client.query(
            `SELECT public.create_account_deletion_storage_preservation_hold_inner(
              $1::uuid,$2::uuid,'manifest_object'::text,'x',$3::uuid,$4::uuid,NULL
            )`,
            [REQUEST_ID, OWNER, "00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"]
          )
        ).rejects.toThrow(/permission denied/i);
      } finally {
        await client.query("ROLLBACK");
      }
    });

    it("HD-E: release requires owner AAL2", async () => {
      await cleanup(client);
      await seedUsers(client);
      const { attemptId, manifestId } = await seedDeletePrivateFixture(client);
      const hold = await asAuthenticated<RpcPayload>(
        client,
        OWNER,
        `SELECT public.create_account_deletion_storage_preservation_hold(
          $1::uuid,'manifest_object'::text,'legal_hold'::text,$2::uuid,$3::uuid,NULL
        ) AS payload`,
        [REQUEST_ID, attemptId, manifestId]
      );

      expect(
        await asAuthenticated<RpcPayload>(
          client,
          OWNER,
          `SELECT public.release_account_deletion_storage_preservation_hold($1::uuid) AS payload`,
          [hold.hold_id]
        )
      ).toMatchObject({ ok: false, code: "owner_aal2_required" });

      expect(
        await asAuthenticated<RpcPayload>(
          client,
          OWNER,
          `SELECT public.release_account_deletion_storage_preservation_hold($1::uuid) AS payload`,
          [hold.hold_id],
          { aal: "aal2" }
        )
      ).toMatchObject({ ok: true, code: "hold_released" });
    });

    it("HD-F: audit created_by matches authenticated actor", async () => {
      await cleanup(client);
      await seedUsers(client);
      const { attemptId, manifestId } = await seedDeletePrivateFixture(client);
      await asAuthenticated<RpcPayload>(
        client,
        OWNER,
        `SELECT public.create_account_deletion_storage_preservation_hold(
          $1::uuid,'manifest_object'::text,'legal_hold'::text,$2::uuid,$3::uuid,NULL
        ) AS payload`,
        [REQUEST_ID, attemptId, manifestId]
      );

      const audit = await client.query<{ created_by: string }>(
        `SELECT actor_user_id AS created_by
         FROM public.account_deletion_storage_execution_audit
         WHERE event_type = 'hold_created'
         ORDER BY created_at DESC LIMIT 1`
      );
      expect(audit.rows[0]?.created_by).toBe(OWNER);
    });

    it("HD-G/H: claim → hold → authorize refused; old claim token dead", async () => {
      await cleanup(client);
      await seedUsers(client);
      const { attemptId, manifestId, resultId } =
        await seedDeletePrivateFixture(client);

      const claim = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [REQUEST_ID, attemptId, manifestId]
      );
      const oldToken = claim.claim_token as string;

      await asAuthenticated<RpcPayload>(
        client,
        OWNER,
        `SELECT public.create_account_deletion_storage_preservation_hold(
          $1::uuid,'manifest_object'::text,'legal_hold'::text,$2::uuid,$3::uuid,NULL
        ) AS payload`,
        [REQUEST_ID, attemptId, manifestId]
      );

      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.authorize_account_deletion_storage_object_delete($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS payload`,
          [REQUEST_ID, attemptId, resultId, oldToken]
        )
      ).toMatchObject({ ok: false, code: "preservation_hold_active" });

      const state = await client.query<{ execution_state: string; claim_token: string | null }>(
        `SELECT execution_state, claim_token FROM public.account_deletion_storage_execution_results WHERE id = $1`,
        [resultId]
      );
      expect(state.rows[0]?.execution_state).toBe("blocked_on_hold");
      expect(state.rows[0]?.claim_token).toBeNull();
    });

    it("HD-K: hold after delete commitment → delete_already_committed", async () => {
      await cleanup(client);
      await seedUsers(client);
      const { attemptId, manifestId, resultId } =
        await seedDeletePrivateFixture(client);

      const claim = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [REQUEST_ID, attemptId, manifestId]
      );

      const auth = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.authorize_account_deletion_storage_object_delete($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS payload`,
        [REQUEST_ID, attemptId, resultId, claim.claim_token]
      );
      expect(auth.ok).toBe(true);

      expect(
        await asAuthenticated<RpcPayload>(
          client,
          OWNER,
          `SELECT public.create_account_deletion_storage_preservation_hold(
            $1::uuid,'manifest_object'::text,'legal_hold'::text,$2::uuid,$3::uuid,NULL
          ) AS payload`,
          [REQUEST_ID, attemptId, manifestId]
        )
      ).toMatchObject({ ok: false, code: "delete_already_committed" });
    });

    it("SD-E: DELETE_PRIVATE + claim + authorize issues commit token", async () => {
      await cleanup(client);
      await seedUsers(client);
      const { attemptId, manifestId, resultId } =
        await seedDeletePrivateFixture(client);

      const claim = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [REQUEST_ID, attemptId, manifestId]
      );

      const auth = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.authorize_account_deletion_storage_object_delete($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS payload`,
        [REQUEST_ID, attemptId, resultId, claim.claim_token]
      );
      expect(auth).toMatchObject({
        ok: true,
        code: "authorized",
        bucket: "journey-private-media",
        object_exists: true,
      });
      expect(auth.delete_commit_token).toBeTruthy();
    });

    it("SD-F: wrong bucket on result row refuses authorize", async () => {
      await cleanup(client);
      await seedUsers(client);
      const { attemptId, manifestId, resultId } =
        await seedDeletePrivateFixture(client);

      await client.query(
        `UPDATE public.account_deletion_storage_execution_results SET bucket = 'story-videos' WHERE id = $1`,
        [resultId]
      );

      const claim = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [REQUEST_ID, attemptId, manifestId]
      );

      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.authorize_account_deletion_storage_object_delete($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS payload`,
          [REQUEST_ID, attemptId, resultId, claim.claim_token]
        )
      ).toMatchObject({ ok: false, code: "bucket_not_destructive_allowed" });
    });

    it("SD-J: missing object → precheck_missing without commit", async () => {
      await cleanup(client);
      await seedUsers(client);
      const { attemptId, manifestId, resultId, objectPath } =
        await seedDeletePrivateFixture(client);

      await client.query(
        `DELETE FROM storage.objects WHERE bucket_id = 'journey-private-media' AND name = $1`,
        [objectPath]
      );

      const claim = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [REQUEST_ID, attemptId, manifestId]
      );

      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.authorize_account_deletion_storage_object_delete($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS payload`,
          [REQUEST_ID, attemptId, resultId, claim.claim_token]
        )
      ).toMatchObject({ ok: true, code: "precheck_missing" });

      const row = await client.query<{ execution_state: string }>(
        `SELECT execution_state FROM public.account_deletion_storage_execution_results WHERE id = $1`,
        [resultId]
      );
      expect(row.rows[0]?.execution_state).toBe("missing");
    });

    it("SD-I: replayed claim token after reclaim fails authorize", async () => {
      await cleanup(client);
      await seedUsers(client);
      const { attemptId, manifestId, resultId } =
        await seedDeletePrivateFixture(client);

      const claim1 = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [REQUEST_ID, attemptId, manifestId]
      );
      const staleToken = claim1.claim_token as string;

      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET claim_lease_expires_at = now() - interval '2 minutes' WHERE id = $1`,
        [resultId]
      );

      const claim2 = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [REQUEST_ID, attemptId, manifestId]
      );
      expect(claim2.ok).toBe(true);

      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.authorize_account_deletion_storage_object_delete($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS payload`,
          [REQUEST_ID, attemptId, resultId, staleToken]
        )
      ).toMatchObject({ ok: false, code: "claim_token_mismatch" });
    });

    it("AAL-A through AAL-F: release requires top-level JWT aal2 only", async () => {
      await cleanup(client);
      await seedUsers(client);
      const { attemptId, manifestId } = await seedDeletePrivateFixture(client);
      const hold = await asAuthenticated<RpcPayload>(
        client,
        OWNER,
        `SELECT public.create_account_deletion_storage_preservation_hold(
          $1::uuid,'manifest_object'::text,'legal_hold'::text,$2::uuid,$3::uuid,NULL
        ) AS payload`,
        [REQUEST_ID, attemptId, manifestId]
      );

      expect(
        await asAuthenticated<RpcPayload>(
          client,
          OWNER,
          `SELECT public.release_account_deletion_storage_preservation_hold($1::uuid) AS payload`,
          [hold.hold_id],
          { aal: "aal1" }
        )
      ).toMatchObject({ ok: false, code: "owner_aal2_required" });

      expect(
        await asAuthenticated<RpcPayload>(
          client,
          OWNER,
          `SELECT public.release_account_deletion_storage_preservation_hold($1::uuid) AS payload`,
          [hold.hold_id]
        )
      ).toMatchObject({ ok: false, code: "owner_aal2_required" });

      expect(
        await asAuthenticated<RpcPayload>(
          client,
          OWNER,
          `SELECT public.release_account_deletion_storage_preservation_hold($1::uuid) AS payload`,
          [hold.hold_id],
          { aal: "aal1", app_metadata: { aal: "aal2" } }
        )
      ).toMatchObject({ ok: false, code: "owner_aal2_required" });

      expect(
        await asAuthenticated<RpcPayload>(
          client,
          OWNER,
          `SELECT public.release_account_deletion_storage_preservation_hold($1::uuid) AS payload`,
          [hold.hold_id],
          { app_metadata: { aal: "aal2" } }
        )
      ).toMatchObject({ ok: false, code: "owner_aal2_required" });

      expect(
        await asAuthenticated<RpcPayload>(
          client,
          OTHER,
          `SELECT public.release_account_deletion_storage_preservation_hold($1::uuid) AS payload`,
          [hold.hold_id],
          { aal: "aal2" }
        )
      ).toMatchObject({ ok: false, code: "owner_required" });

      const released = await asAuthenticated<RpcPayload>(
        client,
        OWNER,
        `SELECT public.release_account_deletion_storage_preservation_hold($1::uuid) AS payload`,
        [hold.hold_id],
        { aal: "aal2" }
      );
      expect(released).toMatchObject({ ok: true, code: "hold_released" });
      const audit = await client.query<{ released_by: string }>(
        `SELECT actor_user_id AS released_by FROM public.account_deletion_storage_execution_audit
         WHERE event_type = 'hold_released' ORDER BY created_at DESC LIMIT 1`
      );
      expect(audit.rows[0]?.released_by).toBe(OWNER);
    });

    it("MIX-A: request hold with committed + precommit + pending siblings", async () => {
      await cleanup(client);
      await seedUsers(client);
      const base = await seedDeletePrivateFixture(client);
      const b = await cloneDeletePrivateResult(
        client,
        REQUEST_ID,
        base.attemptId,
        base.manifestId,
        "b"
      );
      const c = await cloneDeletePrivateResult(
        client,
        REQUEST_ID,
        base.attemptId,
        base.manifestId,
        "c"
      );

      const claimA = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [REQUEST_ID, base.attemptId, base.manifestId]
      );
      await asServiceRole<RpcPayload>(
        client,
        `SELECT public.authorize_account_deletion_storage_object_delete($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS payload`,
        [REQUEST_ID, base.attemptId, base.resultId, claimA.claim_token]
      );

      await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [REQUEST_ID, base.attemptId, b.manifestId]
      );

      const hold = await asAuthenticated<RpcPayload>(
        client,
        OWNER,
        `SELECT public.create_account_deletion_storage_preservation_hold(
          $1::uuid,'request'::text,'litigation_preservation'::text,NULL,NULL,NULL
        ) AS payload`,
        [REQUEST_ID]
      );
      expect(hold).toMatchObject({
        ok: true,
        code: "hold_created_with_committed_conflicts",
        committed_conflict_count: 1,
      });

      const states = await client.query<{ id: string; execution_state: string; delete_commit_token: string | null }>(
        `SELECT id, execution_state, delete_commit_token::text
         FROM public.account_deletion_storage_execution_results
         WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [[base.resultId, b.resultId, c.resultId]]
      );
      const byId = Object.fromEntries(states.rows.map((r) => [r.id, r]));
      expect(byId[base.resultId]?.delete_commit_token).toBeTruthy();
      expect(byId[b.resultId]?.execution_state).toBe("blocked_on_hold");
      expect(byId[c.resultId]?.execution_state).toBe("blocked_on_hold");
    });

    it("MIX-B: attempt-wide hold with committed conflict", async () => {
      await cleanup(client);
      await seedUsers(client);
      const base = await seedDeletePrivateFixture(client);
      const claim = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [REQUEST_ID, base.attemptId, base.manifestId]
      );
      await asServiceRole<RpcPayload>(
        client,
        `SELECT public.authorize_account_deletion_storage_object_delete($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS payload`,
        [REQUEST_ID, base.attemptId, base.resultId, claim.claim_token]
      );
      const hold = await asAuthenticated<RpcPayload>(
        client,
        OWNER,
        `SELECT public.create_account_deletion_storage_preservation_hold(
          $1::uuid,'attempt'::text,'legal_hold'::text,$2::uuid,NULL,NULL
        ) AS payload`,
        [REQUEST_ID, base.attemptId]
      );
      expect(hold.code).toBe("hold_created_with_committed_conflicts");
    });

    it("MIX-C/D: object committed vs broad hold release", async () => {
      await cleanup(client);
      await seedUsers(client);
      const base = await seedDeletePrivateFixture(client);
      const claim = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [REQUEST_ID, base.attemptId, base.manifestId]
      );
      await asServiceRole<RpcPayload>(
        client,
        `SELECT public.authorize_account_deletion_storage_object_delete($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS payload`,
        [REQUEST_ID, base.attemptId, base.resultId, claim.claim_token]
      );

      expect(
        await asAuthenticated<RpcPayload>(
          client,
          OWNER,
          `SELECT public.create_account_deletion_storage_preservation_hold(
            $1::uuid,'manifest_object'::text,'x'::text,$2::uuid,$3::uuid,NULL
          ) AS payload`,
          [REQUEST_ID, base.attemptId, base.manifestId]
        )
      ).toMatchObject({ ok: false, code: "delete_already_committed" });

      const b = await cloneDeletePrivateResult(
        client,
        REQUEST_ID,
        base.attemptId,
        base.manifestId,
        "mixd"
      );
      const reqHold = await asAuthenticated<RpcPayload>(
        client,
        OWNER,
        `SELECT public.create_account_deletion_storage_preservation_hold(
          $1::uuid,'request'::text,'litigation_preservation'::text,NULL,NULL,NULL
        ) AS payload`,
        [REQUEST_ID]
      );
      expect(reqHold.ok).toBe(true);

      const objHold = await asAuthenticated<RpcPayload>(
        client,
        OWNER,
        `SELECT public.create_account_deletion_storage_preservation_hold(
          $1::uuid,'manifest_object'::text,'legal_hold'::text,$2::uuid,$3::uuid,NULL
        ) AS payload`,
        [REQUEST_ID, base.attemptId, b.manifestId]
      );
      await asAuthenticated<RpcPayload>(
        client,
        OWNER,
        `SELECT public.release_account_deletion_storage_preservation_hold($1::uuid) AS payload`,
        [objHold.hold_id],
        { aal: "aal2" }
      );

      const blocked = await client.query<{ execution_state: string }>(
        `SELECT execution_state FROM public.account_deletion_storage_execution_results WHERE id = $1`,
        [b.resultId]
      );
      expect(blocked.rows[0]?.execution_state).toBe("blocked_on_hold");

      await asAuthenticated<RpcPayload>(
        client,
        OWNER,
        `SELECT public.release_account_deletion_storage_preservation_hold($1::uuid) AS payload`,
        [reqHold.hold_id],
        { aal: "aal2" }
      );
      const pending = await client.query<{ execution_state: string; claim_token: string | null }>(
        `SELECT execution_state, claim_token FROM public.account_deletion_storage_execution_results WHERE id = $1`,
        [b.resultId]
      );
      expect(pending.rows[0]?.execution_state).toBe("pending");
      expect(pending.rows[0]?.claim_token).toBeNull();
    });

    it("HD-I: release hold after invalidation — old claim dead, fresh claim required", async () => {
      await cleanup(client);
      await seedUsers(client);
      const { attemptId, manifestId, resultId } =
        await seedDeletePrivateFixture(client);
      const claim = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [REQUEST_ID, attemptId, manifestId]
      );
      const oldToken = claim.claim_token as string;
      const hold = await asAuthenticated<RpcPayload>(
        client,
        OWNER,
        `SELECT public.create_account_deletion_storage_preservation_hold(
          $1::uuid,'manifest_object'::text,'legal_hold'::text,$2::uuid,$3::uuid,NULL
        ) AS payload`,
        [REQUEST_ID, attemptId, manifestId]
      );
      expect(hold.ok).toBe(true);
      await asAuthenticated<RpcPayload>(
        client,
        OWNER,
        `SELECT public.release_account_deletion_storage_preservation_hold($1::uuid) AS payload`,
        [hold.hold_id],
        { aal: "aal2" }
      );
      const staleAuth = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.authorize_account_deletion_storage_object_delete($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS payload`,
        [REQUEST_ID, attemptId, resultId, oldToken]
      );
      expect(staleAuth.ok).toBe(false);
      expect(
        ["claim_token_mismatch", "not_deleting"].includes(
          String(staleAuth.code)
        )
      ).toBe(true);
      const reclaim = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [REQUEST_ID, attemptId, manifestId]
      );
      expect(reclaim.ok).toBe(true);
      expect(reclaim.claim_token).not.toBe(oldToken);
    });

    it("SD-B/C/D: non-DELETE_PRIVATE dispositions cannot authorize", async () => {
      await cleanup(client);
      await seedUsers(client);
      const attemptId = await seedAttempt(client);
      for (const disposition of [
        "PRESERVE_SHARED",
        "DEFER_PROFILE",
        "BLOCK_UNRESOLVED",
      ]) {
        const row = await client.query<{ id: string }>(
          `SELECT r.id FROM public.account_deletion_storage_execution_results r
           JOIN public.account_deletion_storage_manifest m ON m.id = r.manifest_object_id
           WHERE r.execution_attempt_id = $1 AND m.disposition = $2 LIMIT 1`,
          [attemptId, disposition]
        );
        if (!row.rows[0]) continue;
        expect(
          await asServiceRole<RpcPayload>(
            client,
            `SELECT public.authorize_account_deletion_storage_object_delete($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS payload`,
            [
              REQUEST_ID,
              attemptId,
              row.rows[0].id,
              "00000000-0000-4000-8000-000000000099",
            ]
          )
        ).toMatchObject({ ok: false, code: "not_delete_eligible" });
      }
    });

    it("SD-G: foreign attempt/result mismatch refuses", async () => {
      await cleanup(client);
      await seedUsers(client);
      const base = await seedDeletePrivateFixture(client);
      const claim = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [REQUEST_ID, base.attemptId, base.manifestId]
      );
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.authorize_account_deletion_storage_object_delete($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS payload`,
          [
            REQUEST_ID,
            "00000000-0000-4000-8000-000000000099",
            base.resultId,
            claim.claim_token,
          ]
        )
      ).toMatchObject({ ok: false, code: "attempt_mismatch" });
    });

    it("SD-H: expired claim refuses authorization", async () => {
      await cleanup(client);
      await seedUsers(client);
      const { attemptId, manifestId, resultId } =
        await seedDeletePrivateFixture(client);
      const claim = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [REQUEST_ID, attemptId, manifestId]
      );
      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET claim_lease_expires_at = now() - interval '5 minutes' WHERE id = $1`,
        [resultId]
      );
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.authorize_account_deletion_storage_object_delete($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS payload`,
          [REQUEST_ID, attemptId, resultId, claim.claim_token]
        )
      ).toMatchObject({ ok: false, code: "claim_lease_expired" });
    });

    it("commit replay and completion authority LIVE", async () => {
      await cleanup(client);
      await seedUsers(client);
      const base = await seedDeletePrivateFixture(client);
      const other = await cloneDeletePrivateResult(
        client,
        REQUEST_ID,
        base.attemptId,
        base.manifestId,
        "replay"
      );
      const claim = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [REQUEST_ID, base.attemptId, base.manifestId]
      );
      const auth = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.authorize_account_deletion_storage_object_delete($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS payload`,
        [REQUEST_ID, base.attemptId, base.resultId, claim.claim_token]
      );
      const commit = auth.delete_commit_token as string;

      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.complete_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,NULL,NULL) AS payload`,
          [REQUEST_ID, base.attemptId, other.resultId, commit, "deleted"]
        )
      ).toMatchObject({ ok: false, code: "delete_commit_authority_required" });

      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.complete_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,NULL,NULL) AS payload`,
          [
            REQUEST_ID,
            base.attemptId,
            base.resultId,
            "00000000-0000-4000-8000-000000000099",
            "deleted",
          ]
        )
      ).toMatchObject({ ok: false, code: "delete_commit_token_mismatch" });

      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.complete_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,NULL,$4::text,$5::text,NULL) AS payload`,
          [REQUEST_ID, base.attemptId, base.resultId, "failed_retryable", "x"]
        )
      ).toMatchObject({ ok: false, code: "delete_commit_token_mismatch" });

      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET delete_commit_expires_at = now() - interval '1 minute' WHERE id = $1`,
        [base.resultId]
      );
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.complete_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,NULL,NULL) AS payload`,
          [REQUEST_ID, base.attemptId, base.resultId, commit, "deleted"]
        )
      ).toMatchObject({ ok: false, code: "delete_commit_expired" });
    });

    it("SD-A: PRESERVE_PUBLIC result cannot authorize", async () => {
      await cleanup(client);
      await seedUsers(client);
      const attemptId = await seedAttempt(client);
      const preserve = await client.query<{ id: string; manifest_id: string }>(
        `SELECT r.id, r.manifest_object_id AS manifest_id
         FROM public.account_deletion_storage_execution_results r
         JOIN public.account_deletion_storage_manifest m ON m.id = r.manifest_object_id
         WHERE r.execution_attempt_id = $1 AND m.disposition = 'PRESERVE_PUBLIC' LIMIT 1`,
        [attemptId]
      );
      if (!preserve.rows[0]) return;

      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.authorize_account_deletion_storage_object_delete($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS payload`,
          [
            REQUEST_ID,
            attemptId,
            preserve.rows[0].id,
            "00000000-0000-4000-8000-000000000099",
          ]
        )
      ).toMatchObject({ ok: false, code: "not_deleting" });
    });
  }
);
