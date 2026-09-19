import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountDeletionAttemptStageTransitionCode =
  | "advanced"
  | "already_at_stage"
  | "recorded"
  | "invalid_arguments"
  | "request_not_found"
  | "request_not_in_progress"
  | "attempt_not_found"
  | "attempt_not_active"
  | "attempt_request_mismatch"
  | "target_mismatch"
  | "stage_conflict"
  | "invariant_failed"
  | "readiness_failed"
  | "rpc_error";

type TransitionRpcPayload = {
  ok?: boolean;
  code?: string;
  request_id?: string;
  attempt_id?: string;
  stage?: string;
  retry_count?: number;
};

export type AccountDeletionAttemptStageTransitionResult =
  | {
      ok: true;
      code: "advanced" | "already_at_stage";
      requestId: string;
      attemptId: string;
      stage: string;
    }
  | {
      ok: false;
      code: Exclude<
        AccountDeletionAttemptStageTransitionCode,
        "advanced" | "already_at_stage" | "recorded"
      >;
      detail?: unknown;
    };

export type AccountDeletionSessionRevocationFailureRecordResult =
  | {
      ok: true;
      code: "recorded";
      requestId: string;
      attemptId: string;
      stage: string;
      retryCount: number;
    }
  | {
      ok: false;
      code: Exclude<AccountDeletionAttemptStageTransitionCode, "recorded">;
      detail?: unknown;
    };

function parseTransitionSuccess(
  payload: TransitionRpcPayload,
  allowedCodes: readonly ("advanced" | "already_at_stage")[]
):
  | Extract<AccountDeletionAttemptStageTransitionResult, { ok: true }>
  | null {
  if (
    payload.ok === true &&
    typeof payload.code === "string" &&
    allowedCodes.includes(payload.code as "advanced" | "already_at_stage") &&
    typeof payload.request_id === "string" &&
    typeof payload.attempt_id === "string" &&
    typeof payload.stage === "string"
  ) {
    return {
      ok: true,
      code: payload.code as "advanced" | "already_at_stage",
      requestId: payload.request_id,
      attemptId: payload.attempt_id,
      stage: payload.stage,
    };
  }
  return null;
}

function parseFailureCode(
  payload: TransitionRpcPayload
): Exclude<
  AccountDeletionAttemptStageTransitionCode,
  "advanced" | "already_at_stage" | "recorded"
> {
  const code = payload.code;
  switch (code) {
    case "invalid_arguments":
    case "request_not_found":
    case "request_not_in_progress":
    case "attempt_not_found":
    case "attempt_not_active":
    case "attempt_request_mismatch":
    case "target_mismatch":
    case "stage_conflict":
    case "invariant_failed":
    case "readiness_failed":
      return code;
    default:
      return "rpc_error";
  }
}

async function callStageTransitionRpc(
  serviceRoleClient: SupabaseClient,
  rpcName: string,
  requestId: string,
  attemptId: string
): Promise<AccountDeletionAttemptStageTransitionResult> {
  const { data, error } = await serviceRoleClient.rpc(rpcName, {
    p_request_id: requestId,
    p_attempt_id: attemptId,
  });

  if (error) {
    return { ok: false, code: "rpc_error", detail: error.message };
  }

  const payload = (data ?? {}) as TransitionRpcPayload;
  const success = parseTransitionSuccess(payload, ["advanced", "already_at_stage"]);
  if (success) {
    return success;
  }

  if (payload.ok === false) {
    return { ok: false, code: parseFailureCode(payload), detail: payload };
  }

  return { ok: false, code: "rpc_error", detail: payload };
}

export async function advanceAccountDeletionAttemptToSessionsPending(options: {
  serviceRoleClient: SupabaseClient;
  requestId: string;
  attemptId: string;
}): Promise<AccountDeletionAttemptStageTransitionResult> {
  return callStageTransitionRpc(
    options.serviceRoleClient,
    "advance_account_deletion_attempt_to_sessions_pending",
    options.requestId,
    options.attemptId
  );
}

export async function advanceAccountDeletionAttemptToSessionsRevoked(options: {
  serviceRoleClient: SupabaseClient;
  requestId: string;
  attemptId: string;
}): Promise<AccountDeletionAttemptStageTransitionResult> {
  return callStageTransitionRpc(
    options.serviceRoleClient,
    "advance_account_deletion_attempt_to_sessions_revoked",
    options.requestId,
    options.attemptId
  );
}

export async function advanceAccountDeletionAttemptToInventory(options: {
  serviceRoleClient: SupabaseClient;
  requestId: string;
  attemptId: string;
}): Promise<AccountDeletionAttemptStageTransitionResult> {
  return callStageTransitionRpc(
    options.serviceRoleClient,
    "advance_account_deletion_attempt_to_inventory",
    options.requestId,
    options.attemptId
  );
}

export async function recordAccountDeletionSessionRevocationFailure(options: {
  serviceRoleClient: SupabaseClient;
  requestId: string;
  attemptId: string;
  errorCode: string;
  errorFingerprint?: string | null;
}): Promise<AccountDeletionSessionRevocationFailureRecordResult> {
  const { data, error } = await options.serviceRoleClient.rpc(
    "record_account_deletion_session_revocation_failure",
    {
      p_request_id: options.requestId,
      p_attempt_id: options.attemptId,
      p_error_code: options.errorCode,
      p_error_fingerprint: options.errorFingerprint ?? null,
    }
  );

  if (error) {
    return { ok: false, code: "rpc_error", detail: error.message };
  }

  const payload = (data ?? {}) as TransitionRpcPayload;
  if (
    payload.ok === true &&
    payload.code === "recorded" &&
    typeof payload.request_id === "string" &&
    typeof payload.attempt_id === "string" &&
    typeof payload.stage === "string" &&
    typeof payload.retry_count === "number"
  ) {
    return {
      ok: true,
      code: "recorded",
      requestId: payload.request_id,
      attemptId: payload.attempt_id,
      stage: payload.stage,
      retryCount: payload.retry_count,
    };
  }

  if (payload.ok === false) {
    return { ok: false, code: parseFailureCode(payload), detail: payload };
  }

  return { ok: false, code: "rpc_error", detail: payload };
}

export const ACCOUNT_DELETION_ATTEMPT_STAGE_TRANSITION_DISCONNECTED_NOTE =
  "Stage transition RPCs are used only via these wrappers — not wired to the execute handler until Phase 3B.2E.";
