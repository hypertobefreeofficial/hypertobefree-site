import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AccountDeletionExecutionCancelSuccessCode =
  | "cancelled"
  | "already_cancelled";

export type AccountDeletionExecutionCancelFailureCode =
  | "invalid_arguments"
  | "owner_required"
  | "readiness_failed"
  | "request_not_found"
  | "attempt_not_found"
  | "attempt_request_mismatch"
  | "target_mismatch"
  | "request_not_in_progress"
  | "attempt_not_cancellable"
  | "stage_not_cancellable"
  | "irreversible_stage"
  | "irreversible_state"
  | "execution_in_flight"
  | "invariant_failed"
  | "rpc_error";

export type AccountDeletionExecutionCancelResult =
  | {
      ok: true;
      code: AccountDeletionExecutionCancelSuccessCode;
      requestId: string;
      attemptId: string;
      lastStage: string;
      reauthenticationMayBeRequired: boolean;
    }
  | {
      ok: false;
      code: AccountDeletionExecutionCancelFailureCode;
    };

const FAILURE_CODES = new Set<AccountDeletionExecutionCancelFailureCode>([
  "invalid_arguments",
  "owner_required",
  "readiness_failed",
  "request_not_found",
  "attempt_not_found",
  "attempt_request_mismatch",
  "target_mismatch",
  "request_not_in_progress",
  "attempt_not_cancellable",
  "stage_not_cancellable",
  "irreversible_stage",
  "irreversible_state",
  "execution_in_flight",
  "invariant_failed",
]);

type CancelRpcPayload = {
  ok?: boolean;
  code?: string;
  request_id?: string;
  attempt_id?: string;
  last_stage?: string;
  reauthentication_may_be_required?: boolean;
};

function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function parseSuccess(
  payload: CancelRpcPayload,
  requestId: string,
  attemptId: string
): AccountDeletionExecutionCancelResult | null {
  if (
    payload.request_id !== requestId ||
    payload.attempt_id !== attemptId ||
    typeof payload.last_stage !== "string" ||
    payload.last_stage.length === 0 ||
    typeof payload.reauthentication_may_be_required !== "boolean"
  ) {
    return null;
  }

  return {
    ok: true,
    code: payload.code === "already_cancelled" ? "already_cancelled" : "cancelled",
    requestId,
    attemptId,
    lastStage: payload.last_stage,
    reauthenticationMayBeRequired: payload.reauthentication_may_be_required,
  };
}

/**
 * Disconnected wrapper for cancel_account_deletion_execution.
 * Not wired to HTTP, admin UI, cron, or the execute orchestrator.
 */
export async function cancelAccountDeletionExecution(options: {
  serviceRoleClient: SupabaseClient;
  requestId: string;
  attemptId: string;
  initiatedBy: string;
}): Promise<AccountDeletionExecutionCancelResult> {
  const { serviceRoleClient, requestId, attemptId, initiatedBy } = options;

  if (!isValidUuid(requestId) || !isValidUuid(attemptId) || !isValidUuid(initiatedBy)) {
    return { ok: false, code: "invalid_arguments" };
  }

  const { data, error } = await serviceRoleClient.rpc(
    "cancel_account_deletion_execution",
    {
      p_request_id: requestId,
      p_attempt_id: attemptId,
      p_initiated_by: initiatedBy,
    }
  );

  if (error || data == null || typeof data !== "object") {
    return { ok: false, code: "rpc_error" };
  }

  const payload = data as CancelRpcPayload;
  if (payload.ok === true && (payload.code === "cancelled" || payload.code === "already_cancelled")) {
    const parsed = parseSuccess(payload, requestId, attemptId);
    if (!parsed) {
      return { ok: false, code: "rpc_error" };
    }
    return parsed;
  }

  if (
    payload.ok === false &&
    typeof payload.code === "string" &&
    FAILURE_CODES.has(payload.code as AccountDeletionExecutionCancelFailureCode)
  ) {
    return {
      ok: false,
      code: payload.code as AccountDeletionExecutionCancelFailureCode,
    };
  }

  return { ok: false, code: "rpc_error" };
}
