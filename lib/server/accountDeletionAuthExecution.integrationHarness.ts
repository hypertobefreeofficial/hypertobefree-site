/**
 * PostgreSQL helpers for 3B.4D.1 auth execution authority integration tests.
 */

import type { Client } from "pg";
import { asServiceRole } from "./accountDeletionProfileStage.integrationHarness";
import {
  driveLifecycleToProfileZeroAvatarReady,
  finalizeProfileStageRpc,
} from "./accountDeletionProfileCompletion.integrationHarness";
import { RUNNER_IT_TARGET } from "./accountDeletionStorageStageRunner.integrationHarness";

export type AuthExecutionRpcPayload = Record<string, unknown>;

export async function driveLifecycleToProfileCompleted(client: Client) {
  const fixture = await driveLifecycleToProfileZeroAvatarReady(client);
  const finalized = await finalizeProfileStageRpc(
    client,
    fixture.requestId,
    fixture.attemptId
  );
  if (finalized.ok !== true || finalized.code !== "finalized") {
    throw new Error(`profile finalize failed: ${String(finalized.code)}`);
  }
  return {
    requestId: fixture.requestId,
    attemptId: fixture.attemptId,
    targetUserId: RUNNER_IT_TARGET,
  };
}

export function prepareAuthStageRpc(
  client: Client,
  requestId: string,
  attemptId: string
) {
  return asServiceRole<AuthExecutionRpcPayload>(
    client,
    `SELECT public.prepare_account_deletion_auth_stage($1::uuid,$2::uuid) AS payload`,
    [requestId, attemptId]
  );
}

export function claimAuthExecutionRpc(
  client: Client,
  requestId: string,
  attemptId: string,
  leaseSeconds = 900
) {
  return asServiceRole<AuthExecutionRpcPayload>(
    client,
    `SELECT public.claim_account_deletion_auth_execution($1::uuid,$2::uuid,$3::integer) AS payload`,
    [requestId, attemptId, leaseSeconds]
  );
}

export function completeAuthExecutionRpc(
  client: Client,
  requestId: string,
  attemptId: string,
  deleteCommitToken: string,
  outcome: "deleted" | "already_absent"
) {
  return asServiceRole<AuthExecutionRpcPayload>(
    client,
    `SELECT public.complete_account_deletion_auth_execution($1::uuid,$2::uuid,$3::uuid,$4::text) AS payload`,
    [requestId, attemptId, deleteCommitToken, outcome]
  );
}

/** Full pipeline through Auth complete at attempt.stage = finalize (non-terminal). */
export async function driveLifecycleToAuthFinalize(client: Client) {
  const fixture = await driveLifecycleToProfileCompleted(client);
  await prepareAuthStageRpc(client, fixture.requestId, fixture.attemptId);
  const claim = await claimAuthExecutionRpc(
    client,
    fixture.requestId,
    fixture.attemptId
  );
  if (claim.ok !== true || claim.code !== "claimed") {
    throw new Error(`auth claim failed: ${String(claim.code)}`);
  }
  const complete = await completeAuthExecutionRpc(
    client,
    fixture.requestId,
    fixture.attemptId,
    String(claim.delete_commit_token),
    "deleted"
  );
  if (complete.ok !== true || complete.code !== "completed") {
    throw new Error(`auth complete failed: ${String(complete.code)}`);
  }
  return fixture;
}

export function finalizeAccountDeletionExecutionRpc(
  client: Client,
  requestId: string,
  attemptId: string
) {
  return asServiceRole<AuthExecutionRpcPayload>(
    client,
    `SELECT public.finalize_account_deletion_execution($1::uuid,$2::uuid) AS payload`,
    [requestId, attemptId]
  );
}
