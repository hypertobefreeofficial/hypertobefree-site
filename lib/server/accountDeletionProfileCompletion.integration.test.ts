/**
 * Real PostgreSQL integration for 3B.4C.1 profile completion finalizer.
 */

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV,
  applyAccountDeletionMigrations,
  getAccountDeletionIntegrationDbUrl,
  resetAccountDeletionIntegrationSchema,
} from "./accountDeletionIntegrationHarness";
import {
  asAuthenticatedUser,
  asServiceRole,
  assertFreshMigrationProfileHelperPrivileges,
  cleanupProfileIntegration,
  driveLifecycleToStorageCompleted,
  ensureProfileIntegrationGrants,
  isDedicatedVanillaIntegrationDb,
  prepareProfileStageRpc,
  PROFILE_IT_STORY,
  PROFILE_SYNTHETIC,
  RUNNER_IT_TARGET,
  setAttemptStagePrivileged,
} from "./accountDeletionProfileStage.integrationHarness";
import { asAuthenticatedOwner } from "./accountDeletionStorageStageRunner.integrationHarness";
import {
  claimProfileMedia,
  driveLifecycleToProfileMedia,
} from "./accountDeletionProfileMediaExecution.integrationHarness";
import {
  driveLifecycleToProfileReadyForFinalize,
  driveLifecycleToProfileReadyForFinalizeMissingAvatar,
  driveLifecycleToProfileZeroAvatarReady,
  finalizeProfileStageRpc,
} from "./accountDeletionProfileCompletion.integrationHarness";

const dbUrl = getAccountDeletionIntegrationDbUrl();
const describeIntegration =
  dbUrl && isDedicatedVanillaIntegrationDb(dbUrl) ? describe : describe.skip;

