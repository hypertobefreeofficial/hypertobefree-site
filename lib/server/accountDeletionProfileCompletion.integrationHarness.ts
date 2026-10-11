/**
 * PostgreSQL helpers for 3B.4C.1 profile completion integration tests.
 */

import type { Client } from "pg";
import { asServiceRole } from "./accountDeletionProfileStage.integrationHarness";
import {
  claimAndAuthorizeProfileMedia,
  completeProfileMedia,
  driveLifecycleToProfileMedia,
  type ProfileMediaFixture,
} from "./accountDeletionProfileMediaExecution.integrationHarness";
import {
  driveLifecycleToStorageCompleted,
  prepareProfileStageRpc,
  type StorageCompletedFixture,
} from "./accountDeletionProfileStage.integrationHarness";

export type ProfileCompletionRpcPayload = Record<string, unknown>;

export function finalizeProfileStageRpc(
  client: Client,
  requestId: string,
  attemptId: string
) {
  return asServiceRole<ProfileCompletionRpcPayload>(
    client,
    `SELECT public.finalize_account_deletion_profile_stage($1::uuid,$2::uuid) AS payload`,
    [requestId, attemptId]
  );
}

/** Profile stage prepared; profile-media terminal when DEFER_PROFILE rows exist. */
export async function driveLifecycleToProfileReadyForFinalize(
  client: Client,
  options: {
    deletePrivateCount?: number;
    sharedPublicStory?: boolean;
    clearAvatarBeforeCapture?: boolean;
  } = {}
): Promise<ProfileMediaFixture> {
  const fixture = await driveLifecycleToProfileMedia(client, options);
  const deferCount = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM public.account_deletion_storage_execution_results
     WHERE execution_attempt_id = $1
       AND disposition_snapshot = 'DEFER_PROFILE'`,
    [fixture.attemptId]
  );
  if (Number(deferCount.rows[0]?.count ?? 0) === 0) {
    return fixture;
  }
  const { authorization } = await claimAndAuthorizeProfileMedia(client, fixture);
  await completeProfileMedia(
    client,
    fixture,
    String(authorization.delete_commit_token),
    "deleted"
  );
  return fixture;
}

export async function driveLifecycleToProfileReadyForFinalizeMissingAvatar(
  client: Client
): Promise<ProfileMediaFixture> {
  const fixture = await driveLifecycleToProfileMedia(client);
  const { authorization } = await claimAndAuthorizeProfileMedia(client, fixture);
  await completeProfileMedia(
    client,
    fixture,
    String(authorization.delete_commit_token),
    "missing"
  );
  return fixture;
}

/** No DEFER_PROFILE manifest rows; profile-media completion is vacuously satisfied. */
export async function driveLifecycleToProfileZeroAvatarReady(
  client: Client
): Promise<StorageCompletedFixture & { requestId: string; attemptId: string }> {
  const fixture = await driveLifecycleToStorageCompleted(client, {
    neverHadAvatar: true,
    deletePrivateCount: 0,
  });
  const prepared = await prepareProfileStageRpc(
    client,
    fixture.requestId,
    fixture.attemptId
  );
  if (prepared.ok !== true) {
    throw new Error(`profile prepare failed: ${String(prepared.code)}`);
  }
  return fixture;
}
