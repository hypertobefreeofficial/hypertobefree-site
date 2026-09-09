import type { SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNT_DELETION_RETRYABLE_FAILURE_FREEZE_NOTE } from "./accountDeletionAcquisition";

export type AccountDeletionSessionRevocationErrorCode =
  | "invalid_target"
  | "session_revocation_failed"
  | "internal_error";

export type AccountDeletionSessionRevocationResult =
  | { ok: true }
  | { ok: false; code: AccountDeletionSessionRevocationErrorCode; detail?: string };

export type AccountDeletionSessionStageUpdateResult =
  | { ok: true; stage: "sessions_revoked" | "sessions_pending" }
  | { ok: false; code: "invalid_arguments" | "attempt_update_failed"; detail?: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidSessionRevocationTargetUserId(
  targetUserId: string | null | undefined
): targetUserId is string {
  return typeof targetUserId === "string" && UUID_PATTERN.test(targetUserId);
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
}

export async function markAttemptSessionsRevoked(options: {
  serviceRoleClient: SupabaseClient;
  attemptId: string;
}): Promise<AccountDeletionSessionStageUpdateResult> {
  if (!isValidSessionRevocationTargetUserId(options.attemptId)) {
    return { ok: false, code: "invalid_arguments" };
  }

  const { error } = await options.serviceRoleClient
    .from("account_deletion_execution_attempts")
    .update({
      stage: "sessions_revoked",
      last_error_code: null,
      last_error_detail_safe: null,
    })
    .eq("id", options.attemptId)
    .eq("status", "active");

  if (error) {
    return {
      ok: false,
      code: "attempt_update_failed",
      detail: error.message,
    };
  }

  return { ok: true, stage: "sessions_revoked" };
}

export async function markAttemptSessionsPendingWithError(options: {
  serviceRoleClient: SupabaseClient;
  attemptId: string;
  errorCode: string;
  errorDetailSafe?: string | null;
  incrementRetry?: boolean;
}): Promise<AccountDeletionSessionStageUpdateResult> {
  if (!isValidSessionRevocationTargetUserId(options.attemptId)) {
    return { ok: false, code: "invalid_arguments" };
  }

  const { data: current, error: loadError } = await options.serviceRoleClient
    .from("account_deletion_execution_attempts")
    .select("retry_count")
    .eq("id", options.attemptId)
    .eq("status", "active")
    .maybeSingle();

  if (loadError || !current) {
    return {
      ok: false,
      code: "attempt_update_failed",
      detail: loadError?.message ?? "attempt_not_found",
    };
  }

  const nextRetryCount =
    options.incrementRetry === false
      ? (current.retry_count as number)
      : (current.retry_count as number) + 1;

  const { error } = await options.serviceRoleClient
    .from("account_deletion_execution_attempts")
    .update({
      stage: "sessions_pending",
      status: "active",
      last_error_code: options.errorCode,
      last_error_detail_safe: options.errorDetailSafe ?? null,
      retry_count: nextRetryCount,
    })
    .eq("id", options.attemptId)
    .eq("status", "active");

  if (error) {
    return {
      ok: false,
      code: "attempt_update_failed",
      detail: error.message,
    };
  }

  return { ok: true, stage: "sessions_pending" };
}

export const ACCOUNT_DELETION_SESSION_REVOCATION_STAGE_NOTE =
  "Future orchestration: acquisition committed → lock_acquired → sessions_pending → "
  + "revokeAccountDeletionTargetSessions → sessions_revoked → post-freeze inventory. "
  + "On revocation failure: request stays deletion_in_progress, attempt stays active with "
  + "stage=sessions_pending and retry metadata — inventory and DB executor must not run.";

export const ACCOUNT_DELETION_SESSION_REVOCATION_DESIGN_NOTE =
  ACCOUNT_DELETION_SESSION_REVOCATION_STAGE_NOTE;

export { ACCOUNT_DELETION_RETRYABLE_FAILURE_FREEZE_NOTE };
