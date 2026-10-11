/**
 * PostgreSQL integration for 3B.4B.2.2 profile-media stage tick runner (mock executor).
 */

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV,
  applyAccountDeletionMigrations,
  getAccountDeletionIntegrationDbUrl,
  resetAccountDeletionIntegrationSchema,
} from "./accountDeletionIntegrationHarness";
import {
  cleanupProfileIntegration,
  ensureProfileIntegrationGrants,
  isDedicatedVanillaIntegrationDb,
  seedRunnerIntegrationUsers,
} from "./accountDeletionProfileStage.integrationHarness";
import {
  asServiceRole,
  createPgSupabaseShim,
  RUNNER_IT_TARGET,
} from "./accountDeletionStorageStageRunner.integrationHarness";
import {
  claimAndAuthorizeProfileMedia,
  claimProfileMedia,
  completeProfileMedia,
  driveLifecycleToProfileMedia,
  selectProfileMediaActionable,
  type ProfileMediaFixture,
} from "./accountDeletionProfileMediaExecution.integrationHarness";
import {
  runAccountDeletionProfileMediaTick,
  verifyAccountDeletionProfileMediaStageRunnerReadiness,
} from "./accountDeletionProfileMediaStageRunner";
import { isAccountDeletionPhysicalProfileMediaExecutionEnabled } from "./accountDeletionProfileMediaPolicy";
import type { AccountDeletionProfileMediaObjectExecutorResult } from "./accountDeletionProfileMediaObjectExecutor";

const dbUrl = getAccountDeletionIntegrationDbUrl();
const describeIntegration =
  dbUrl && isDedicatedVanillaIntegrationDb(dbUrl) ? describe : describe.skip;

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

async function verifyProfileMediaRunnerReady(client: Client) {
  const payload = await asServiceRole<{ ready?: boolean }>(
    client,
    `SELECT public.verify_account_deletion_profile_media_runner_ready() AS payload`
  );
  return payload.ready === true;
}

async function runProfileMediaTick(
  client: Client,
  fixture: Pick<ProfileMediaFixture, "requestId" | "attemptId">,
  executeProfileMediaObject: (input: {
    requestId: string;
    attemptId: string;
    resultId: string;
  }) => Promise<AccountDeletionProfileMediaObjectExecutorResult>,
  env?: NodeJS.ProcessEnv
) {
  const mergedEnv = { ...process.env, ...env };
  return runAccountDeletionProfileMediaTick({
    requestId: fixture.requestId,
    attemptId: fixture.attemptId,
    deps: {
      serviceRoleClient: createPgSupabaseShim(client),
      verifyRunnerReadiness: () =>
        verifyAccountDeletionProfileMediaStageRunnerReadiness(
          createPgSupabaseShim(client)
        ),
      isPhysicalProfileMediaExecutionEnabled: () =>
        isAccountDeletionPhysicalProfileMediaExecutionEnabled(mergedEnv),
      executeProfileMediaObject,
    },
  });
}

