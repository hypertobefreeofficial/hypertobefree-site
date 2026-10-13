import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AccountDeletionAuthStageSuccessCode = "prepared" | "already_prepared";

export type AccountDeletionAuthStageFailureCode =
  | "invalid_arguments"
  | "rpc_error"
  | "request_not_in_progress"
  | "target_unresolved"
  | "attempt_mismatch"
  | "invalid_stage"
  | "irreversible_stage"
  | "preservation_hold_active"
  | "storage_manifest_not_finalized"
  | "profile_completion_not_evidence_backed"
  | "inconsistent_state"
  | "invariant_failed";

export type AccountDeletionAuthStageResult =
  | {
      ok: true;
      code: AccountDeletionAuthStageSuccessCode;
      requestId: string;
      attemptId: string;
      targetUserId: string;
      stage: "auth_pending";
      checkedAt?: string;
    }
  | {
      ok: false;
      code: AccountDeletionAuthStageFailureCode;
    };

type PrepareRpcPayload = {
  ok?: boolean;
  code?: string;
  request_id?: string;
  attempt_id?: string;
  target_user_id?: string;
  stage?: string;
  checked_at?: string;
};

function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Service-role wrapper for prepare_account_deletion_auth_stage (profile_completed → auth_pending).
 * No Auth provider calls.
 */
export async function prepareAccountDeletionAuthStage(options: {
  serviceRoleClient: SupabaseClient;
  requestId: string;
  attemptId: string;
}): Promise<AccountDeletionAuthStageResult> {
  const { serviceRoleClient, requestId, attemptId } = options;

  if (!isValidUuid(requestId) || !isValidUuid(attemptId)) {
    return { ok: false, code: "invalid_arguments" };
  }

  const { data, error } = await serviceRoleClient.rpc(
    "prepare_account_deletion_auth_stage",
    {
      p_request_id: requestId,
      p_attempt_id: attemptId,
    }
  );

  if (error) {
    return { ok: false, code: "rpc_error" };
  }

  const payload = (data ?? {}) as PrepareRpcPayload;
  const code = payload.code;

  if (
    payload.ok === true &&
    (code === "prepared" || code === "already_prepared") &&
    typeof payload.request_id === "string" &&
    typeof payload.attempt_id === "string" &&
    typeof payload.target_user_id === "string" &&
    payload.stage === "auth_pending" &&
    isValidUuid(payload.request_id) &&
    isValidUuid(payload.attempt_id) &&
    isValidUuid(payload.target_user_id)
  ) {
    return {
      ok: true,
      code,
      requestId: payload.request_id,
      attemptId: payload.attempt_id,
      targetUserId: payload.target_user_id,
      stage: "auth_pending",
      checkedAt: payload.checked_at,
    };
  }

  const failureCode =
    typeof code === "string"
      ? (code as AccountDeletionAuthStageFailureCode)
      : "invariant_failed";

  return { ok: false, code: failureCode };
}
