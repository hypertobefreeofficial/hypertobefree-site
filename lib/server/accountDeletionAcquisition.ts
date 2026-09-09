import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountDeletionAcquisitionResultCode =
  | "acquired"
  | "already_acquired"
  | "invalid_arguments"
  | "unauthorized_owner"
  | "readiness_failed"
  | "request_not_found"
  | "target_not_resolved"
  | "request_not_approved"
  | "active_attempt_conflict"
  | "ambiguous_state"
  | "ambiguous_state_target_mismatch"
  | "rpc_error";

export type AccountDeletionAcquisitionContext = {
  requestId: string;
  attemptId: string;
  targetUserId: string;
  attemptStage?: string | null;
  attemptStatus?: string | null;
};

export type AccountDeletionAcquisitionResult =
  | {
      ok: true;
      code: "acquired" | "already_acquired";
      context: AccountDeletionAcquisitionContext;
    }
  | {
      ok: false;
      code: Exclude<AccountDeletionAcquisitionResultCode, "acquired" | "already_acquired">;
      detail?: unknown;
    };

type AcquisitionRpcPayload = {
  ok?: boolean;
  code?: string;
  request_id?: string;
  attempt_id?: string;
  target_user_id?: string;
  attempt_stage?: string;
  attempt_status?: string;
  readiness?: unknown;
  status?: string;
  active_attempt_count?: number;
};

function parseAcquisitionContext(
  payload: AcquisitionRpcPayload
): AccountDeletionAcquisitionContext | null {
  if (
    typeof payload.request_id !== "string" ||
    typeof payload.attempt_id !== "string" ||
    typeof payload.target_user_id !== "string"
  ) {
    return null;
  }

  return {
    requestId: payload.request_id,
    attemptId: payload.attempt_id,
    targetUserId: payload.target_user_id,
    attemptStage: payload.attempt_stage ?? null,
    attemptStatus: payload.attempt_status ?? null,
  };
}

export async function acquireAccountDeletionExecutionLock(options: {
  serviceRoleClient: SupabaseClient;
  requestId: string;
  initiatedBy: string;
}): Promise<AccountDeletionAcquisitionResult> {
  const { serviceRoleClient, requestId, initiatedBy } = options;

  const { data, error } = await serviceRoleClient.rpc(
    "acquire_account_deletion_execution_lock",
    {
      p_request_id: requestId,
      p_initiated_by: initiatedBy,
    }
  );

  if (error) {
    return { ok: false, code: "rpc_error", detail: error.message };
  }

  const payload = (data ?? {}) as AcquisitionRpcPayload;

  if (payload.ok === true && payload.code === "acquired") {
    const context = parseAcquisitionContext(payload);
    if (!context) {
      return { ok: false, code: "rpc_error", detail: "missing_acquired_context" };
    }
    return { ok: true, code: "acquired", context };
  }

  if (payload.ok === true && payload.code === "already_acquired") {
    const context = parseAcquisitionContext(payload);
    if (!context) {
      return { ok: false, code: "rpc_error", detail: "missing_already_acquired_context" };
    }
    return { ok: true, code: "already_acquired", context };
  }

  const code = payload.code;
  switch (code) {
    case "invalid_arguments":
    case "unauthorized_owner":
    case "readiness_failed":
    case "request_not_found":
    case "target_not_resolved":
    case "request_not_approved":
    case "active_attempt_conflict":
    case "ambiguous_state":
    case "ambiguous_state_target_mismatch":
      return {
        ok: false,
        code,
        detail:
          code === "readiness_failed"
            ? payload.readiness
            : code === "request_not_approved"
              ? payload.status
              : code === "ambiguous_state"
                ? payload.active_attempt_count
                : undefined,
      };
    default:
      return { ok: false, code: "rpc_error", detail: payload };
  }
}

export const ACCOUNT_DELETION_ACQUISITION_DESIGN_NOTE =
  "Acquisition is atomic in acquire_account_deletion_execution_lock(): request FOR UPDATE, "
  + "pg_advisory_xact_lock(hashtextextended('account_deletion:'||target,0)), live readiness, "
  + "owner verification via profiles.is_owner, one active attempt, approved→deletion_in_progress. "
  + "Idempotent already_acquired when exactly one valid active attempt exists. "
  + "Must remain behind HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED and owner+AAL2 gates.";

export const ACCOUNT_DELETION_RETRYABLE_FAILURE_FREEZE_NOTE =
  "Transient execution/session/database failures must NOT transition account_deletion_requests "
  + "to failed — deletion_in_progress is the authoritative freeze. Record retry metadata on the "
  + "active attempt (stage=sessions_pending, status=active, last_error_code, retry_count). "
  + "Reserve attempt.status=blocked for deliberate manual non-retryable handling only.";