describeIntegration(
  `account deletion profile completion integration (${ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV})`,
  () => {
    let client: Client;

    beforeAll(async () => {
      client = new Client({ connectionString: dbUrl! });
      await client.connect();
      await resetAccountDeletionIntegrationSchema(client);
      await applyAccountDeletionMigrations(client);
      await assertFreshMigrationProfileHelperPrivileges(client);
      await ensureProfileIntegrationGrants(client);
    }, 300_000);

    afterAll(async () => {
      await client?.end();
    });

    it("C-READINESS: profile completion and schema probes pass", async () => {
      const completion = await client.query<{ payload: { ready: boolean } }>(
        `SELECT public.verify_account_deletion_profile_completion_ready() AS payload`
      );
      expect(completion.rows[0]?.payload.ready).toBe(true);
      const schema = await client.query<{ payload: { ready: boolean } }>(
        `SELECT public.verify_account_deletion_schema_execution_ready() AS payload`
      );
      expect(schema.rows[0]?.payload.ready).toBe(true);
    });

    it("C-HAPPY: finalize deletes scrubbed shell and sets profile_completed", async () => {
      const fixture = await driveLifecycleToProfileReadyForFinalize(client);
      const beforeAuth = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM auth.users WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      const result = await finalizeProfileStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(result).toMatchObject({
        ok: true,
        code: "finalized",
        stage: "profile_completed",
      });
      expect(result.profile_rows_affected).toMatchObject({
        profile_shell_deleted: 1,
      });
      const profile = await client.query(`SELECT 1 FROM public.profiles WHERE id = $1`, [
        RUNNER_IT_TARGET,
      ]);
      expect(profile.rowCount).toBe(0);
      const stage = await client.query<{ stage: string }>(
        `SELECT stage FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [fixture.attemptId]
      );
      expect(stage.rows[0]?.stage).toBe("profile_completed");
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
    });

    it("C-HAPPY-MISSING: finalize after profile media marked missing", async () => {
      const fixture = await driveLifecycleToProfileReadyForFinalizeMissingAvatar(client);
      const result = await finalizeProfileStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(result).toMatchObject({ ok: true, code: "finalized" });
    });

    it("C-ZERO-AVATAR: never-avatar capture yields total=0 and finalize succeeds", async () => {
      const fixture = await driveLifecycleToProfileZeroAvatarReady(client);
      const progress = await asServiceRole<{
        completion_blocked: boolean;
        total: number;
        result_count: number;
      }>(
        client,
        `SELECT public.account_deletion_profile_media_progress_snapshot($1::uuid,$2::uuid) AS payload`,
        [fixture.requestId, fixture.attemptId]
      );
      expect(progress.total).toBe(0);
      expect(progress.result_count).toBe(0);
      expect(progress.completion_blocked).toBe(false);
      const result = await finalizeProfileStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(result).toMatchObject({ ok: true, code: "finalized" });
    });

    it("C-IDEMPOTENT: strict already_finalized on retry", async () => {
      const fixture = await driveLifecycleToProfileReadyForFinalize(client);
      const first = await finalizeProfileStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(first.ok).toBe(true);
      const auditBefore = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM public.account_deletion_storage_execution_audit
         WHERE deletion_request_id = $1 AND execution_attempt_id = $2
           AND event_type = 'profile_shell_deleted'`,
        [fixture.requestId, fixture.attemptId]
      );
      const second = await finalizeProfileStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(second).toMatchObject({ ok: true, code: "already_finalized" });
      const auditAfter = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM public.account_deletion_storage_execution_audit
         WHERE deletion_request_id = $1 AND execution_attempt_id = $2
           AND event_type = 'profile_shell_deleted'`,
        [fixture.requestId, fixture.attemptId]
      );
      expect(auditAfter.rows[0]?.count).toBe(auditBefore.rows[0]?.count);
      expect(Number(auditAfter.rows[0]?.count)).toBe(1);
    });

    it("C-IDEMPOTENT-FAIL-AUDIT: missing audit evidence fails closed", async () => {
      const fixture = await driveLifecycleToProfileReadyForFinalize(client);
      await finalizeProfileStageRpc(client, fixture.requestId, fixture.attemptId);
      await client.query(
        `DELETE FROM public.account_deletion_storage_execution_audit
         WHERE deletion_request_id = $1 AND execution_attempt_id = $2
           AND event_type = 'profile_shell_deleted'`,
        [fixture.requestId, fixture.attemptId]
      );
      const broken = await finalizeProfileStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(broken).toMatchObject({ ok: false, code: "inconsistent_state" });
    });

    it("C-IDEMPOTENT-FAIL-PROFILE: profile_completed with profile row fails closed", async () => {
      const fixture = await driveLifecycleToProfileReadyForFinalize(client);
      await finalizeProfileStageRpc(client, fixture.requestId, fixture.attemptId);
      await client.query(
        `INSERT INTO public.profiles (id, email, username)
         VALUES ($1, $2, $3)`,
        [RUNNER_IT_TARGET, "ghost-recreated@test.invalid", "ghost_runner_user"]
      );
      const broken = await finalizeProfileStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(broken).toMatchObject({ ok: false, code: "inconsistent_state" });
    });

    it("C-INCONSISTENT: stage profile with missing shell fails closed", async () => {
      const fixture = await driveLifecycleToProfileReadyForFinalize(client);
      await client.query(`DELETE FROM public.profiles WHERE id = $1`, [RUNNER_IT_TARGET]);
      const broken = await finalizeProfileStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(broken).toMatchObject({ ok: false, code: "inconsistent_state" });
    });

    it("C-IDEMPOTENT-FAIL: profile_completed without evidence fails closed", async () => {
      const fixture = await driveLifecycleToProfileReadyForFinalize(client);
      await finalizeProfileStageRpc(client, fixture.requestId, fixture.attemptId);
      await client.query(
        `UPDATE public.account_deletion_execution_attempts
         SET profile_rows_affected = profile_rows_affected - 'profile_shell_deleted'
         WHERE id = $1`,
        [fixture.attemptId]
      );
      const broken = await finalizeProfileStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(broken).toMatchObject({ ok: false, code: "inconsistent_state" });
    });

    it("C-BLOCK-HOLD: object preservation hold blocks finalize", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client, {
        deferProfileHold: true,
      });
      await prepareProfileStageRpc(client, requestId, attemptId);
      const blocked = await finalizeProfileStageRpc(client, requestId, attemptId);
      expect(blocked).toMatchObject({ ok: false, code: "profile_media_not_complete" });
    });

    it("C-BLOCK-DEFERRED: deferred_profile blocks finalize", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      const blocked = await finalizeProfileStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(blocked.code).toBe("profile_media_not_complete");
    });

    it("C-BLOCK-DELETING: deleting state blocks finalize", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      const claim = await claimProfileMedia(client, fixture);
      expect(claim.ok).toBe(true);
      const blocked = await finalizeProfileStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(blocked).toMatchObject({ ok: false, code: "profile_media_not_complete" });
    });

    it("C-BLOCK-FAILED-TERMINAL: failed_terminal blocks finalize", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET execution_state = 'failed_terminal' WHERE id = $1`,
        [fixture.resultId]
      );
      const blocked = await finalizeProfileStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(blocked).toMatchObject({ ok: false, code: "profile_media_not_complete" });
    });

    it("C-BLOCK-SCRUB: non-scrubbed email blocks finalize", async () => {
      const fixture = await driveLifecycleToProfileReadyForFinalize(client);
      await client.query(
        `UPDATE public.profiles SET email = $1 WHERE id = $2`,
        [PROFILE_SYNTHETIC.email, RUNNER_IT_TARGET]
      );
      const blocked = await finalizeProfileStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(blocked.ok).toBe(false);
      expect(["profile_media_not_complete", "profile_delete_invariant_failed"]).toContain(
        blocked.code
      );
    });

    it("C-BLOCK-MANIFEST: storage_manifest_status not finalized blocks", async () => {
      const fixture = await driveLifecycleToProfileReadyForFinalize(client);
      await client.query(
        `UPDATE public.account_deletion_execution_attempts
         SET storage_manifest_status = 'open' WHERE id = $1`,
        [fixture.attemptId]
      );
      const blocked = await finalizeProfileStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(blocked).toMatchObject({ ok: false, code: "storage_manifest_not_finalized" });
    });

    it("C-BLOCK-MEDIA: incomplete profile media blocks finalize", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      const blocked = await finalizeProfileStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(blocked).toMatchObject({ ok: false, code: "profile_media_not_complete" });
      const profile = await client.query(`SELECT 1 FROM public.profiles WHERE id = $1`, [
        RUNNER_IT_TARGET,
      ]);
      expect(profile.rowCount).toBe(1);
    });

    it("C-BLOCK-STAGE: storage_completed cannot finalize", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      await client.query(
        `UPDATE public.account_deletion_execution_attempts SET stage = 'storage_completed' WHERE id = $1`,
        [fixture.attemptId]
      );
      const blocked = await finalizeProfileStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(blocked).toMatchObject({ ok: false, code: "invalid_stage" });
    });

    it("C-PRIV-NO-TABLE-DELETE: service_role lacks direct profiles DELETE", async () => {
      const priv = await client.query<{ can_delete: boolean }>(
        `SELECT has_table_privilege('service_role', 'public.profiles', 'DELETE') AS can_delete`
      );
      expect(priv.rows[0]?.can_delete).toBe(false);
    });

    it("C-PRIV: finalize RPC is service_role-only in catalog", async () => {
      const priv = await client.query<{
        auth_exec: boolean;
        anon_exec: boolean;
        service_exec: boolean;
      }>(
        `SELECT
           has_function_privilege(
             'authenticated',
             'public.finalize_account_deletion_profile_stage(uuid, uuid)',
             'EXECUTE'
           ) AS auth_exec,
           has_function_privilege(
             'anon',
             'public.finalize_account_deletion_profile_stage(uuid, uuid)',
             'EXECUTE'
           ) AS anon_exec,
           has_function_privilege(
             'service_role',
             'public.finalize_account_deletion_profile_stage(uuid, uuid)',
             'EXECUTE'
           ) AS service_exec`
      );
      expect(priv.rows[0]).toMatchObject({
        auth_exec: false,
        anon_exec: false,
        service_exec: true,
      });
    });

    it("C-RECREATE-DENIED: authenticated INSERT profile blocked during deletion", async () => {
      const fixture = await driveLifecycleToProfileReadyForFinalize(client);
      await finalizeProfileStageRpc(client, fixture.requestId, fixture.attemptId);
      await expect(
        asAuthenticatedUser(
          client,
          RUNNER_IT_TARGET,
          `INSERT INTO public.profiles (id, email) VALUES ($1, 'recreated@test.invalid')`,
          [RUNNER_IT_TARGET]
        )
      ).rejects.toMatchObject({ code: "42501" });
    });

    it("C-PUBLIC-SURVIVES: shared story row remains after profile DELETE", async () => {
      const fixture = await driveLifecycleToProfileReadyForFinalize(client, {
        sharedPublicStory: true,
      });
      await finalizeProfileStageRpc(client, fixture.requestId, fixture.attemptId);
      const story = await client.query<{ id: string }>(
        `SELECT id FROM public.stories WHERE id = $1`,
        [PROFILE_IT_STORY]
      );
      expect(story.rowCount).toBe(1);
    });

    it("C-DUAL-FINALIZE: two finalize calls serialize to one mutation", async () => {
      const fixture = await driveLifecycleToProfileReadyForFinalize(client);
      const clientB = new Client({ connectionString: dbUrl! });
      await clientB.connect();
      const [first, second] = await Promise.all([
        finalizeProfileStageRpc(client, fixture.requestId, fixture.attemptId),
        finalizeProfileStageRpc(clientB, fixture.requestId, fixture.attemptId),
      ]);
      await clientB.end();
      const codes = [first.code, second.code].sort();
      expect(codes).toEqual(["already_finalized", "finalized"]);
      const audit = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM public.account_deletion_storage_execution_audit
         WHERE deletion_request_id = $1 AND execution_attempt_id = $2
           AND event_type = 'profile_shell_deleted'`,
        [fixture.requestId, fixture.attemptId]
      );
      expect(Number(audit.rows[0]?.count)).toBe(1);
    });

    it("C-HOLD-RACE: hold create blocks while request lock held like finalizer prefix", async () => {
      const fixture = await driveLifecycleToProfileReadyForFinalize(client);
      const blocker = new Client({ connectionString: dbUrl! });
      await blocker.connect();
      await blocker.query("BEGIN");
      await blocker.query(
        `SELECT id FROM public.account_deletion_requests WHERE id = $1 FOR UPDATE`,
        [fixture.requestId]
      );
      const holdPromise = asAuthenticatedOwner<{ ok: boolean }>(
        client,
        `SELECT public.create_account_deletion_storage_preservation_hold(
           $1::uuid,'attempt'::text,'legal_hold'::text,$2::uuid,NULL,NULL
         ) AS payload`,
        [fixture.requestId, fixture.attemptId]
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      let holdSettled = false;
      void holdPromise.then(() => {
        holdSettled = true;
      });
      expect(holdSettled).toBe(false);
      await blocker.query("COMMIT");
      const hold = await holdPromise;
      expect(hold.ok).toBe(true);
      await blocker.end();
    });

    it("C-FINALIZE-VS-CLAIM: concurrent claim waits until finalize completes", async () => {
      const fixture = await driveLifecycleToProfileReadyForFinalize(client);
      const peer = new Client({ connectionString: dbUrl! });
      await peer.connect();
      const claimPromise = claimProfileMedia(peer, fixture);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const finalize = await finalizeProfileStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(finalize.code).toBe("finalized");
      const claim = await claimPromise;
      expect(claim.ok).toBe(false);
      expect(["attempt_mismatch", "not_claimable"]).toContain(claim.code);
      await peer.end();
    });

    it("C-CONCURRENT: claim blocks while finalize holds request lock", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      await client.query("BEGIN");
      await client.query(
        `SELECT id FROM public.account_deletion_requests WHERE id = $1 FOR UPDATE`,
        [fixture.requestId]
      );
      const clientB = new Client({ connectionString: dbUrl! });
      await clientB.connect();
      const claimPromise = claimProfileMedia(clientB, fixture);
      await new Promise((resolve) => setTimeout(resolve, 150));
      let claimSettled = false;
      claimPromise.then(() => {
        claimSettled = true;
      });
      expect(claimSettled).toBe(false);
      await client.query("ROLLBACK");
      const claim = await claimPromise;
      expect(claim.ok).toBe(true);
      await clientB.end();
    });

    it("C-IRREVERSIBLE: auth stage rejected", async () => {
      const fixture = await driveLifecycleToProfileReadyForFinalize(client);
      await setAttemptStagePrivileged(client, fixture.attemptId, "auth");
      const blocked = await finalizeProfileStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(blocked).toMatchObject({ ok: false, code: "irreversible_stage" });
    });
  }
);
