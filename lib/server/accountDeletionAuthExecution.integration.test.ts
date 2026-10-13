/**
 * Real PostgreSQL integration for 3B.4D.1 auth execution DB authority.
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
  assertFreshMigrationProfileHelperPrivileges,
  cleanupProfileIntegration,
  ensureProfileIntegrationGrants,
  isDedicatedVanillaIntegrationDb,
} from "./accountDeletionProfileStage.integrationHarness";
import {
  asAuthenticatedOwner,
  RUNNER_IT_TARGET,
} from "./accountDeletionStorageStageRunner.integrationHarness";
import {
  claimAuthExecutionRpc,
  completeAuthExecutionRpc,
  driveLifecycleToProfileCompleted,
  prepareAuthStageRpc,
} from "./accountDeletionAuthExecution.integrationHarness";

const dbUrl = getAccountDeletionIntegrationDbUrl();
const describeIntegration =
  dbUrl && isDedicatedVanillaIntegrationDb(dbUrl) ? describe : describe.skip;

const OTHER_ATTEMPT = "99999999-9999-4999-8999-999999999999";

describeIntegration(
  `account deletion auth execution integration (${ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV})`,
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
      await cleanupProfileIntegration(client);
      await client?.end();
    }, 120_000);

    it("A-READINESS: auth execution and schema probes pass", async () => {
      const auth = await client.query<{ payload: { ready: boolean } }>(
        `SELECT public.verify_account_deletion_auth_execution_ready() AS payload`
      );
      expect(auth.rows[0]?.payload.ready).toBe(true);
      const schema = await client.query<{ payload: { ready: boolean } }>(
        `SELECT public.verify_account_deletion_schema_execution_ready() AS payload`
      );
      expect(schema.rows[0]?.payload.ready).toBe(true);
    });

    it("A-PREPARE: profile_completed → auth_pending", async () => {
      const fixture = await driveLifecycleToProfileCompleted(client);
      const prepared = await prepareAuthStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(prepared).toMatchObject({
        ok: true,
        code: "prepared",
        stage: "auth_pending",
        target_user_id: RUNNER_IT_TARGET,
      });
      const stage = await client.query<{ stage: string }>(
        `SELECT stage FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [fixture.attemptId]
      );
      expect(stage.rows[0]?.stage).toBe("auth_pending");
    });

    it("A-PREPARE-IDEMPOTENT: auth_pending already_prepared", async () => {
      const fixture = await driveLifecycleToProfileCompleted(client);
      await prepareAuthStageRpc(client, fixture.requestId, fixture.attemptId);
      const second = await prepareAuthStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(second).toMatchObject({ ok: true, code: "already_prepared" });
    });

    it("A-PREPARE-REJECT: wrong attempt and invalid stage", async () => {
      const fixture = await driveLifecycleToProfileCompleted(client);
      const wrongAttempt = await prepareAuthStageRpc(
        client,
        fixture.requestId,
        OTHER_ATTEMPT
      );
      expect(wrongAttempt).toMatchObject({ ok: false, code: "attempt_mismatch" });

      const prepared = await prepareAuthStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(prepared.ok).toBe(true);
    });

    it("A-CLAIM: auth_pending → auth with target and tokens", async () => {
      const fixture = await driveLifecycleToProfileCompleted(client);
      await prepareAuthStageRpc(client, fixture.requestId, fixture.attemptId);
      const claim = await claimAuthExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(claim).toMatchObject({
        ok: true,
        code: "claimed",
        stage: "auth",
        target_user_id: RUNNER_IT_TARGET,
      });
      expect(typeof claim.claim_token).toBe("string");
      expect(typeof claim.delete_commit_token).toBe("string");

      const row = await client.query<{
        stage: string;
        auth_delete_started_at: string | null;
      }>(
        `SELECT stage, auth_delete_started_at
         FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [fixture.attemptId]
      );
      expect(row.rows[0]?.stage).toBe("auth");
      expect(row.rows[0]?.auth_delete_started_at).toBeTruthy();
    });

    it("A-CLAIM-CONCURRENT: second live claim returns already_claimed", async () => {
      const fixture = await driveLifecycleToProfileCompleted(client);
      await prepareAuthStageRpc(client, fixture.requestId, fixture.attemptId);
      const first = await claimAuthExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      const second = await claimAuthExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(second).toMatchObject({ ok: true, code: "already_claimed" });
      expect(second.delete_commit_token).toBe(first.delete_commit_token);
    });

    it("A-COMPLETE: deleted → finalize with evidence", async () => {
      const fixture = await driveLifecycleToProfileCompleted(client);
      await prepareAuthStageRpc(client, fixture.requestId, fixture.attemptId);
      const claim = await claimAuthExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      const complete = await completeAuthExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId,
        String(claim.delete_commit_token),
        "deleted"
      );
      expect(complete).toMatchObject({
        ok: true,
        code: "completed",
        stage: "finalize",
        outcome: "deleted",
      });

      const attempt = await client.query<{
        stage: string;
        auth_deleted_at: string | null;
        auth_rows_affected: Record<string, unknown>;
      }>(
        `SELECT stage, auth_deleted_at, auth_rows_affected
         FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [fixture.attemptId]
      );
      expect(attempt.rows[0]?.stage).toBe("finalize");
      expect(attempt.rows[0]?.auth_deleted_at).toBeTruthy();
      expect(attempt.rows[0]?.auth_rows_affected).toMatchObject({
        auth_execution_completed: 1,
      });

      const request = await client.query<{ status: string }>(
        `SELECT status FROM public.account_deletion_requests WHERE id = $1`,
        [fixture.requestId]
      );
      expect(request.rows[0]?.status).toBe("deletion_in_progress");

      const authRow = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM auth.users WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      expect(Number(authRow.rows[0]?.count ?? 0)).toBe(1);

      const audit = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM public.account_deletion_storage_execution_audit
         WHERE deletion_request_id = $1 AND execution_attempt_id = $2
           AND event_type = 'auth_execution_completed'`,
        [fixture.requestId, fixture.attemptId]
      );
      expect(Number(audit.rows[0]?.count)).toBe(1);
    });

    it("A-COMPLETE-IDEMPOTENT: already_absent retry at finalize", async () => {
      const fixture = await driveLifecycleToProfileCompleted(client);
      await prepareAuthStageRpc(client, fixture.requestId, fixture.attemptId);
      const claim = await claimAuthExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      await completeAuthExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId,
        String(claim.delete_commit_token),
        "already_absent"
      );
      const retry = await completeAuthExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId,
        String(claim.delete_commit_token),
        "already_absent"
      );
      expect(retry).toMatchObject({ ok: true, code: "already_completed" });
    });

    it("A-COMPLETE-REJECT: wrong commit token", async () => {
      const fixture = await driveLifecycleToProfileCompleted(client);
      await prepareAuthStageRpc(client, fixture.requestId, fixture.attemptId);
      const claim = await claimAuthExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      const bad = await completeAuthExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId,
        "00000000-0000-4000-8000-000000000001",
        "deleted"
      );
      expect(bad).toMatchObject({ ok: false, code: "delete_commit_token_mismatch" });
      expect(claim.code).toBe("claimed");
    });

    it("A-CRASH-RECOVERY: expired lease reclaims then completes", async () => {
      const fixture = await driveLifecycleToProfileCompleted(client);
      await prepareAuthStageRpc(client, fixture.requestId, fixture.attemptId);
      const first = await claimAuthExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId,
        60
      );
      await client.query(
        `UPDATE public.account_deletion_execution_attempts
         SET auth_delete_claim_expires_at = now() - interval '1 minute',
             auth_delete_commit_expires_at = now() - interval '1 minute'
         WHERE id = $1`,
        [fixture.attemptId]
      );
      const reclaimed = await claimAuthExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(reclaimed.ok).toBe(true);
      expect(reclaimed.code).toBe("claimed");
      expect(reclaimed.reclaimed).toBe(true);

      const complete = await completeAuthExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId,
        String(reclaimed.delete_commit_token),
        "deleted"
      );
      expect(complete).toMatchObject({ ok: true, code: "completed", stage: "finalize" });

      const target = await client.query<{ target_user_id: string }>(
        `SELECT target_user_id FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [fixture.attemptId]
      );
      expect(target.rows[0]?.target_user_id).toBe(RUNNER_IT_TARGET);
    });

    it("A-HOLD: preservation hold blocks prepare and claim", async () => {
      const fixture = await driveLifecycleToProfileCompleted(client);
      await prepareAuthStageRpc(client, fixture.requestId, fixture.attemptId);
      const hold = await asAuthenticatedOwner<{ ok: boolean }>(
        client,
        `SELECT public.create_account_deletion_storage_preservation_hold(
           $1::uuid,'attempt'::text,'legal_hold'::text,$2::uuid,NULL,NULL
         ) AS payload`,
        [fixture.requestId, fixture.attemptId]
      );
      expect(hold.ok).toBe(true);
      const blockedClaim = await claimAuthExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(blockedClaim).toMatchObject({ ok: false, code: "preservation_hold_active" });
    });

    it("A-SAFETY: attempt never reaches completed stage", async () => {
      const fixture = await driveLifecycleToProfileCompleted(client);
      await prepareAuthStageRpc(client, fixture.requestId, fixture.attemptId);
      const claim = await claimAuthExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      await completeAuthExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId,
        String(claim.delete_commit_token),
        "deleted"
      );
      const stage = await client.query<{ stage: string }>(
        `SELECT stage FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [fixture.attemptId]
      );
      expect(stage.rows[0]?.stage).toBe("finalize");
      expect(stage.rows[0]?.stage).not.toBe("completed");
    });
  }
);
