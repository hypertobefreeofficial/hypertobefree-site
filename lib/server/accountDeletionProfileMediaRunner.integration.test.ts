/**
 * Real PostgreSQL coverage for 3B.4B.2.1 profile-media actionable result-ID selector.
 */

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV,
  applyAccountDeletionMigrations,
  getAccountDeletionIntegrationDbUrl,
  resetAccountDeletionIntegrationSchema,
} from "./accountDeletionIntegrationHarness";
import {
  assertFreshMigrationProfileHelperPrivileges,
  cleanupProfileIntegration,
  ensureProfileIntegrationGrants,
  isDedicatedVanillaIntegrationDb,
  RUNNER_IT_TARGET,
  seedRunnerIntegrationUsers,
  setAttemptStagePrivileged,
} from "./accountDeletionProfileStage.integrationHarness";
import {
  asAuthenticatedOwner,
  asServiceRole,
  ensureAuthenticatedGrants,
  ensureServiceRole,
  RUNNER_IT_OTHER,
} from "./accountDeletionStorageStageRunner.integrationHarness";
import {
  claimAndAuthorizeProfileMedia,
  claimProfileMedia,
  completeProfileMedia,
  driveLifecycleToProfileMedia,
  selectProfileMediaActionable,
  type ProfileMediaFixture,
  type ProfileMediaRpcPayload,
} from "./accountDeletionProfileMediaExecution.integrationHarness";

const dbUrl = getAccountDeletionIntegrationDbUrl();
const describeIntegration =
  dbUrl && isDedicatedVanillaIntegrationDb(dbUrl) ? describe : describe.skip;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function expectRoleDenied(
  client: Client,
  role: "authenticated" | "anon",
  sql: string,
  params: unknown[]
) {
  if (role === "authenticated") {
    await ensureAuthenticatedGrants(client);
  } else {
    await ensureServiceRole(client);
  }
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL ROLE ${role}`);
    await expect(client.query(sql, params)).rejects.toThrow(/permission denied/i);
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function readResultRow(client: Client, resultId: string) {
  const row = await client.query<{
    execution_state: string;
    claim_token: string | null;
    delete_commit_token: string | null;
    attempt_count: number;
  }>(
    `SELECT execution_state, claim_token, delete_commit_token, attempt_count
     FROM public.account_deletion_storage_execution_results WHERE id = $1`,
    [resultId]
  );
  return row.rows[0];
}

async function auditCountForRequest(client: Client, requestId: string) {
  const row = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM public.account_deletion_storage_execution_audit
     WHERE deletion_request_id = $1`,
    [requestId]
  );
  return Number(row.rows[0]?.count ?? 0);
}

