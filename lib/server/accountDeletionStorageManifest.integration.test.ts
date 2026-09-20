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

type RpcPayload = {
  ok?: boolean;
  code?: string;
  capture_status?: string | null;
  object_count?: number;
  fingerprint?: string | null;
  disposition?: string;
  status?: string;
  disposition_counts?: Record<string, number>;
};

let serviceRoleGrantsApplied = false;
let authenticatedGrantsApplied = false;
let serverVersionNum = 0;

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
  if (serviceRoleGrantsApplied) {
    return;
  }
  await client.query(`
    GRANT USAGE ON SCHEMA public TO service_role;
    ALTER ROLE service_role BYPASSRLS;
  `);
  serviceRoleGrantsApplied = true;
}

async function ensureAuthenticatedGrants(client: Client) {
  if (authenticatedGrantsApplied) {
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
  authenticatedGrantsApplied = true;
}

async function cleanup(client: Client) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // ignore
  }
  try {
    await client.query(`
      TRUNCATE TABLE
        public.account_deletion_storage_manifest,
        public.account_deletion_storage_manifest_capture,
        public.account_deletion_story_freeze_scope,
        public.account_deletion_database_execution_context,
        public.account_deletion_execution_attempts,
        public.account_deletion_requests,
        public.profiles
      RESTART IDENTITY CASCADE
    `);
  } catch {
    // schema may be incomplete if migration apply failed
  }
  try {
    await client.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [
      [TARGET, OWNER, OTHER],
    ]);
  } catch {
    // ignore
  }
}

