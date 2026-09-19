import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountDeletionNondestructiveDatabaseStageCode =
  | "completed"
  | "already_completed"
  | "invalid_arguments"
  | "readiness_failed"
  | "request_not_in_progress"
  | "target_unresolved"
  | "attempt_mismatch"
  | "invalid_stage"
  | "unsupported_destructive_action"
  | "ambiguous_reply_graph"
  | "stale_state"
  | "row_count_mismatch"
  | "invariant_failed"
  | "rpc_error";

export type AccountDeletionNondestructiveDatabaseStageResult =
  | {
      ok: true;
      code: "completed" | "already_completed";
      requestId: string;
      attemptId: string;
      targetUserId: string;
      databaseRowsAffected: Record<string, unknown>;
      checkedAt?: string;
    }
  | {
      ok: false;
      code: Exclude<
        AccountDeletionNondestructiveDatabaseStageCode,
        "completed" | "already_completed"
      >;
      detail?: unknown;
    };

type DatabaseStageRpcPayload = {
  ok?: boolean;
  code?: string;
  request_id?: string;
  attempt_id?: string;
  target_user_id?: string;
  database_rows_affected?: Record<string, unknown>;
  checked_at?: string;
  readiness?: unknown;
};

/**
 * Disconnected service-role wrapper for the nondestructive database stage RPC.
 * NOT wired to execute handler, acquisition, or session revocation.
 */
export async function executeAccountDeletionNondestructiveDatabaseStage(options: {
  serviceRoleClient: SupabaseClient;
  requestId: string;
  attemptId: string;
}): Promise<AccountDeletionNondestructiveDatabaseStageResult> {
  const { serviceRoleClient, requestId, attemptId } = options;

  const { data, error } = await serviceRoleClient.rpc(
    "execute_account_deletion_nondestructive_database_stage",
    {
      p_request_id: requestId,
      p_attempt_id: attemptId,
    }
  );

  if (error) {
    return { ok: false, code: "rpc_error", detail: error.message };
  }

  const payload = (data ?? {}) as DatabaseStageRpcPayload;
  const code = payload.code;

  if (
    payload.ok === true &&
    (code === "completed" || code === "already_completed") &&
    typeof payload.request_id === "string" &&
    typeof payload.attempt_id === "string" &&
    typeof payload.target_user_id === "string"
  ) {
    return {
      ok: true,
      code,
      requestId: payload.request_id,
      attemptId: payload.attempt_id,
      targetUserId: payload.target_user_id,
      databaseRowsAffected: payload.database_rows_affected ?? {},
      checkedAt: payload.checked_at,
    };
  }

  const failureCode =
    typeof code === "string"
      ? (code as Exclude<
          AccountDeletionNondestructiveDatabaseStageCode,
          "completed" | "already_completed"
        >)
      : "rpc_error";

  return {
    ok: false,
    code: failureCode,
    detail: payload.readiness ?? payload,
  };
}

export const ACCOUNT_DELETION_NONDESTRUCTIVE_DATABASE_STAGE_DISCONNECTED_NOTE =
  "executeAccountDeletionNondestructiveDatabaseStage is intentionally disconnected from "
  + "accountDeletionExecuteHandler, acquisition, session revocation, and UI until Phase 2C.3B.2 orchestration.";
