/**
 * Real PostgreSQL integration for 3B.4D.4 terminal completion authority.
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
  driveLifecycleToAuthFinalize,
  driveLifecycleToProfileCompleted,
  finalizeAccountDeletionExecutionRpc,
  prepareAuthStageRpc,
} from "./accountDeletionAuthExecution.integrationHarness";

const dbUrl = getAccountDeletionIntegrationDbUrl();
const describeIntegration =
  dbUrl && isDedicatedVanillaIntegrationDb(dbUrl) ? describe : describe.skip;

const OTHER_ATTEMPT = "99999999-9999-4999-8999-999999999999";

describeIntegration(
  `account deletion terminal completion integration (${ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV})`,
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

    it("T-READINESS: terminal and schema probes pass", async () => {
      const terminal = await client.query<{ payload: { ready: boolean } }>(
        `SELECT public.verify_account_deletion_terminal_completion_ready() AS payload`
      );
      expect(terminal.rows[0]?.payload.ready).toBe(true);
      const schema = await client.query<{ payload: { ready: boolean } }>(
        `SELECT public.verify_account_deletion_schema_execution_ready() AS payload`
      );
      expect(schema.rows[0]?.payload.ready).toBe(true);
    });

    it("T-PRIMARY: finalize with full evidence → completed + deleted + audit", async () => {
      const fixture = await driveLifecycleToAuthFinalize(client);
      const result = await finalizeAccountDeletionExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(result).toMatchObject({
        ok: true,
        code: "completed",
        attempt_stage: "completed",
        attempt_status: "completed",
        request_status: "deleted",
        target_user_id: RUNNER_IT_TARGET,
      });

      const attempt = await client.query<{
        stage: string;
        status: string;
        completed_at: string | null;
      }>(
        `SELECT stage, status, completed_at
         FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [fixture.attemptId]
      );
      expect(attempt.rows[0]).toMatchObject({
        stage: "completed",
        status: "completed",
      });
      expect(attempt.rows[0]?.completed_at).toBeTruthy();

      const request = await client.query<{
        status: string;
        execution_completed_at: string | null;
      }>(
        `SELECT status, execution_completed_at
         FROM public.account_deletion_requests WHERE id = $1`,
        [fixture.requestId]
      );
      expect(request.rows[0]).toMatchObject({ status: "deleted" });
      expect(request.rows[0]?.execution_completed_at).toBeTruthy();

      const audit = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM public.account_deletion_storage_execution_audit
         WHERE deletion_request_id = $1 AND execution_attempt_id = $2
           AND event_type = 'account_deletion_completed'`,
        [fixture.requestId, fixture.attemptId]
      );
      expect(Number(audit.rows[0]?.count)).toBe(1);

      const authUsers = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM auth.users WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      expect(Number(authUsers.rows[0]?.count ?? 0)).toBe(1);
    });

    it("T-REPLAY: already_completed without duplicate terminal mutation", async () => {
      const fixture = await driveLifecycleToAuthFinalize(client);
      const first = await finalizeAccountDeletionExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(first.code).toBe("completed");
      const second = await finalizeAccountDeletionExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(second).toMatchObject({ ok: true, code: "already_completed" });

      const audit = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM public.account_deletion_storage_execution_audit
         WHERE deletion_request_id = $1 AND execution_attempt_id = $2
           AND event_type = 'account_deletion_completed'`,
        [fixture.requestId, fixture.attemptId]
      );
      expect(Number(audit.rows[0]?.count)).toBe(1);
    });

    it("T-BINDING: wrong attempt rejected", async () => {
      const fixture = await driveLifecycleToAuthFinalize(client);
      const bad = await finalizeAccountDeletionExecutionRpc(
        client,
        fixture.requestId,
        OTHER_ATTEMPT
      );
      expect(bad).toMatchObject({ ok: false, code: "attempt_mismatch" });
    });

    it("T-STAGE: auth stage cannot complete terminally", async () => {
      const fixture = await driveLifecycleToProfileCompleted(client);
      await prepareAuthStageRpc(client, fixture.requestId, fixture.attemptId);
      await claimAuthExecutionRpc(client, fixture.requestId, fixture.attemptId);
      const bad = await finalizeAccountDeletionExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(bad).toMatchObject({ ok: false, code: "invalid_stage" });
    });

    it("T-STAGE: profile_completed cannot complete terminally", async () => {
      const fixture = await driveLifecycleToProfileCompleted(client);
      const bad = await finalizeAccountDeletionExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(bad).toMatchObject({ ok: false, code: "invalid_stage" });
    });

    it("T-AUTH: missing auth_deleted_at rejected", async () => {
      const fixture = await driveLifecycleToAuthFinalize(client);
      await client.query(
        `UPDATE public.account_deletion_execution_attempts
         SET auth_deleted_at = NULL WHERE id = $1`,
        [fixture.attemptId]
      );
      const bad = await finalizeAccountDeletionExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(bad).toMatchObject({ ok: false, code: "terminal_precondition_failed" });
    });

    it("T-HOLD: active hold at finalize does not block terminal bookkeeping", async () => {
      const fixture = await driveLifecycleToAuthFinalize(client);
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

      const terminal = await finalizeAccountDeletionExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(terminal).toMatchObject({ ok: true, code: "completed" });
    });

    it("T-INCONSISTENCY: attempt completed but request not deleted fails closed", async () => {
      const fixture = await driveLifecycleToAuthFinalize(client);
      await client.query(
        `UPDATE public.account_deletion_execution_attempts
         SET stage = 'completed', status = 'completed', completed_at = now()
         WHERE id = $1`,
        [fixture.attemptId]
      );
      const bad = await finalizeAccountDeletionExecutionRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(bad).toMatchObject({ ok: false, code: "inconsistent_state" });
    });
  }
);