async function seedUsers(client: Client) {
  await client.query(
    `
    INSERT INTO auth.users (id, email) VALUES
      ($1, 'target-manifest@test.local'),
      ($2, 'owner-manifest@test.local'),
      ($3, 'other-manifest@test.local')
    ON CONFLICT (id) DO NOTHING
    `,
    [TARGET, OWNER, OTHER]
  );
  await client.query(
    `
    INSERT INTO public.profiles (id, email, username, display_name, is_owner, is_admin)
    VALUES
      ($1, 'target-manifest@test.local', 'target_manifest', 'Target', false, false),
      ($2, 'owner-manifest@test.local', 'owner_manifest', 'Owner', false, false),
      ($3, 'other-manifest@test.local', 'other_manifest', 'Other', false, false)
    ON CONFLICT (id) DO NOTHING
    `,
    [TARGET, OWNER, OTHER]
  );
  await client.query("BEGIN");
  try {
    await client.query(
      `ALTER TABLE public.profiles DISABLE TRIGGER protect_profile_roles_trigger`
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

async function submitAndApprove(
  client: Client,
  requestId: string,
  userId: string
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
      [requestId, userId, `${userId}@test.local`]
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
}

async function seedInventoryAttempt(
  client: Client,
  requestId: string = REQUEST_ID,
  userId: string = TARGET
): Promise<string> {
  await submitAndApprove(client, requestId, userId);

  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE service_role");
    const acquired = await client.query<{
      payload: { ok?: boolean; attempt_id?: string };
    }>(
      `SELECT public.acquire_account_deletion_execution_lock($1::uuid, $2::uuid) AS payload`,
      [requestId, OWNER]
    );
    await client.query("COMMIT");
    const attemptId = acquired.rows[0]?.payload?.attempt_id;
    if (!attemptId) {
      throw new Error("acquire failed");
    }
    await client.query(
      `UPDATE public.account_deletion_execution_attempts SET stage = 'inventory' WHERE id = $1`,
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

async function asRole<T extends Record<string, unknown>>(
  client: Client,
  role: string,
  sql: string,
  params: unknown[] = []
) {
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL ROLE ${role}`);
    const result = await client.query<{ payload: T }>(sql, params);
    await client.query("COMMIT");
    return result.rows[0]?.payload;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function asServiceRole<T extends Record<string, unknown>>(
  client: Client,
  sql: string,
  params: unknown[] = []
) {
  return asRole<T>(client, "service_role", sql, params);
}

async function upsert(
  client: Client,
  attemptId: string,
  args: {
    bucket: string;
    path: string;
    category: string;
    basis: string;
    disposition: string;
    reason: string;
    preservationRequired?: boolean;
    preservationCode?: string | null;
    referenceState?: string;
    totalRefs?: number;
    survivingRefs?: number;
    requestId?: string;
  }
) {
  return asServiceRole<RpcPayload>(
    client,
    `
    SELECT public.upsert_account_deletion_storage_manifest_object(
      $1::uuid, $2::uuid,
      $3::text, $4::text, $5::text, $6::text, $7::text, $8::text,
      $9::boolean, $10::text, $11::text, $12::integer, $13::integer, NULL::text
    ) AS payload
    `,
    [
      args.requestId ?? REQUEST_ID,
      attemptId,
      args.bucket,
      args.path,
      args.category,
      args.basis,
      args.disposition,
      args.reason,
      args.preservationRequired ?? false,
      args.preservationCode ?? null,
      args.referenceState ?? "unresolved",
      args.totalRefs ?? 0,
      args.survivingRefs ?? 0,
    ]
  );
}

describeIntegration(
  `account deletion storage manifest foundation (${ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV})`,
  () => {
    let client: Client;

    beforeAll(async () => {
      client = new Client({ connectionString: dbUrl! });
      await client.connect();
      await resetAccountDeletionIntegrationSchema(client);
      await applyAccountDeletionMigrations(client);
      await ensureHashtextextendedStub(client);
      await ensureServiceRole(client);
      await ensureAuthenticatedGrants(client);

      const versionRow = await client.query<{ num: number }>(
        `SELECT current_setting('server_version_num')::integer AS num`
      );
      serverVersionNum = versionRow.rows[0]?.num ?? 0;
    }, 300_000);

    afterAll(async () => {
      await cleanup(client);
      await client?.end();
    });

    it("MF-A: foundation readiness true", async () => {
      const ready = await client.query<{ ready: boolean }>(
        `SELECT (public.verify_account_deletion_storage_manifest_foundation_ready()->>'ready')::boolean AS ready`
      );
      expect(ready.rows[0]?.ready).toBe(true);
      const composed = await client.query<{ ready: boolean }>(
        `SELECT (public.verify_account_deletion_schema_execution_ready()->>'ready')::boolean AS ready`
      );
      expect(composed.rows[0]?.ready).toBe(true);
      if (serverVersionNum >= 170_000) {
        const maintain = await client.query<{ allowed: boolean }>(
          `SELECT pg_catalog.has_table_privilege('service_role','public.account_deletion_storage_manifest','MAINTAIN') AS allowed`
        );
        expect(maintain.rows[0]?.allowed).toBe(false);
      }
    });

    it("MF-B/C/D: authenticated/anon cannot read; service_role cannot direct-write", async () => {
      await cleanup(client);
      await seedUsers(client);
      const attemptId = await seedInventoryAttempt(client);
      await asServiceRole(
        client,
        `SELECT public.initialize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );

      for (const role of ["authenticated", "anon"]) {
        await client.query("BEGIN");
        await client.query(`SET LOCAL ROLE ${role}`);
        await expect(
          client.query(`SELECT * FROM public.account_deletion_storage_manifest`)
        ).rejects.toThrow(/permission denied/i);
        await client.query("ROLLBACK");
      }

      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE service_role");
      await expect(
        client.query(
          `
          INSERT INTO public.account_deletion_storage_manifest_capture (
            execution_attempt_id, deletion_request_id, target_user_id, status
          ) VALUES ($1,$2,$3,'open')
          `,
          [attemptId, REQUEST_ID, TARGET]
        )
      ).rejects.toThrow(/permission denied|duplicate|unique/i);
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE service_role");
      await expect(
        client.query(
          `DELETE FROM public.account_deletion_storage_manifest WHERE false`
        )
      ).rejects.toThrow(/permission denied/i);
      await client.query("ROLLBACK");
    });

    it("MF-E/F/G/H/I/J/K: request/attempt/target/status/stage gates", async () => {
      await cleanup(client);
      await seedUsers(client);
      const attemptId = await seedInventoryAttempt(client);

      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.initialize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
          ["00000000-0000-4000-8000-000000000000", attemptId]
        )
      ).toMatchObject({ ok: false, code: "request_not_found" });

      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.initialize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, "00000000-0000-4000-8000-000000000001"]
        )
      ).toMatchObject({ ok: false, code: "attempt_not_found" });

      await submitAndApprove(client, OTHER_REQUEST, OTHER);
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE service_role");
      const otherAcquired = await client.query<{
        payload: { attempt_id?: string };
      }>(
        `SELECT public.acquire_account_deletion_execution_lock($1::uuid,$2::uuid) AS payload`,
        [OTHER_REQUEST, OWNER]
      );
      await client.query("COMMIT");
      const otherAttempt = otherAcquired.rows[0]?.payload?.attempt_id;
      expect(otherAttempt).toBeTruthy();
      await client.query(
        `UPDATE public.account_deletion_execution_attempts SET stage = 'inventory' WHERE id = $1`,
        [otherAttempt]
      );
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.initialize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
          [OTHER_REQUEST, attemptId]
        )
      ).toMatchObject({ ok: false, code: "attempt_request_mismatch" });

      await asServiceRole(
        client,
        `SELECT public.initialize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );

      await client.query(
        `UPDATE public.account_deletion_storage_manifest_capture
         SET target_user_id = $1 WHERE execution_attempt_id = $2`,
        [OTHER, attemptId]
      );
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.finalize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({ ok: false, code: "manifest_state_drift" });
      await client.query(
        `UPDATE public.account_deletion_storage_manifest_capture
         SET target_user_id = $1 WHERE execution_attempt_id = $2`,
        [TARGET, attemptId]
      );

      await client.query(
        `UPDATE public.account_deletion_requests SET status = 'approved' WHERE id = $1`,
        [REQUEST_ID]
      );
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.finalize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({ ok: false, code: "request_not_in_progress" });
      await client.query(
        `UPDATE public.account_deletion_requests SET status = 'deletion_in_progress' WHERE id = $1`,
        [REQUEST_ID]
      );

      await client.query(
        `UPDATE public.account_deletion_execution_attempts SET status = 'failed' WHERE id = $1`,
        [attemptId]
      );
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.finalize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({ ok: false, code: "attempt_not_active" });
      await client.query(
        `UPDATE public.account_deletion_execution_attempts SET status = 'active', stage = 'database_completed' WHERE id = $1`,
        [attemptId]
      );
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.initialize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({ ok: false, code: "invalid_stage" });
    });

    it("MF-L/M/N/O/P/Q/R/S: policy and path rejects including foundation DELETE_PRIVATE ban", async () => {
      await cleanup(client);
      await seedUsers(client);
      const attemptId = await seedInventoryAttempt(client);
      await asServiceRole(
        client,
        `SELECT public.initialize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );

      const path = `${TARGET}/thread-1/11111111-1111-4111-8111-111111111111.mp4`;
      expect(
        await upsert(client, attemptId, {
          bucket: "journey-private-media",
          path,
          category: "journey_private_media",
          basis: "test",
          disposition: "PRESERVE_SHARED",
          reason: "shared survivor",
          referenceState: "shared",
          totalRefs: 2,
          survivingRefs: 1,
        })
      ).toMatchObject({ ok: true, code: "upserted" });

      expect(
        await upsert(client, attemptId, {
          bucket: "journey-private-media",
          path,
          category: "journey_private_media",
          basis: "conflict",
          disposition: "BLOCK_UNRESOLVED",
          reason: "reclassify same path",
        })
      ).toMatchObject({ ok: true, code: "upserted" });

      expect(
        await upsert(client, attemptId, {
          bucket: "not-a-bucket",
          path: `${TARGET}/x.bin`,
          category: "unknown_legacy",
          basis: "x",
          disposition: "BLOCK_UNRESOLVED",
          reason: "bad bucket",
        })
      ).toMatchObject({ ok: false, code: "invalid_object_path" });

      for (const bad of [
        "../escape.mp4",
        `${TARGET}/./x.mp4`,
        `${TARGET}//x.mp4`,
        `/${TARGET}/x.mp4`,
        `${TARGET}/x.mp4/`,
        `${TARGET}/x%2e%2e/y.mp4`,
        `https://example.com/${TARGET}/x.mp4`,
        `journey-private-media/${TARGET}/x.mp4`,
      ]) {
        expect(
          await upsert(client, attemptId, {
            bucket: "journey-private-media",
            path: bad,
            category: "journey_private_media",
            basis: "x",
            disposition: "BLOCK_UNRESOLVED",
            reason: "malformed",
          })
        ).toMatchObject({ ok: false, code: "invalid_object_path" });
      }

      expect(
        await upsert(client, attemptId, {
          bucket: "journey-private-media",
          path: `${TARGET}/thread-del/22222222-2222-4222-8222-222222222222.mp4`,
          category: "journey_private_media",
          basis: "caller claim exclusive",
          disposition: "DELETE_PRIVATE",
          reason: "must reject in foundation",
          referenceState: "exclusive",
          totalRefs: 1,
          survivingRefs: 0,
        })
      ).toMatchObject({
        ok: false,
        code: "delete_authority_not_available_in_foundation",
      });

      expect(
        await upsert(client, attemptId, {
          bucket: "journey-private-media",
          path: `${OTHER}/thread/33333333-3333-4333-8333-333333333333.mp4`,
          category: "journey_private_media",
          basis: "foreign",
          disposition: "DELETE_PRIVATE",
          reason: "foreign delete",
          referenceState: "exclusive",
          totalRefs: 1,
          survivingRefs: 0,
        })
      ).toMatchObject({
        ok: false,
        code: "delete_authority_not_available_in_foundation",
      });

      expect(
        await upsert(client, attemptId, {
          bucket: "story-videos",
          path: `${TARGET}/story.mp4`,
          category: "story_video",
          basis: "stories.video_url",
          disposition: "DELETE_PRIVATE",
          reason: "illegal public delete",
        })
      ).toMatchObject({
        ok: false,
        code: "delete_authority_not_available_in_foundation",
      });

      expect(
        await upsert(client, attemptId, {
          bucket: "profile-avatars",
          path: `${TARGET}/avatar.png`,
          category: "profile_avatar",
          basis: "profiles.avatar_url",
          disposition: "DELETE_PRIVATE",
          reason: "illegal avatar delete",
        })
      ).toMatchObject({
        ok: false,
        code: "delete_authority_not_available_in_foundation",
      });

      expect(
        await upsert(client, attemptId, {
          bucket: "profile-avatars",
          path: `${TARGET}/avatar.png`,
          category: "profile_avatar",
          basis: "profiles.avatar_url",
          disposition: "DEFER_PROFILE",
          reason: "deferred",
        })
      ).toMatchObject({ ok: true, disposition: "DEFER_PROFILE" });
    });

    it("MF-T/U/V/W/X/Z/AA/AB/AD/AE: finalize, freeze, fingerprint, empty, idempotent init", async () => {
      await cleanup(client);
      await seedUsers(client);
      const attemptId = await seedInventoryAttempt(client);

      const init1 = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.initialize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );
      expect(init1).toMatchObject({ ok: true, code: "initialized" });
      const init2 = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.initialize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );
      expect(init2).toMatchObject({ ok: true, code: "already_initialized" });

      const emptyFinalize = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.finalize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );
      expect(emptyFinalize).toMatchObject({
        ok: true,
        code: "finalized",
        object_count: 0,
      });
      expect(emptyFinalize?.fingerprint).toHaveLength(64);
      const emptyCanonical = await client.query<{ fp: string }>(
        `SELECT encode(public.digest(('[]'::jsonb)::text, 'sha256'), 'hex') AS fp`
      );
      expect(emptyFinalize?.fingerprint).toBe(emptyCanonical.rows[0]?.fp);

      expect(
        await upsert(client, attemptId, {
          bucket: "story-images",
          path: `${TARGET}/after-finalize.jpg`,
          category: "story_image",
          basis: "late",
          disposition: "PRESERVE_PUBLIC",
          reason: "blocked",
        })
      ).toMatchObject({ ok: false, code: "manifest_finalized" });

      // Non-empty path for freeze + idempotent finalize
      await cleanup(client);
      await seedUsers(client);
      const attempt2 = await seedInventoryAttempt(client);
      await asServiceRole(
        client,
        `SELECT public.initialize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attempt2]
      );
      await upsert(client, attempt2, {
        bucket: "story-videos",
        path: `${TARGET}/v1.mp4`,
        category: "story_video",
        basis: "stories.video_url",
        disposition: "PRESERVE_PUBLIC",
        reason: "retain",
      });
      const finA = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.finalize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attempt2]
      );
      expect(finA?.ok).toBe(true);

      await client.query("BEGIN");
      await expect(
        client.query(
          `DELETE FROM public.account_deletion_storage_manifest WHERE execution_attempt_id = $1`,
          [attempt2]
        )
      ).rejects.toThrow(/storage_manifest_finalized/i);
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      await expect(
        client.query(
          `UPDATE public.account_deletion_storage_manifest
           SET disposition_reason = 'mutated' WHERE execution_attempt_id = $1`,
          [attempt2]
        )
      ).rejects.toThrow(/storage_manifest_finalized/i);
      await client.query("ROLLBACK");

      const finB = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.finalize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attempt2]
      );
      expect(finB).toMatchObject({
        ok: true,
        code: "already_finalized",
        fingerprint: finA?.fingerprint,
      });

      const stage = await client.query<{ stage: string }>(
        `SELECT stage FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [attempt2]
      );
      expect(stage.rows[0]?.stage).toBe("inventory");
    });

    it("MF-Y: old delimiter-collision datasets produce distinct jsonb fingerprints", async () => {
      await cleanup(client);
      await seedUsers(client);

      const attemptA = await seedInventoryAttempt(client);
      await asServiceRole(
        client,
        `SELECT public.initialize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptA]
      );
      expect(
        await upsert(client, attemptA, {
          bucket: "story-images",
          path: `${TARGET}/collision-a.png`,
          category: "story_image",
          basis: "x\t1\ty",
          disposition: "PRESERVE_PUBLIC",
          reason: "collision-a",
          preservationRequired: false,
        })
      ).toMatchObject({ ok: true });
      const fpA = (
        await client.query<{ fp: string }>(
          `SELECT public.compute_account_deletion_storage_manifest_fingerprint($1::uuid) AS fp`,
          [attemptA]
        )
      ).rows[0]?.fp;

      await cleanup(client);
      await seedUsers(client);
      const attemptB = await seedInventoryAttempt(client);
      await asServiceRole(
        client,
        `SELECT public.initialize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptB]
      );
      expect(
        await upsert(client, attemptB, {
          bucket: "story-images",
          path: `${TARGET}/collision-a.png`,
          category: "story_image",
          basis: "x",
          disposition: "PRESERVE_PUBLIC",
          reason: "collision-b",
          preservationRequired: true,
          preservationCode: "y\t0\t",
        })
      ).toMatchObject({ ok: true });
      const fpB = (
        await client.query<{ fp: string }>(
          `SELECT public.compute_account_deletion_storage_manifest_fingerprint($1::uuid) AS fp`,
          [attemptB]
        )
      ).rows[0]?.fp;

      expect(fpA).toBeTruthy();
      expect(fpB).toBeTruthy();
      expect(fpA).not.toBe(fpB);
    });

    it("MF-AC: mirrored header/attempt drift fails closed on finalize", async () => {
      await cleanup(client);
      await seedUsers(client);
      const attemptId = await seedInventoryAttempt(client);
      await asServiceRole(
        client,
        `SELECT public.initialize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
        [REQUEST_ID, attemptId]
      );
      await client.query(
        `UPDATE public.account_deletion_execution_attempts
         SET storage_manifest_status = 'finalized',
             storage_manifest_fingerprint = 'deadbeef'
         WHERE id = $1`,
        [attemptId]
      );
      expect(
        await asServiceRole<RpcPayload>(
          client,
          `SELECT public.finalize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        )
      ).toMatchObject({ ok: false, code: "manifest_state_drift" });
    });

    it("concurrency: two initialize calls converge; upsert vs finalize serialize", async () => {
      await cleanup(client);
      await seedUsers(client);
      const attemptId = await seedInventoryAttempt(client);

      const clientB = new Client({ connectionString: dbUrl! });
      await clientB.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE service_role");
        const first = await client.query<{ payload: RpcPayload }>(
          `SELECT public.initialize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        );
        expect(first.rows[0]?.payload?.ok).toBe(true);

        await clientB.query("BEGIN");
        await clientB.query("SET LOCAL ROLE service_role");
        const secondPromise = clientB.query<{ payload: RpcPayload }>(
          `SELECT public.initialize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        );
        await client.query("COMMIT");
        const second = await secondPromise;
        await clientB.query("COMMIT");
        expect(second.rows[0]?.payload?.ok).toBe(true);
        expect(["already_initialized", "initialized"]).toContain(
          second.rows[0]?.payload?.code
        );

        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE service_role");
        await client.query(
          `
          SELECT public.upsert_account_deletion_storage_manifest_object(
            $1::uuid,$2::uuid,
            'story-videos',$3::text,'story_video','stories.video_url',
            'PRESERVE_PUBLIC','retain',false,NULL,'unresolved',0,0,NULL
          )
          `,
          [REQUEST_ID, attemptId, `${TARGET}/race.mp4`]
        );

        await clientB.query("BEGIN");
        await clientB.query("SET LOCAL ROLE service_role");
        const finalizePromise = clientB.query<{ payload: RpcPayload }>(
          `SELECT public.finalize_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
          [REQUEST_ID, attemptId]
        );
        await client.query("COMMIT");
        const finalized = await finalizePromise;
        await clientB.query("COMMIT");
        expect(finalized.rows[0]?.payload?.ok).toBe(true);
        expect(["finalized", "already_finalized"]).toContain(
          finalized.rows[0]?.payload?.code
        );
        expect(finalized.rows[0]?.payload?.object_count).toBeGreaterThanOrEqual(
          1
        );
      } finally {
        await clientB.end();
      }
    });
  }
);
