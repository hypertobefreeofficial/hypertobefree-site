import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isAccountDeletionExecutionEnabled } from "./accountDeletionExecutionPolicy";
import { isAccountDeletionAuthExecutionEnabled } from "./accountDeletionAuthExecutionPolicy";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_CLAIM_LEASE_SECONDS = 900;

/** Hard delete only — must match auth-js deleteUser(id, shouldSoftDelete) second argument. */
export const ACCOUNT_DELETION_AUTH_HARD_DELETE = false as const;

type RpcPayload = Record<string, unknown>;

type AuthAdminErrorShape = {
  message?: string;
  status?: number;
  code?: string;
};

export type AuthAdminUserLookupStatus =
  | { status: "present" }
  | { status: "absent" }
  | { status: "provider_error"; retryable: boolean };

export type AccountDeletionAuthExecutorSuccessCode =
  | "auth_deleted"
  | "auth_already_absent";

export type AccountDeletionAuthExecutorFailureCode =
  | "auth_execution_disabled"
  | "invalid_arguments"
  | "auth_claim_in_progress"
  | "claim_rpc_failed"
  | "claim_precondition_failed"
  | "claim_invariant_failed"
  | "auth_precheck_failed"
  | "auth_delete_failed"
  | "auth_postcheck_failed"
  | "auth_verification_failed"
  | "complete_rpc_failed"
  | "complete_precondition_failed"
  | "complete_invariant_failed"
  | "stage_conflict"
  | "preservation_hold_active";

export type AccountDeletionAuthExecutorResult =
  | {
      ok: true;
      code: AccountDeletionAuthExecutorSuccessCode;
      requestId: string;
      attemptId: string;
      stage: "finalize";
    }
  | {
      ok: false;
      code: AccountDeletionAuthExecutorFailureCode;
      retryable?: boolean;
    };

export type AccountDeletionAuthExecutorDeps = {
  serviceRoleClient: SupabaseClient;
  isGlobalExecutionEnabled?: () => boolean;
  isAuthExecutionEnabled?: () => boolean;
  claimAuthExecution?: (input: {
    requestId: string;
    attemptId: string;
    leaseSeconds: number;
  }) => Promise<RpcPayload>;
  completeAuthExecution?: (input: {
    requestId: string;
    attemptId: string;
    deleteCommitToken: string;
    outcome: "deleted" | "already_absent";
  }) => Promise<RpcPayload>;
  getUserById?: (targetUserId: string) => Promise<{
    data: { user: unknown | null } | null;
    error: AuthAdminErrorShape | null;
  }>;
  deleteUser?: (
    targetUserId: string,
    shouldSoftDelete: boolean
  ) => Promise<{
    data: { user: unknown | null } | null;
    error: AuthAdminErrorShape | null;
  }>;
};

function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function asPayload(data: unknown): RpcPayload {
  return (data ?? {}) as RpcPayload;
}

export function isAuthAdminUserNotFoundError(
  error: AuthAdminErrorShape | null | undefined
): boolean {
  if (!error) {
    return false;
  }
  if (error.status === 404) {
    return true;
  }
  return error.code === "user_not_found";
}

export function classifyAuthAdminGetUserByIdResponse(
  data: { user: unknown | null } | null,
  error: AuthAdminErrorShape | null
): AuthAdminUserLookupStatus {
  if (error) {
    if (isAuthAdminUserNotFoundError(error)) {
      return { status: "absent" };
    }
    if (
      error.status === 401 ||
      error.status === 403 ||
      error.code === "not_admin" ||
      error.code === "no_authorization"
    ) {
      return { status: "provider_error", retryable: false };
    }
    if (
      typeof error.status === "number" &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 404
    ) {
      return { status: "provider_error", retryable: false };
    }
    return { status: "provider_error", retryable: true };
  }
  if (data == null) {
    return { status: "provider_error", retryable: true };
  }
  if (data.user != null) {
    return { status: "present" };
  }
  return { status: "provider_error", retryable: true };
}

function parseIsoTimestamp(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return new Date(parsed);
}

function hasValidCommitAuthority(payload: RpcPayload, nowMs: number): boolean {
  const commitExpires = parseIsoTimestamp(payload.delete_commit_expires_at);
  if (commitExpires == null) {
    return false;
  }
  return commitExpires.getTime() > nowMs;
}

