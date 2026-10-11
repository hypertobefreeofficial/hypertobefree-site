/**
 * Real PostgreSQL helpers for the guarded 3B.4B.1 profile-media integration suite.
 * No helper calls Storage or changes an execution flag.
 */

import type { Client } from "pg";
import {
  asServiceRole,
  driveLifecycleToStorageCompleted,
  prepareProfileStageRpc,
  type StorageCompletedFixture,
} from "./accountDeletionProfileStage.integrationHarness";

export type ProfileMediaFixture = StorageCompletedFixture & {
  resultId: string;
  manifestId: string;
  objectPath: string;
};

export type ProfileMediaRpcPayload = Record<string, unknown>;

export async function driveLifecycleToProfileMedia(
  client: Client,
  options: {
    deletePrivateCount?: number;
    sharedPublicStory?: boolean;
    clearAvatarBeforeCapture?: boolean;
  } = {}
): Promise<ProfileMediaFixture> {
  const fixture = await driveLifecycleToStorageCompleted(client, options);
  const prepared = await prepareProfileStageRpc(
    client,
    fixture.requestId,
    fixture.attemptId
  );
  if (prepared.ok !== true || prepared.code !== "prepared") {
    throw new Error(`profile prepare failed: ${String(prepared.code)}`);
  }
  const result = await client.query<{
    id: string;
    manifest_object_id: string;
    object_path: string;
  }>(
    `SELECT id, manifest_object_id, object_path
     FROM public.account_deletion_storage_execution_results
     WHERE execution_attempt_id = $1
       AND disposition_snapshot = 'DEFER_PROFILE'
     ORDER BY id
     LIMIT 1`,
    [fixture.attemptId]
  );
  const row = result.rows[0];
  if (!row) throw new Error("profile-media result missing");
  return {
    ...fixture,
    resultId: row.id,
    manifestId: row.manifest_object_id,
    objectPath: row.object_path,
  };
}

export function claimProfileMedia(
  client: Client,
  fixture: ProfileMediaFixture,
  overrides: Partial<Pick<ProfileMediaFixture, "requestId" | "attemptId" | "resultId">> = {}
) {
  return asServiceRole<ProfileMediaRpcPayload>(
    client,
    `SELECT public.claim_account_deletion_profile_media_execution_result(
       $1::uuid,$2::uuid,$3::uuid,900
     ) AS payload`,
    [
      overrides.requestId ?? fixture.requestId,
      overrides.attemptId ?? fixture.attemptId,
      overrides.resultId ?? fixture.resultId,
    ]
  );
}

export function authorizeProfileMedia(
  client: Client,
  fixture: ProfileMediaFixture,
  claimToken: string
) {
  return asServiceRole<ProfileMediaRpcPayload>(
    client,
    `SELECT public.authorize_account_deletion_profile_media_delete(
       $1::uuid,$2::uuid,$3::uuid,$4::uuid
     ) AS payload`,
    [fixture.requestId, fixture.attemptId, fixture.resultId, claimToken]
  );
}

export function completeProfileMedia(
  client: Client,
  fixture: ProfileMediaFixture,
  commitToken: string,
  outcome: "deleted" | "missing" | "failed_retryable" | "failed_terminal",
  errorCode: string | null = null
) {
  return asServiceRole<ProfileMediaRpcPayload>(
    client,
    `SELECT public.complete_account_deletion_profile_media_execution_result(
       $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text
     ) AS payload`,
    [
      fixture.requestId,
      fixture.attemptId,
      fixture.resultId,
      commitToken,
      outcome,
      errorCode,
    ]
  );
}

export function selectProfileMediaActionable(
  client: Client,
  fixture: Pick<ProfileMediaFixture, "requestId" | "attemptId">,
  limit?: number | null
) {
  if (limit === undefined) {
    return asServiceRole<ProfileMediaRpcPayload>(
      client,
      `SELECT public.select_account_deletion_profile_media_actionable_result_ids(
         $1::uuid,$2::uuid
       ) AS payload`,
      [fixture.requestId, fixture.attemptId]
    );
  }
  return asServiceRole<ProfileMediaRpcPayload>(
    client,
    `SELECT public.select_account_deletion_profile_media_actionable_result_ids(
       $1::uuid,$2::uuid,$3::integer
     ) AS payload`,
    [fixture.requestId, fixture.attemptId, limit]
  );
}

export async function claimAndAuthorizeProfileMedia(
  client: Client,
  fixture: ProfileMediaFixture
) {
  const claim = await claimProfileMedia(client, fixture);
  if (claim.ok !== true || typeof claim.claim_token !== "string") {
    throw new Error(`claim failed: ${String(claim.code)}`);
  }
  const authorization = await authorizeProfileMedia(
    client,
    fixture,
    claim.claim_token
  );
  if (
    authorization.ok !== true ||
    typeof authorization.delete_commit_token !== "string"
  ) {
    throw new Error(`authorization failed: ${String(authorization.code)}`);
  }
  return { claim, authorization };
}
