/**
 * One-object profile-avatar physical deletion executor (3B.4B.2A).
 * Unwired: callers supply only DB-bound request, attempt, and result UUIDs.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAccountDeletionProfileMediaStorageAdapter,
  validateAccountDeletionProfileAvatarObjectPath,
  type AccountDeletionProfileMediaStorageAdapter,
  type AccountDeletionProfileMediaStorageErrorCode,
} from "./accountDeletionProfileMediaStorageAdapter";
import {
  parseAccountDeletionProfileMediaClaim,
  parseAccountDeletionProfileMediaDeleteAuthority,
} from "./accountDeletionProfileMediaPolicy";
import { isAccountDeletionExecutionEnabled } from "./accountDeletionExecutionPolicy";
import { isAccountDeletionProfileExecutionEnabled } from "./accountDeletionProfileStagePolicy";
import { isAccountDeletionStorageExecutionEnabled } from "./accountDeletionStorageExecutionPolicy";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL_STATES = new Set(["deleted", "missing", "failed_terminal"]);

type RpcPayload = Record<string, unknown>;

export type AccountDeletionProfileMediaObjectExecutorInput = {
  requestId: string;
  attemptId: string;
  resultId: string;
};

export type AccountDeletionProfileMediaObjectExecutorResult =
  | {
      ok: true;
      code: "deleted" | "missing" | "already_terminal";
      executionState: string;
    }
  | {
      ok: false;
      code:
        | "execution_disabled"
        | "profile_execution_disabled"
        | "profile_storage_execution_disabled"
        | "invalid_arguments"
        | "delete_authority_expired"
        | "claim_failed"
        | "authorize_failed"
        | "complete_failed"
        | "storage_remove_failed"
        | "storage_postdelete_verification_failed"
        | "storage_existence_check_failed"
        | "internal_error";
      detail?: string;
      retryable?: boolean;
    };

export type AccountDeletionProfileMediaObjectExecutorDeps = {
  serviceRoleClient: SupabaseClient;
  storageAdapter: AccountDeletionProfileMediaStorageAdapter;
  isAccountDeletionExecutionEnabled?: () => boolean;
  isProfileExecutionEnabled?: () => boolean;
  isStorageExecutionEnabled?: () => boolean;
  now?: () => number;
};

type CompletionOutcome =
  | "deleted"
  | "missing"
  | "failed_retryable"
  | "failed_terminal";

type CompletionErrorCode =
  | "storage_existence_check_failed"
  | "storage_network_error"
  | "storage_provider_unavailable"
  | "storage_permission_error"
  | "storage_delete_failed"
  | "storage_postdelete_verification_failed";

type ResumeRow = {
  id?: unknown;
  deletion_request_id?: unknown;
  execution_attempt_id?: unknown;
  execution_state?: unknown;
  claim_token?: unknown;
  claim_lease_expires_at?: unknown;
  delete_commit_token?: unknown;
  delete_commit_expires_at?: unknown;
};

function payload(value: unknown): RpcPayload | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RpcPayload)
    : null;
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function futureTimestamp(value: unknown, now: number): boolean {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > now;
}

function alreadyTerminalResult(completed: {
  executionState: string;
  alreadyTerminal: boolean;
}): AccountDeletionProfileMediaObjectExecutorResult | null {
  return completed.alreadyTerminal
    ? {
        ok: true,
        code: "already_terminal",
        executionState: completed.executionState,
      }
    : null;
}

function boundedCode(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[a-z0-9_]{1,80}$/.test(value)
    ? value
    : fallback;
}

async function loadBoundResumeState(
  client: SupabaseClient,
  input: AccountDeletionProfileMediaObjectExecutorInput
): Promise<ResumeRow | null> {
  const response = await client
    .from("account_deletion_storage_execution_results")
    .select(
      "id,deletion_request_id,execution_attempt_id,execution_state,claim_token,claim_lease_expires_at,delete_commit_token,delete_commit_expires_at"
    )
    .eq("id", input.resultId)
    .eq("deletion_request_id", input.requestId)
    .eq("execution_attempt_id", input.attemptId)
    .maybeSingle();
  if (response.error || !response.data) return null;
  return response.data as ResumeRow;
}

async function complete(
  client: SupabaseClient,
  input: AccountDeletionProfileMediaObjectExecutorInput,
  commitToken: string,
  outcome: CompletionOutcome,
  errorCode: CompletionErrorCode | null
): Promise<
  | { ok: true; executionState: string; alreadyTerminal: boolean }
  | { ok: false; detail: string }
> {
  const response = await client.rpc(
    "complete_account_deletion_profile_media_execution_result",
    {
      p_request_id: input.requestId,
      p_attempt_id: input.attemptId,
      p_result_id: input.resultId,
      p_delete_commit_token: commitToken,
      p_outcome: outcome,
      p_error_code: errorCode,
    }
  );
  if (response.error) {
    return { ok: false, detail: "rpc_error" };
  }
  const result = payload(response.data);
  if (!result || result.ok !== true) {
    return {
      ok: false,
      detail: boundedCode(result?.code, "invalid_completion_response"),
    };
  }
  const state =
    typeof result.execution_state === "string" ? result.execution_state : "";
  if (result.code === "already_terminal" && TERMINAL_STATES.has(state)) {
    return { ok: true, executionState: state, alreadyTerminal: true };
  }
  const allowedState =
    state === outcome ||
    (outcome === "failed_retryable" && state === "failed_terminal");
  if (result.code !== "completed" || !allowedState) {
    return { ok: false, detail: "invalid_completion_response" };
  }
  return { ok: true, executionState: state, alreadyTerminal: false };
}

function mapProviderCompletion(
  code: AccountDeletionProfileMediaStorageErrorCode
): CompletionErrorCode {
  switch (code) {
    case "storage_delete_unauthorized":
    case "storage_delete_forbidden":
    case "storage_delete_invalid_path":
      return "storage_permission_error";
    case "storage_delete_network_failed":
      return "storage_network_error";
    case "storage_delete_provider_failed":
      return "storage_provider_unavailable";
    case "storage_delete_conflict":
    case "storage_delete_rate_limited":
      return "storage_delete_failed";
  }
}

export async function executeAccountDeletionProfileMediaObject(
  input: AccountDeletionProfileMediaObjectExecutorInput,
  deps: AccountDeletionProfileMediaObjectExecutorDeps
): Promise<AccountDeletionProfileMediaObjectExecutorResult> {
  const globalEnabled = (
    deps.isAccountDeletionExecutionEnabled ?? isAccountDeletionExecutionEnabled
  )();
  if (!globalEnabled) return { ok: false, code: "execution_disabled" };
  const profileEnabled = (
    deps.isProfileExecutionEnabled ?? isAccountDeletionProfileExecutionEnabled
  )();
  if (!profileEnabled) {
    return { ok: false, code: "profile_execution_disabled" };
  }
  const storageEnabled = (
    deps.isStorageExecutionEnabled ?? isAccountDeletionStorageExecutionEnabled
  )();
  if (!storageEnabled) {
    return { ok: false, code: "profile_storage_execution_disabled" };
  }

  if (
    !validUuid(input.requestId) ||
    !validUuid(input.attemptId) ||
    !validUuid(input.resultId)
  ) {
    return { ok: false, code: "invalid_arguments" };
  }

  const currentTime = () => deps.now?.() ?? Date.now();
  const client = deps.serviceRoleClient;

  try {
    const claimResponse = await client.rpc(
      "claim_account_deletion_profile_media_execution_result",
      {
        p_request_id: input.requestId,
        p_attempt_id: input.attemptId,
        p_result_id: input.resultId,
        p_lease_seconds: 900,
      }
    );
    if (claimResponse.error) {
      return { ok: false, code: "claim_failed", detail: "rpc_error" };
    }

    const claimPayload = payload(claimResponse.data);
    const parsedClaim = parseAccountDeletionProfileMediaClaim(claimPayload);
    let claimToken: string | null = null;

    if (
      parsedClaim &&
      parsedClaim.resultId === input.resultId &&
      validUuid(parsedClaim.claimToken) &&
      futureTimestamp(parsedClaim.claimExpiresAt, currentTime())
    ) {
      claimToken = parsedClaim.claimToken;
    } else {
      const claimCode = boundedCode(claimPayload?.code, "invalid_claim_response");
      if (claimCode !== "not_claimable" && claimCode !== "delete_already_committed") {
        return { ok: false, code: "claim_failed", detail: claimCode };
      }

      const row = await loadBoundResumeState(client, input);
      if (!row) {
        return { ok: false, code: "claim_failed", detail: claimCode };
      }
      const state =
        typeof row.execution_state === "string" ? row.execution_state : "";
      if (TERMINAL_STATES.has(state)) {
        return { ok: true, code: "already_terminal", executionState: state };
      }
      const resumeTime = currentTime();
      const leaseValid = futureTimestamp(row.claim_lease_expires_at, resumeTime);
      const commitValid =
        validUuid(row.delete_commit_token) &&
        futureTimestamp(row.delete_commit_expires_at, resumeTime);
      if (
        state !== "deleting" ||
        !validUuid(row.claim_token) ||
        (!leaseValid && !commitValid) ||
        (claimCode === "delete_already_committed" && !commitValid)
      ) {
        return { ok: false, code: "claim_failed", detail: claimCode };
      }
      claimToken = row.claim_token;
    }

    const authorizeResponse = await client.rpc(
      "authorize_account_deletion_profile_media_delete",
      {
        p_request_id: input.requestId,
        p_attempt_id: input.attemptId,
        p_result_id: input.resultId,
        p_claim_token: claimToken,
      }
    );
    if (authorizeResponse.error) {
      return { ok: false, code: "authorize_failed", detail: "rpc_error" };
    }
    const authorizePayload = payload(authorizeResponse.data);
    const authority =
      parseAccountDeletionProfileMediaDeleteAuthority(authorizePayload);
    if (
      !authority ||
      authority.resultId !== input.resultId ||
      !validUuid(authority.deleteCommitToken) ||
      !futureTimestamp(authority.deleteCommitExpiresAt, currentTime()) ||
      !validateAccountDeletionProfileAvatarObjectPath(authority.objectPath)
    ) {
      return {
        ok: false,
        code: "authorize_failed",
        detail: boundedCode(authorizePayload?.code, "invalid_authority"),
      };
    }

    const existsBefore = await deps.storageAdapter.objectExists(
      authority.objectPath
    );
    if (existsBefore.status === "absent") {
      const completed = await complete(
        client,
        input,
        authority.deleteCommitToken,
        "missing",
        null
      );
      if (completed.ok === false) {
        return { ok: false, code: "complete_failed", detail: completed.detail };
      }
      return (
        alreadyTerminalResult(completed) ?? {
          ok: true,
          code: "missing",
          executionState: completed.executionState,
        }
      );
    }
    if (existsBefore.status === "uncertain") {
      const completed = await complete(
        client,
        input,
        authority.deleteCommitToken,
        "failed_retryable",
        "storage_existence_check_failed"
      );
      if (completed.ok === false) {
        return { ok: false, code: "complete_failed", detail: completed.detail };
      }
      const terminalReplay = alreadyTerminalResult(completed);
      if (terminalReplay) return terminalReplay;
      return {
        ok: false,
        code: "storage_existence_check_failed",
        retryable: completed.executionState === "failed_retryable",
      };
    }

    // Authorization expiry is a destructive boundary, not merely a parser check.
    // Use a fresh clock reading after the potentially slow existence probe.
    if (
      !futureTimestamp(authority.deleteCommitExpiresAt, currentTime())
    ) {
      return {
        ok: false,
        code: "delete_authority_expired",
        retryable: true,
      };
    }

    const removed = await deps.storageAdapter.removeObject(authority.objectPath);
    const existsAfter = await deps.storageAdapter.objectExists(
      authority.objectPath
    );

    if (existsAfter.status === "absent") {
      const completed = await complete(
        client,
        input,
        authority.deleteCommitToken,
        "deleted",
        null
      );
      if (completed.ok === false) {
        return { ok: false, code: "complete_failed", detail: completed.detail };
      }
      return (
        alreadyTerminalResult(completed) ?? {
          ok: true,
          code: "deleted",
          executionState: completed.executionState,
        }
      );
    }

    if (existsAfter.status === "uncertain") {
      const completed = await complete(
        client,
        input,
        authority.deleteCommitToken,
        "failed_retryable",
        "storage_existence_check_failed"
      );
      if (completed.ok === false) {
        return { ok: false, code: "complete_failed", detail: completed.detail };
      }
      const terminalReplay = alreadyTerminalResult(completed);
      if (terminalReplay) return terminalReplay;
      return {
        ok: false,
        code: "storage_existence_check_failed",
        retryable: completed.executionState === "failed_retryable",
      };
    }

    if (removed.ok) {
      const completed = await complete(
        client,
        input,
        authority.deleteCommitToken,
        "failed_retryable",
        "storage_postdelete_verification_failed"
      );
      if (completed.ok === false) {
        return { ok: false, code: "complete_failed", detail: completed.detail };
      }
      const terminalReplay = alreadyTerminalResult(completed);
      if (terminalReplay) return terminalReplay;
      return {
        ok: false,
        code: "storage_postdelete_verification_failed",
        retryable: completed.executionState === "failed_retryable",
      };
    }

    if (removed.ok !== false) {
      return { ok: false, code: "internal_error" };
    }
    const completionError = mapProviderCompletion(removed.code);
    const outcome = removed.terminal ? "failed_terminal" : "failed_retryable";
    const completed = await complete(
      client,
      input,
      authority.deleteCommitToken,
      outcome,
      completionError
    );
    if (completed.ok === false) {
      return { ok: false, code: "complete_failed", detail: completed.detail };
    }
    const terminalReplay = alreadyTerminalResult(completed);
    if (terminalReplay) return terminalReplay;
    return {
      ok: false,
      code: "storage_remove_failed",
      detail: removed.code,
      retryable: completed.executionState === "failed_retryable",
    };
  } catch {
    return { ok: false, code: "internal_error" };
  }
}

export function createAccountDeletionProfileMediaObjectExecutorDeps(
  serviceRoleClient: SupabaseClient
): AccountDeletionProfileMediaObjectExecutorDeps {
  return {
    serviceRoleClient,
    storageAdapter:
      createAccountDeletionProfileMediaStorageAdapter(serviceRoleClient),
  };
}

export const ACCOUNT_DELETION_PROFILE_MEDIA_OBJECT_EXECUTOR_NOTE =
  "Unwired one-object executor. DB claim/authorize binds authority; callers pass "
  + "only requestId/attemptId/resultId. Physical deletion requires global, profile, "
  + "and storage execution flags to equal the exact string true.";