function parseClaimSuccess(
  payload: RpcPayload,
  requestId: string,
  attemptId: string
):
  | {
      ok: true;
      targetUserId: string;
      deleteCommitToken: string;
    }
  | { ok: false; code: AccountDeletionAuthExecutorFailureCode; retryable?: boolean } {
  if (payload.ok !== true) {
    return { ok: false, ...mapClaimFailure(payload) };
  }
  const code = payload.code;
  if (code !== "claimed" && code !== "already_claimed") {
    return { ok: false, code: "claim_invariant_failed" };
  }
  const responseRequestId = payload.request_id;
  const responseAttemptId = payload.attempt_id;
  const targetUserId = payload.target_user_id;
  const deleteCommitToken = payload.delete_commit_token;
  const claimToken = payload.claim_token;
  const stage = payload.stage;
  const nowMs = Date.now();
  if (
    typeof responseRequestId !== "string" ||
    typeof responseAttemptId !== "string" ||
    typeof targetUserId !== "string" ||
    typeof deleteCommitToken !== "string" ||
    typeof claimToken !== "string" ||
    stage !== "auth" ||
    responseRequestId !== requestId ||
    responseAttemptId !== attemptId ||
    !isValidUuid(responseRequestId) ||
    !isValidUuid(responseAttemptId) ||
    !isValidUuid(targetUserId) ||
    !isValidUuid(deleteCommitToken) ||
    !isValidUuid(claimToken) ||
    parseIsoTimestamp(payload.claim_lease_expires_at) == null ||
    parseIsoTimestamp(payload.delete_commit_expires_at) == null ||
    !hasValidCommitAuthority(payload, nowMs)
  ) {
    return { ok: false, code: "claim_invariant_failed" };
  }
  return {
    ok: true,
    targetUserId,
    deleteCommitToken,
  };
}

function mapClaimFailure(payload: RpcPayload): {
  code: AccountDeletionAuthExecutorFailureCode;
  retryable?: boolean;
} {
  const code = payload.code;
  switch (code) {
    case "invalid_arguments":
    case "invalid_lease":
      return { code: "invalid_arguments" };
    case "request_not_in_progress":
    case "attempt_mismatch":
    case "target_unresolved":
      return { code: "claim_precondition_failed" };
    case "preservation_hold_active":
      return { code: "preservation_hold_active" };
    case "irreversible_stage":
    case "invalid_stage":
    case "profile_completion_not_evidence_backed":
      return { code: "stage_conflict" };
    case "claim_conflict":
      return { code: "auth_claim_in_progress", retryable: true };
    default:
      return { code: "claim_invariant_failed" };
  }
}

function mapCompleteFailure(payload: RpcPayload): {
  code: AccountDeletionAuthExecutorFailureCode;
  retryable?: boolean;
} {
  const code = payload.code;
  switch (code) {
    case "invalid_arguments":
    case "invalid_outcome":
      return { code: "invalid_arguments" };
    case "delete_commit_token_mismatch":
    case "delete_commit_expired":
      return { code: "complete_precondition_failed" };
    case "request_not_in_progress":
    case "attempt_mismatch":
    case "target_unresolved":
    case "invalid_stage":
    case "inconsistent_state":
    case "invariant_failed":
      return { code: "complete_precondition_failed" };
    default:
      return { code: "complete_invariant_failed" };
  }
}

function parseCompleteSuccess(
  payload: RpcPayload,
  requestId: string,
  attemptId: string,
  targetUserId: string,
  expectedOutcome: "deleted" | "already_absent"
):
  | { ok: true; code: AccountDeletionAuthExecutorSuccessCode }
  | { ok: false; code: AccountDeletionAuthExecutorFailureCode } {
  if (payload.ok !== true) {
    return { ok: false, ...mapCompleteFailure(payload) };
  }
  const code = payload.code;
  if (code !== "completed" && code !== "already_completed") {
    return { ok: false, code: "complete_invariant_failed" };
  }
  const responseTarget = payload.target_user_id;
  const outcome = payload.outcome;
  if (
    payload.request_id !== requestId ||
    payload.attempt_id !== attemptId ||
    payload.stage !== "finalize" ||
    typeof responseTarget !== "string" ||
    !isValidUuid(responseTarget) ||
    responseTarget !== targetUserId ||
    typeof outcome !== "string" ||
    (outcome !== "deleted" && outcome !== "already_absent") ||
    outcome !== expectedOutcome
  ) {
    return { ok: false, code: "complete_invariant_failed" };
  }
  const successCode: AccountDeletionAuthExecutorSuccessCode =
    expectedOutcome === "already_absent" ? "auth_already_absent" : "auth_deleted";
  return { ok: true, code: successCode };
}

async function defaultClaimAuthExecution(
  client: SupabaseClient,
  input: { requestId: string; attemptId: string; leaseSeconds: number }
): Promise<RpcPayload> {
  const { data, error } = await client.rpc("claim_account_deletion_auth_execution", {
    p_request_id: input.requestId,
    p_attempt_id: input.attemptId,
    p_lease_seconds: input.leaseSeconds,
  });
  if (error) {
    return { ok: false, code: "rpc_error" };
  }
  return asPayload(data);
}

async function defaultCompleteAuthExecution(
  client: SupabaseClient,
  input: {
    requestId: string;
    attemptId: string;
    deleteCommitToken: string;
    outcome: "deleted" | "already_absent";
  }
): Promise<RpcPayload> {
  const { data, error } = await client.rpc(
    "complete_account_deletion_auth_execution",
    {
      p_request_id: input.requestId,
      p_attempt_id: input.attemptId,
      p_delete_commit_token: input.deleteCommitToken,
      p_outcome: input.outcome,
    }
  );
  if (error) {
    return { ok: false, code: "rpc_error" };
  }
  return asPayload(data);
}