describeIntegration("accountDeletionProfileMediaStageRunner integration", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: dbUrl });
    await client.connect();
    await resetAccountDeletionIntegrationSchema(client);
    await applyAccountDeletionMigrations(client);
    await ensureProfileIntegrationGrants(client);
    await seedRunnerIntegrationUsers(client);
    expect(await verifyProfileMediaRunnerReady(client)).toBe(true);
  }, 120_000);

  afterAll(async () => {
    await cleanupProfileIntegration(client);
    await client.end();
  }, 120_000);

  it("requires dedicated integration DB env", () => {
    expect(process.env[ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV]).toBeTruthy();
  });

  it("zero-avatar completion when profile media work is already complete", async () => {
    const fixture = await driveLifecycleToProfileMedia(client);
    const { authorization } = await claimAndAuthorizeProfileMedia(client, fixture);
    await completeProfileMedia(
      client,
      fixture,
      String(authorization.delete_commit_token),
      "deleted"
    );
    const result = await runProfileMediaTick(
      client,
      fixture,
      vi.fn(async () => ({
        ok: true,
        code: "deleted",
        executionState: "deleted",
      }))
    );
    expect(result).toMatchObject({
      ok: true,
      code: "profile_media_completed",
    });
  });

  it("selects at most five IDs and invokes mock executor sequentially", async () => {
    const fixture = await driveLifecycleToProfileMedia(client);
    for (const ext of ["webp", "jpg", "jpeg"] as const) {
      await insertExtraDeferProfileResult(client, fixture, ext);
    }
    const selected = await selectProfileMediaActionable(client, fixture, 99);
    expect(selected.ok).toBe(true);
    expect((selected.result_ids as string[]).length).toBeLessThanOrEqual(5);

    const order: string[] = [];
    const executeProfileMediaObject = vi.fn(
      async (input: { resultId: string }) => {
        order.push(input.resultId);
        return {
          ok: true,
          code: "already_terminal",
          executionState: "deleted",
        } satisfies AccountDeletionProfileMediaObjectExecutorResult;
      }
    );

    const result = await runProfileMediaTick(
      client,
      fixture,
      executeProfileMediaObject,
      {
        HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED: "true",
        HTBF_ACCOUNT_DELETION_PROFILE_EXECUTION_ENABLED: "true",
        HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED: "true",
      }
    );
    expect(executeProfileMediaObject.mock.calls.length).toBeLessThanOrEqual(5);
    expect(order.length).toBe(executeProfileMediaObject.mock.calls.length);
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i]).not.toBe(order[i - 1]);
    }
    expect(result.selectedCount).toBeLessThanOrEqual(5);
    expect(JSON.stringify(result)).not.toMatch(/resultId/);
  });

  it("returns blocked when terminal failure exists", async () => {
    const fixture = await driveLifecycleToProfileMedia(client);
    await client.query(
      `UPDATE public.account_deletion_storage_execution_results
       SET execution_state = 'failed_terminal' WHERE id = $1`,
      [fixture.resultId]
    );
    const result = await runProfileMediaTick(
      client,
      fixture,
      vi.fn(async () => ({
        ok: true,
        code: "deleted",
        executionState: "deleted",
      }))
    );
    expect(result.code).toBe("profile_media_blocked");
  });

  it("returns in progress for deleting-only rows without calling executor", async () => {
    const fixture = await driveLifecycleToProfileMedia(client);
    const claim = await claimProfileMedia(client, fixture);
    expect(claim.ok).toBe(true);
    const executeProfileMediaObject = vi.fn();
    const result = await runProfileMediaTick(
      client,
      fixture,
      executeProfileMediaObject,
      {
        HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED: "true",
        HTBF_ACCOUNT_DELETION_PROFILE_EXECUTION_ENABLED: "true",
        HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED: "true",
      }
    );
    expect(result.code).toBe("profile_media_in_progress");
    expect(executeProfileMediaObject).not.toHaveBeenCalled();
  });

  it("fails closed when attempt lifecycle is not profile-active", async () => {
    const fixture = await driveLifecycleToProfileMedia(client);
    await client.query(
      `UPDATE public.account_deletion_execution_attempts SET stage = 'storage_completed' WHERE id = $1`,
      [fixture.attemptId]
    );
    const result = await runProfileMediaTick(
      client,
      fixture,
      vi.fn(async () => ({
        ok: true,
        code: "deleted",
        executionState: "deleted",
      }))
    );
    expect(result.code).toBe("precondition_failed");
  });

  it("concurrent ticks do not accept caller-supplied result IDs", async () => {
    const fixture = await driveLifecycleToProfileMedia(client);
    const executeProfileMediaObject = vi.fn(
      async (): Promise<AccountDeletionProfileMediaObjectExecutorResult> => ({
        ok: true,
        code: "already_terminal",
        executionState: "deleted",
      })
    );
    const [a, b] = await Promise.all([
      runProfileMediaTick(client, fixture, executeProfileMediaObject, {
        HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED: "true",
        HTBF_ACCOUNT_DELETION_PROFILE_EXECUTION_ENABLED: "true",
        HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED: "true",
      }),
      runProfileMediaTick(client, fixture, executeProfileMediaObject, {
        HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED: "true",
        HTBF_ACCOUNT_DELETION_PROFILE_EXECUTION_ENABLED: "true",
        HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED: "true",
      }),
    ]);
    expect(a.ok).toBeTruthy();
    expect(b.ok).toBeTruthy();
    expect(executeProfileMediaObject.mock.calls.length).toBeLessThanOrEqual(10);
    for (const call of executeProfileMediaObject.mock.calls) {
      expect(call[0]).toMatchObject({
        requestId: fixture.requestId,
        attemptId: fixture.attemptId,
      });
      expect(typeof call[0].resultId).toBe("string");
    }
  });
});