async function insertExtraDeferProfileResult(
  client: Client,
  fixture: ProfileMediaFixture,
  extension: "webp" | "jpg" | "jpeg"
): Promise<string> {
  const objectPath = `${RUNNER_IT_TARGET}/avatar.${extension}`;
  await client.query(
    `INSERT INTO storage.objects (bucket_id, name, owner)
     VALUES ('profile-avatars', $1, $2::uuid)
     ON CONFLICT DO NOTHING`,
    [objectPath, RUNNER_IT_TARGET]
  );
  const template = await client.query<{
    target_user_id: string;
    ownership_basis: string;
    disposition_reason: string;
    reference_fingerprint: string;
    total_reference_count: number;
    status: string;
  }>(
    `SELECT target_user_id, ownership_basis, disposition_reason,
            reference_fingerprint, total_reference_count, status
     FROM public.account_deletion_storage_manifest WHERE id = $1`,
    [fixture.manifestId]
  );
  const t = template.rows[0]!;
  await client.query(`SET session_replication_role = replica`);
  const manifestId = (
    await client.query<{ id: string }>(
      `INSERT INTO public.account_deletion_storage_manifest (
        deletion_request_id, execution_attempt_id, target_user_id, bucket, object_path,
        media_category, ownership_basis, disposition, disposition_reason,
        preservation_required, reference_state, total_reference_count, surviving_reference_count,
        reference_fingerprint, status
      ) VALUES (
        $1,$2,$3,'profile-avatars',$4,'profile_avatar',$5,'DEFER_PROFILE',$6,
        false,'exclusive',$7,0,$8,$9
      ) RETURNING id`,
      [
        fixture.requestId,
        fixture.attemptId,
        t.target_user_id,
        objectPath,
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
        bucket, object_path, disposition_snapshot, preservation_required_snapshot,
        execution_state
      ) VALUES (
        $1,$2,$3,$4,'profile-avatars',$5,'DEFER_PROFILE',false,'deferred_profile'
      ) RETURNING id`,
      [
        fixture.requestId,
        fixture.attemptId,
        manifestId,
        t.target_user_id,
        objectPath,
      ]
    )
  ).rows[0]!.id;
  await client.query(`SET session_replication_role = DEFAULT`);
  return resultId;
}

describeIntegration(
  `account deletion profile-media runner selector (${ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV})`,
  () => {
    let client: Client;

    beforeAll(async () => {
      client = new Client({ connectionString: dbUrl! });
      await client.connect();
      await resetAccountDeletionIntegrationSchema(client);
      await applyAccountDeletionMigrations(client);
      await assertFreshMigrationProfileHelperPrivileges(client);
      await ensureProfileIntegrationGrants(client);
      await seedRunnerIntegrationUsers(client);
    }, 300_000);

    afterAll(async () => {
      await cleanupProfileIntegration(client);
      await client?.end();
    });

    it("B2-READINESS: runner, schema, and prior profile-media probes pass", async () => {
      const runner = await client.query<{ payload: { ready: boolean } }>(
        `SELECT public.verify_account_deletion_profile_media_runner_ready() AS payload`
      );
      expect(runner.rows[0]?.payload.ready).toBe(true);

      const profileMedia = await client.query<{ payload: { ready: boolean } }>(
        `SELECT public.verify_account_deletion_profile_media_ready() AS payload`
      );
      expect(profileMedia.rows[0]?.payload.ready).toBe(true);

      const schema = await client.query<{ payload: { ready: boolean } }>(
        `SELECT public.verify_account_deletion_schema_execution_ready() AS payload`
      );
      expect(schema.rows[0]?.payload.ready).toBe(true);
    });

    it("B2-PRIVILEGES: service_role executes; authenticated and anon denied", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      const payload = await selectProfileMediaActionable(client, fixture);
      expect(payload.ok).toBe(true);

      const fn =
        "public.select_account_deletion_profile_media_actionable_result_ids($1::uuid,$2::uuid)";
      await expectRoleDenied(client, "authenticated", `SELECT ${fn} AS payload`, [
        fixture.requestId,
        fixture.attemptId,
      ]);
      await expectRoleDenied(client, "anon", `SELECT ${fn} AS payload`, [
        fixture.requestId,
        fixture.attemptId,
      ]);
    });

    it("B2-LIFECYCLE: bounded failures mirror profile-media snapshot authority", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      expect(
        (await selectProfileMediaActionable(client, {
          requestId: randomUUID(),
          attemptId: fixture.attemptId,
        })).code
      ).toBe("request_not_in_progress");

      await client.query(
        `UPDATE public.account_deletion_requests SET status = 'approved' WHERE id = $1`,
        [fixture.requestId]
      );
      expect((await selectProfileMediaActionable(client, fixture)).code).toBe(
        "request_not_in_progress"
      );
      await client.query(
        `UPDATE public.account_deletion_requests SET status = 'deletion_in_progress' WHERE id = $1`,
        [fixture.requestId]
      );

      expect(
        (await selectProfileMediaActionable(client, {
          requestId: fixture.requestId,
          attemptId: randomUUID(),
        })).code
      ).toBe("attempt_mismatch");

      await client.query(
        `UPDATE public.account_deletion_execution_attempts SET status = 'completed' WHERE id = $1`,
        [fixture.attemptId]
      );
      expect((await selectProfileMediaActionable(client, fixture)).code).toBe(
        "attempt_mismatch"
      );
      await client.query(
        `UPDATE public.account_deletion_execution_attempts SET status = 'active' WHERE id = $1`,
        [fixture.attemptId]
      );

      await setAttemptStagePrivileged(client, fixture.attemptId, "storage_completed");
      expect((await selectProfileMediaActionable(client, fixture)).code).toBe(
        "attempt_mismatch"
      );
      await setAttemptStagePrivileged(client, fixture.attemptId, "profile");

      const captureFixture = await driveLifecycleToProfileMedia(client);
      await client.query(
        `DELETE FROM public.account_deletion_storage_manifest_capture
         WHERE execution_attempt_id = $1`,
        [captureFixture.attemptId]
      );
      expect((await selectProfileMediaActionable(client, captureFixture)).code).toBe(
        "storage_manifest_not_finalized"
      );
    });

    it("B2-FILTERING: only deferred_profile and failed_retryable DEFER_PROFILE avatars", async () => {
      const fixture = await driveLifecycleToProfileMedia(client, {
        deletePrivateCount: 1,
      });
      const deletePrivate = await client.query<{ id: string }>(
        `SELECT id FROM public.account_deletion_storage_execution_results
         WHERE execution_attempt_id = $1 AND disposition_snapshot = 'DELETE_PRIVATE'
         LIMIT 1`,
        [fixture.attemptId]
      );

      expect(
        ((await selectProfileMediaActionable(client, fixture)).result_ids as string[]) ??
          []
      ).toContain(fixture.resultId);

      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET execution_state = 'failed_retryable' WHERE id = $1`,
        [fixture.resultId]
      );
      expect(
        ((await selectProfileMediaActionable(client, fixture)).result_ids as string[]) ??
          []
      ).toContain(fixture.resultId);

      const selectedAfterRetryable = await selectProfileMediaActionable(client, fixture);
      const idsAfterRetryable = new Set(
        (selectedAfterRetryable.result_ids as string[]) ?? []
      );
      expect(idsAfterRetryable.has(fixture.resultId)).toBe(true);
      if (deletePrivate.rows[0]) {
        expect(idsAfterRetryable.has(deletePrivate.rows[0].id)).toBe(false);
      }

      let deletingFixture = await driveLifecycleToProfileMedia(client);
      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET execution_state = 'deleting',
             claim_token = gen_random_uuid(),
             claim_lease_expires_at = now() + interval '1 hour'
         WHERE id = $1`,
        [deletingFixture.resultId]
      );
      expect(
        (
          (await selectProfileMediaActionable(client, deletingFixture))
            .result_ids as string[]
        ) ?? []
      ).not.toContain(deletingFixture.resultId);

      for (const outcome of ["deleted", "missing", "failed_terminal"] as const) {
        const terminalFixture = await driveLifecycleToProfileMedia(client);
        const { authorization } = await claimAndAuthorizeProfileMedia(
          client,
          terminalFixture
        );
        await completeProfileMedia(
          client,
          terminalFixture,
          String(authorization.delete_commit_token),
          outcome,
          outcome === "failed_terminal" ? "storage_delete_failed" : null
        );
        expect(
          (
            (await selectProfileMediaActionable(client, terminalFixture))
              .result_ids as string[]
          ) ?? []
        ).not.toContain(terminalFixture.resultId);
      }
    });

    it("B2-DELETING: expired lease deleting rows are excluded from selection", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET execution_state = 'deleting',
             claim_token = gen_random_uuid(),
             claim_lease_expires_at = now() - interval '1 hour',
             delete_commit_token = NULL,
             delete_commit_expires_at = NULL
         WHERE id = $1`,
        [fixture.resultId]
      );
      const selected = await selectProfileMediaActionable(client, fixture);
      expect(selected.ok).toBe(true);
      expect((selected.result_ids as string[]) ?? []).not.toContain(fixture.resultId);
      expect((await claimProfileMedia(client, fixture)).code).toBe("claimed");
    });

    it("B2-HOLDS: request, attempt, and object holds exclude actionable rows", async () => {
      for (const scope of ["request", "attempt", "manifest_object"] as const) {
        const fixture = await driveLifecycleToProfileMedia(client);
        const hold = await asAuthenticatedOwner<ProfileMediaRpcPayload>(
          client,
          `SELECT public.create_account_deletion_storage_preservation_hold(
             $1::uuid,$2::text,'legal_hold'::text,$3::uuid,$4::uuid,NULL
           ) AS payload`,
          [
            fixture.requestId,
            scope,
            scope === "request" ? null : fixture.attemptId,
            scope === "manifest_object" ? fixture.manifestId : null,
          ]
        );
        expect(hold.ok).toBe(true);
        const blocked = await selectProfileMediaActionable(client, fixture);
        expect(blocked.ok).toBe(true);
        expect((blocked.result_ids as string[]) ?? []).not.toContain(fixture.resultId);
      }
    });

    it("B2-HOLDS-RELEASE: releasing object hold restores selection", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      const hold = await asAuthenticatedOwner<ProfileMediaRpcPayload>(
        client,
        `SELECT public.create_account_deletion_storage_preservation_hold(
           $1::uuid,'manifest_object'::text,'legal_hold'::text,$2::uuid,$3::uuid,NULL
         ) AS payload`,
        [fixture.requestId, fixture.attemptId, fixture.manifestId]
      );
      expect(hold.ok).toBe(true);
      expect(
        ((await selectProfileMediaActionable(client, fixture)).result_ids as string[]) ??
          []
      ).not.toContain(fixture.resultId);

      const released = await asAuthenticatedOwner<ProfileMediaRpcPayload>(
        client,
        `SELECT public.release_account_deletion_storage_preservation_hold($1::uuid) AS payload`,
        [hold.hold_id],
        { aal2: true }
      );
      expect(released.ok).toBe(true);
      expect(
        ((await selectProfileMediaActionable(client, fixture)).result_ids as string[]) ??
          []
      ).toContain(fixture.resultId);
    });

    it("B2-LIMIT: DB clamps limit to [1,5]", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      await insertExtraDeferProfileResult(client, fixture, "webp");
      await insertExtraDeferProfileResult(client, fixture, "jpg");

      for (const [limit, maxExpected] of [
        [null, 3],
        [0, 1],
        [-5, 1],
        [1, 1],
        [5, 3],
        [5000, 3],
      ] as const) {
        const payload = await selectProfileMediaActionable(client, fixture, limit);
        expect(payload.ok).toBe(true);
        const ids = (payload.result_ids as string[]) ?? [];
        expect(payload.selected_count).toBe(ids.length);
        expect(ids.length).toBeLessThanOrEqual(Math.min(maxExpected, 5));
        expect(ids.length).toBeLessThanOrEqual(5);
      }
    });

    it("B2-ORDERING: stable created_at/manifest/id ordering", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      const secondId = await insertExtraDeferProfileResult(client, fixture, "webp");
      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET created_at = now() - interval '1 day' WHERE id = $1`,
        [secondId]
      );

      const first = await selectProfileMediaActionable(client, fixture, 5);
      const second = await selectProfileMediaActionable(client, fixture, 5);
      expect(first.result_ids).toEqual(second.result_ids);
      expect((first.result_ids as string[])[0]).toBe(secondId);
    });

    it("B2-RETURN: UUIDs only; no path/bucket/token leakage", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      const payload = await selectProfileMediaActionable(client, fixture);
      expect(payload).toMatchObject({ ok: true, code: "selected" });
      const keys = Object.keys(payload).sort();
      expect(keys).toEqual(["code", "ok", "result_ids", "selected_count"]);
      const ids = payload.result_ids as string[];
      expect(payload.selected_count).toBe(ids.length);
      for (const id of ids) {
        expect(id).toMatch(UUID_RE);
      }
    });

    it("B2-READONLY: selector does not mutate rows or audit", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      const before = await readResultRow(client, fixture.resultId);
      const auditsBefore = await auditCountForRequest(client, fixture.requestId);
      expect(await selectProfileMediaActionable(client, fixture, 5)).toMatchObject({
        ok: true,
      });
      const after = await readResultRow(client, fixture.resultId);
      const auditsAfter = await auditCountForRequest(client, fixture.requestId);
      expect(after).toEqual(before);
      expect(auditsAfter).toBe(auditsBefore);
    });

    it("B2-CONCURRENCY: concurrent selectors are safe and may overlap", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      const clientB = new Client({ connectionString: dbUrl! });
      await clientB.connect();
      try {
        const [a, b] = await Promise.all([
          selectProfileMediaActionable(client, fixture, 5),
          selectProfileMediaActionable(clientB, fixture, 5),
        ]);
        expect(a.ok).toBe(true);
        expect(b.ok).toBe(true);
        expect(a.result_ids).toEqual(b.result_ids);
        const after = await readResultRow(client, fixture.resultId);
        expect(after?.execution_state).toBe("deferred_profile");
        expect(after?.claim_token).toBeNull();
        expect(after?.delete_commit_token).toBeNull();
      } finally {
        await clientB.end();
      }
    });

    it("B2-REFERENCE: selector may return IDs while unrelated malformed blocks claim", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      await client.query(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
      await client.query(`UPDATE public.profiles SET avatar_url = $2 WHERE id = $1`, [
        RUNNER_IT_OTHER,
        `${RUNNER_IT_OTHER}/avatar.png`,
      ]);
      await client.query(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);

      const selected = await selectProfileMediaActionable(client, fixture);
      expect((selected.result_ids as string[]) ?? []).toContain(fixture.resultId);
      expect((await claimProfileMedia(client, fixture)).code).toBe(
        "profile_media_reference_active"
      );
    });
  }
);
