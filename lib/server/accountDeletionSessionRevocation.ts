import type { SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNT_DELETION_RETRYABLE_FAILURE_FREEZE_NOTE } from "./accountDeletionAcquisition";
import {
  advanceAccountDeletionAttemptToSessionsPending,
  advanceAccountDeletionAttemptToSessionsRevoked,
  type AccountDeletionAttemptStageTransitionResult,
  type AccountDeletionSessionRevocationFailureRecordResult,
  recordAccountDeletionSessionRevocationFailure,
} from "./accountDeletionAttemptStageTransitions";

export type AccountDeletionSessionRevocationErrorCode =
  | "invalid_target"
  | "session_revocation_failed"
  | "internal_error";

export type AccountDeletionSessionRevocationResult =
  | { ok: true }
  | { ok: false; code: AccountDeletionSessionRevocationErrorCode; detail?: string };

export type AccountDeletionSessionStageUpdateResult =
  | { ok: true; stage: "sessions_revoked" | "sessions_pending" }
  | {
      ok: false;
      code:
        | "invalid_arguments"
        | "attempt_update_failed"
        | "stage_conflict"
        | "rpc_error";
      detail?: string;
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidSessionRevocationTargetUserId(
  targetUserId: string | null | undefined
): targetUserId is string {
  return typeof targetUserId === "string" && UUID_PATTERN.test(targetUserId);
}

function isValidAttemptId(attemptId: string | null | undefined): attemptId is string {
  return typeof attemptId === "string" && UUID_PATTERN.test(attemptId);
}

function transitionFailure(
  result: AccountDeletionAttemptStageTransitionResult
): AccountDeletionSessionStageUpdateResult {
  return {
    ok: false,
    code:
      result.code === "stage_conflict" || result.code === "invalid_arguments"
        ? result.code === "stage_conflict"
          ? "stage_conflict"
          : "invalid_arguments"
        : "attempt_update_failed",
    detail: result.code,
  };
}

/**
 * Global session revocation for a deletion target via Supabase Admin API.
 * Does NOT call auth.admin.deleteUser. Target must come from acquisition context.
 */
export async function revokeAccountDeletionTargetSessions(options: {
  serviceRoleClient: SupabaseClient;
  targetUserId: string;
}): Promise<AccountDeletionSessionRevocationResult> {
  if (!isValidSessionRevocationTargetUserId(options.targetUserId)) {
    return { ok: false, code: "invalid_target" };
  }

  try {
    const { error } = await options.serviceRoleClient.auth.admin.signOut(
      options.targetUserId,
      "global"
    );

    if (error) {
      return {
        ok: false,
        code: "session_revocation_failed",
        detail: error.message,
      };
    }

    return { ok: true };
  } catch {
    return { ok: false, code: "session_revocation_failed" };
  }
}

export async function markAttemptSessionsPending(options: {
  serviceRoleClient: SupabaseClient;
  requestId: string;
  attemptId: string;
}): Promise<AccountDeletionSessionStageUpdateResult> {
  if (
    !isValidAttemptId(options.attemptId) ||
    !isValidAttemptId(options.requestId)
  ) {
    return { ok: false, code: "invalid_arguments" };
  }

  const result = await advanceAccountDeletionAttemptToSessionsPending({
    serviceRoleClient: options.serviceRoleClient,
    requestId: options.requestId,
    attemptId: options.attemptId,
  });

  if (result.ok === false) {
    return transitionFailure(result);
  }

  return { ok: true, stage: "sessions_pending" };
}

export async function markAttemptSessionsRevoked(options: {
  serviceRoleClient: SupabaseClient;
  requestId: string;
  attemptId: string;
}): Promise<AccountDeletionSessionStageUpdateResult> {
  if (
    !isValidAttemptId(options.attemptId) ||
    !isValidAttemptId(options.requestId)
  ) {
    return { ok: false, code: "invalid_arguments" };
  }

  const result = await advanceAccountDeletionAttemptToSessionsRevoked({
    serviceRoleClient: options.serviceRoleClient,
    requestId: options.requestId,
    attemptId: options.attemptId,
  });

  if (result.ok === false) {
    return transitionFailure(result);
  }

  return { ok: true, stage: "sessions_revoked" };
}

/** @deprecated Use recordAccountDeletionSessionRevocationFailure with requestId */
export async function markAttemptSessionsPendingWithError(options: {
  serviceRoleClient: SupabaseClient;
  attemptId: string;
  errorCode: string;
  errorDetailSafe?: string | null;
  incrementRetry?: boolean;
  requestId: string;
}): Promise<AccountDeletionSessionStageUpdateResult> {
  if (
    !isValidAttemptId(options.attemptId) ||
    !isValidAttemptId(options.requestId)
  ) {
    return { ok: false, code: "invalid_arguments" };
  }

  if (options.incrementRetry === false) {
    return {
      ok: false,
      code: "attempt_update_failed",
      detail: "retry_increment_required",
    };
  }

  const result = await recordAccountDeletionSessionRevocationFailure({
    serviceRoleClient: options.serviceRoleClient,
    requestId: options.requestId,
    attemptId: options.attemptId,
    errorCode: options.errorCode,
    errorFingerprint: options.errorDetailSafe,
  });

  return failureRecordToStageUpdate(result);
}

export async function recordSessionRevocationFailureOnAttempt(options: {
  serviceRoleClient: SupabaseClient;
  requestId: string;
  attemptId: string;
  errorCode: string;
  errorFingerprint?: string | null;
}): Promise<AccountDeletionSessionStageUpdateResult> {
  const result = await recordAccountDeletionSessionRevocationFailure(options);
  return failureRecordToStageUpdate(result);
}

function failureRecordToStageUpdate(
  result: AccountDeletionSessionRevocationFailureRecordResult
): AccountDeletionSessionStageUpdateResult {
  if (result.ok === true) {
    return { ok: true, stage: "sessions_pending" };
  }

  if (result.code === "stage_conflict" || result.code === "invalid_arguments") {
    return { ok: false, code: result.code, detail: result.code };
  }

  return { ok: false, code: "attempt_update_failed", detail: result.code };
}

export const ACCOUNT_DELETION_SESSION_REVOCATION_STAGE_NOTE =
  "Future orchestration: acquisition committed → lock_acquired → sessions_pending → "
  + "revokeAccountDeletionTargetSessions → sessions_revoked → inventory via narrow RPCs → "
  + "3B.1 database stage. "
  + "On revocation failure: record_account_deletion_session_revocation_failure keeps "
  + "stage=sessions_pending — inventory and DB executor must not run.";

export const ACCOUNT_DELETION_SESSION_REVOCATION_DESIGN_NOTE =
  ACCOUNT_DELETION_SESSION_REVOCATION_STAGE_NOTE;

export { ACCOUNT_DELETION_RETRYABLE_FAILURE_FREEZE_NOTE };
