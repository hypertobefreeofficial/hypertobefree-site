import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AccountDeletionExecutionTerminalSuccessCode = "completed" | "already_completed";

export type AccountDeletionExecutionTerminalFailureCode =
  | "invalid_arguments"
  | "rpc_error"
  | "request_not_in_progress"
  | "target_unresolved"
  | "attempt_mismatch"
  | "invalid_stage"
  | "terminal_precondition_failed"
  | "inconsistent_state"
  | "invariant_failed";

export type AccountDeletionExecutionTerminalResult =
  | {
      ok: true;
      code: AccountDeletionExecutionTerminalSuccessCode;
      requestId: string;
      attemptId: string;
      targetUserId: string;
      attemptStage: "completed";
      attemptStatus: "completed";
      requestStatus: "deleted";
      checkedAt?: string;
    }
  | {
      ok: false;
      code: AccountDeletionExecutionTerminalFailureCode;
    };

type TerminalRpcPayload = {
  ok?: boolean;
  code?: string;
  request_id?: string;
  attempt_id?: string;
  target_user_id?: string;
  attempt_stage?: string;
  attempt_status?: string;
  request_status?: string;
  checked_at?: string;
};

function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Non-destructive terminal bookkeeping wrapper for finalize_account_deletion_execution.
 */
export async function finalizeAccountDeletionExecution(options: {
  serviceRoleClient: SupabaseClient;
  requestId: string;
  attemptId: string;
}): Promise<AccountDeletionExecutionTerminalResult> {
  const { serviceRoleClient, requestId, attemptId } = options;

  if (!isValidUuid(requestId) || !isValidUuid(attemptId)) {
    return { ok: false, code: "invalid_arguments" };
  }

  const { data, error } = await serviceRoleClient.rpc(
    "finalize_account_deletion_execution",
    {
      p_request_id: requestId,
      p_attempt_id: attemptId,
    }
  );

  if (error) {
    return { ok: false, code: "rpc_error" };
  }

  const payload = (data ?? {}) as TerminalRpcPayload;
  const code = payload.code;

  if (
    payload.ok === true &&
    (code === "completed" || code === "already_completed") &&
    typeof payload.request_id === "string" &&
    typeof payload.attempt_id === "string" &&
    typeof payload.target_user_id === "string" &&
    payload.attempt_stage === "completed" &&
    payload.attempt_status === "completed" &&
    payload.request_status === "deleted" &&
    isValidUuid(payload.request_id) &&
    isValidUuid(payload.attempt_id) &&
    isValidUuid(payload.target_user_id) &&
    payload.request_id === requestId &&
    payload.attempt_id === attemptId
  ) {
    return {
      ok: true,
      code,
      requestId: payload.request_id,
      attemptId: payload.attempt_id,
      targetUserId: payload.target_user_id,
      attemptStage: "completed",
      attemptStatus: "completed",
      requestStatus: "deleted",
      checkedAt: payload.checked_at,
    };
  }

  const failureCode =
    typeof code === "string"
      ? (code as AccountDeletionExecutionTerminalFailureCode)
      : "invariant_failed";

  return { ok: false, code: failureCode };
}