function resolveAuthAdmin(client: SupabaseClient) {
  return client.auth.admin as {
    getUserById: (
      uid: string
    ) => Promise<{
      data: { user: unknown | null };
      error: AuthAdminErrorShape | null;
    }>;
    deleteUser: (
      id: string,
      shouldSoftDelete?: boolean
    ) => Promise<{
      data: { user: unknown | null };
      error: AuthAdminErrorShape | null;
    }>;
  };
}

/**
 * Bounded Auth delete executor: DB claim authority, optional single deleteUser,
 * verified absence, then DB completion. Unwired from orchestrator in 3B.4D.2.
 */
export async function executeAccountDeletionAuthDelete(options: {
  serviceRoleClient: SupabaseClient;
  requestId: string;
  attemptId: string;
  deps?: Partial<AccountDeletionAuthExecutorDeps>;
}): Promise<AccountDeletionAuthExecutorResult> {
  const { serviceRoleClient, requestId, attemptId } = options;
  const deps: AccountDeletionAuthExecutorDeps = {
    serviceRoleClient,
    ...options.deps,
  };

  if (!isValidUuid(requestId) || !isValidUuid(attemptId)) {
    return { ok: false, code: "invalid_arguments" };
  }

  const globalEnabled = (
    deps.isGlobalExecutionEnabled ?? isAccountDeletionExecutionEnabled
  )();
  const authEnabled = (
    deps.isAuthExecutionEnabled ?? isAccountDeletionAuthExecutionEnabled
  )();
  if (!globalEnabled || !authEnabled) {
    return { ok: false, code: "auth_execution_disabled" };
  }

  const claimFn =
    deps.claimAuthExecution ??
    ((input) => defaultClaimAuthExecution(serviceRoleClient, input));
  const completeFn =
    deps.completeAuthExecution ??
    ((input) => defaultCompleteAuthExecution(serviceRoleClient, input));
  const getUserById =
    deps.getUserById ??
    ((id) => resolveAuthAdmin(serviceRoleClient).getUserById(id));
  const deleteUser =
    deps.deleteUser ??
    ((id, shouldSoftDelete) =>
      resolveAuthAdmin(serviceRoleClient).deleteUser(id, shouldSoftDelete));

  const claimPayload = await claimFn({
    requestId,
    attemptId,
    leaseSeconds: DEFAULT_CLAIM_LEASE_SECONDS,
  });
  if (claimPayload.code === "rpc_error") {
    return { ok: false, code: "claim_rpc_failed", retryable: true };
  }
  const claimParsed = parseClaimSuccess(claimPayload, requestId, attemptId);
  if (claimParsed.ok === false) {
    return {
      ok: false,
      code: claimParsed.code,
      retryable: claimParsed.retryable,
    };
  }

  const { targetUserId, deleteCommitToken } = claimParsed;

  const precheck = await getUserById(targetUserId);
  const precheckStatus = classifyAuthAdminGetUserByIdResponse(
    precheck.data,
    precheck.error
  );

  if (precheckStatus.status === "provider_error") {
    return {
      ok: false,
      code: "auth_precheck_failed",
      retryable: precheckStatus.retryable,
    };
  }

  let completionOutcome: "deleted" | "already_absent";

  if (precheckStatus.status === "absent") {
    completionOutcome = "already_absent";
  } else {
    const deleteResult = await deleteUser(
      targetUserId,
      ACCOUNT_DELETION_AUTH_HARD_DELETE
    );
    const deleteMissing = isAuthAdminUserNotFoundError(deleteResult.error);

    if (deleteResult.error && !deleteMissing) {
      const postDeleteCheck = await getUserById(targetUserId);
      const postStatus = classifyAuthAdminGetUserByIdResponse(
        postDeleteCheck.data,
        postDeleteCheck.error
      );
      if (postStatus.status === "absent") {
        completionOutcome = "deleted";
      } else if (postStatus.status === "present") {
        return { ok: false, code: "auth_verification_failed" };
      } else {
        return {
          ok: false,
          code: "auth_postcheck_failed",
          retryable: postStatus.retryable,
        };
      }
    } else {
      const postcheck = await getUserById(targetUserId);
      const postStatus = classifyAuthAdminGetUserByIdResponse(
        postcheck.data,
        postcheck.error
      );
      if (postStatus.status === "absent") {
        completionOutcome = deleteMissing ? "already_absent" : "deleted";
      } else if (postStatus.status === "present") {
        return { ok: false, code: "auth_verification_failed" };
      } else {
        return {
          ok: false,
          code: "auth_postcheck_failed",
          retryable: postStatus.retryable,
        };
      }
    }
  }

  const completePayload = await completeFn({
    requestId,
    attemptId,
    deleteCommitToken,
    outcome: completionOutcome,
  });
  if (completePayload.code === "rpc_error") {
    return { ok: false, code: "complete_rpc_failed", retryable: true };
  }

  const completeParsed = parseCompleteSuccess(
    completePayload,
    requestId,
    attemptId,
    targetUserId,
    completionOutcome
  );
  if (completeParsed.ok === false) {
    return { ok: false, code: completeParsed.code };
  }

  return {
    ok: true,
    code: completeParsed.code,
    requestId,
    attemptId,
    stage: "finalize",
  };
}
