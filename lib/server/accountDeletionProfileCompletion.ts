import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AccountDeletionProfileCompletionSuccessCode =
  | "finalized"
  | "already_finalized";

export type AccountDeletionProfileCompletionFailureCode =
  | "invalid_arguments"
  | "rpc_error"
  | "request_not_in_progress"
  | "target_unresolved"
  | "attempt_mismatch"
  | "irreversible_stage"
  | "invalid_stage"
  | "storage_manifest_not_finalized"
  | "inconsistent_state"
  | "profile_media_not_complete"
  | "profile_delete_invariant_failed"
  | "invariant_failed";

export type AccountDeletionProfileCompletionResult =
  | {
      ok: true;
      code: AccountDeletionProfileCompletionSuccessCode;
      requestId: string;
      attemptId: string;
      targetUserId: string;
      stage: "profile_completed";
      profileRowsAffected: Record<string, unknown>;
      checkedAt?: string;
    }
  | {
      ok: false;
      code: AccountDeletionProfileCompletionFailureCode;
      detail?: unknown;
    };

export const ACCOUNT_DELETION_PROFILE_COMPLETION_DISCONNECTED_NOTE =
  "finalizeAccountDeletionProfileStage (3B.4C.2) wraps finalize_account_deletion_profile_stage only. "
  + "Wired exclusively through runAccountDeletionExecutionOrchestrator when profile execution is enabled; "
  + "not invoked directly from the execute handler, admin route, UI, or profile-media stage runner. "
  + "No Auth deletion authority; profile completion stops at profile_completed.";

type FinalizeRpcPayload = {
  ok?: boolean;
  code?: string;
  request_id?: string;
  attempt_id?: string;
  target_user_id?: string;
  stage?: string;
  profile_rows_affected?: unknown;
  checked_at?: unknown;
  detail?: unknown;
};

const KNOWN_DB_FAILURE_CODES = new Set<string>([
  "invalid_arguments",
  "request_not_in_progress",
  "target_unresolved",
  "attempt_mismatch",
  "irreversible_stage",
  "invalid_stage",
  "storage_manifest_not_finalized",
  "inconsistent_state",
  "profile_media_not_complete",
  "profile_delete_invariant_failed",
  "invariant_failed",
]);

function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function parseSuccessPayload(
  payload: FinalizeRpcPayload
): Extract<AccountDeletionProfileCompletionResult, { ok: true }> | null {
  const code = payload.code;
  if (
    payload.ok !== true ||
    (code !== "finalized" && code !== "already_finalized") ||
    typeof payload.request_id !== "string" ||
    typeof payload.attempt_id !== "string" ||
    typeof payload.target_user_id !== "string" ||
    payload.stage !== "profile_completed" ||
    !isPlainObjectRecord(payload.profile_rows_affected)
  ) {
    return null;
  }

  if (
    payload.checked_at !== undefined &&
    payload.checked_at !== null &&
    typeof payload.checked_at !== "string"
  ) {
    return null;
  }

  return {
    ok: true,
    code,
    requestId: payload.request_id,
    attemptId: payload.attempt_id,
    targetUserId: payload.target_user_id,
    stage: "profile_completed",
    profileRowsAffected: payload.profile_rows_affected,
    checkedAt:
      typeof payload.checked_at === "string" ? payload.checked_at : undefined,
  };
}

function parseFailurePayload(
  payload: FinalizeRpcPayload
): Extract<AccountDeletionProfileCompletionResult, { ok: false }> {
  const code = payload.code;
  if (typeof code !== "string" || !KNOWN_DB_FAILURE_CODES.has(code)) {
    return { ok: false, code: "invariant_failed" };
  }

  if (code === "profile_media_not_complete" && "detail" in payload) {
    return {
      ok: false,
      code,
      detail: payload.detail,
    };
  }

  return {
    ok: false,
    code: code as Exclude<
      AccountDeletionProfileCompletionFailureCode,
      "rpc_error"
    >,
  };
}

/**
 * Disconnected service-role wrapper for finalize_account_deletion_profile_stage.
 * NOT wired to orchestrator, execute handler, or admin route in 3B.4C.2.
 */
export async function finalizeAccountDeletionProfileStage(options: {
  serviceRoleClient: SupabaseClient;
  requestId: string;
  attemptId: string;
}): Promise<AccountDeletionProfileCompletionResult> {
  const { serviceRoleClient, requestId, attemptId } = options;

  if (!isValidUuid(requestId) || !isValidUuid(attemptId)) {
    return { ok: false, code: "invalid_arguments" };
  }

  const { data, error } = await serviceRoleClient.rpc(
    "finalize_account_deletion_profile_stage",
    {
      p_request_id: requestId,
      p_attempt_id: attemptId,
    }
  );

  if (error) {
    return { ok: false, code: "rpc_error" };
  }

  const payload = (data ?? {}) as FinalizeRpcPayload;

  const success = parseSuccessPayload(payload);
  if (success) {
    return success;
  }

  if (payload.ok === false) {
    return parseFailurePayload(payload);
  }

  return { ok: false, code: "invariant_failed" };
}
