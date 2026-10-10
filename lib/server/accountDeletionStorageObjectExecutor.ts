/**
 * One-object account-deletion Storage executor (Phase 4C.7B.1E.2C.3B.3D).
 * Server-only: no bucket/path/disposition from callers.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAccountDeletionSupabaseStorageAdapter,
  validateAccountDeletionStorageDeleteTarget,
} from "./accountDeletionSupabaseStorageAdapter";
import {
  ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
  type StorageObjectExistsFn,
} from "./accountDeletionStorageObjectExistence";
import { isAccountDeletionExecutionEnabled } from "./accountDeletionExecutionPolicy";
import {
  isAccountDeletionPhysicalStorageExecutionEnabled,
  isAccountDeletionStorageExecutionEnabled,
} from "./accountDeletionStorageExecutionPolicy";

export type AccountDeletionStorageObjectExecutorInput = {
  requestId: string;
  attemptId: string;
  resultId: string;
};

export type AccountDeletionStorageObjectExecutorResult =
  | {
      ok: true;
      code:
        | "deleted"
        | "missing"
        | "precheck_missing"
        | "already_terminal";
      executionState: string;
    }
  | {
      ok: false;
      code:
        | "execution_disabled"
        | "storage_execution_disabled"
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

export type StorageObjectRemoveFn = (
  bucket: string,
  paths: string[]
) => Promise<{ error: { message: string } | null }>;

export type { AccountDeletionStorageObjectExistence, StorageObjectExistsFn } from "./accountDeletionStorageObjectExistence";

export type AccountDeletionStorageObjectExecutorDeps = {
  serviceRoleClient: SupabaseClient;
  removeObjects: StorageObjectRemoveFn;
  objectExists: StorageObjectExistsFn;
  isAccountDeletionExecutionEnabled?: () => boolean;
  isStorageExecutionEnabled?: () => boolean;
};

type RpcPayload = Record<string, unknown>;

function asPayload(data: unknown): RpcPayload {
  return (data ?? {}) as RpcPayload;
}

export function mapAccountDeletionStorageProviderError(message: string): {
  code: string;
  terminal: boolean;
} {
  const lower = message.toLowerCase();
  if (
    lower.includes("network") ||
    lower.includes("timeout") ||
    lower.includes("fetch failed") ||
    lower.includes("econnreset")
  ) {
    return { code: "storage_network_error", terminal: false };
  }
  if (lower.includes("503") || lower.includes("unavailable")) {
    return { code: "storage_provider_unavailable", terminal: false };
  }
  if (
    lower.includes("403") ||
    lower.includes("401") ||
    lower.includes("permission") ||
    lower.includes("jwt") ||
    lower.includes("bearer") ||
    lower.includes("service_role") ||
    lower.includes("authorization")
  ) {
    return { code: "storage_permission_error", terminal: true };
  }
  return { code: "storage_delete_failed", terminal: false };
}

/** Never persist raw provider text — bounded internal codes only. */
export function sanitizeAccountDeletionStorageProviderDetail(
  _message: string
): null {
  return null;
}

function resolveExecutionFlags(deps: AccountDeletionStorageObjectExecutorDeps): {
  globalEnabled: boolean;
  storageEnabled: boolean;
} {
  const globalEnabled = (
    deps.isAccountDeletionExecutionEnabled ?? isAccountDeletionExecutionEnabled
  )();
  const storageEnabled = (
    deps.isStorageExecutionEnabled ?? isAccountDeletionStorageExecutionEnabled
  )();
  return { globalEnabled, storageEnabled };
}

async function recordExistenceUncertainRetryable(
  client: SupabaseClient,
  params: {
    requestId: string;
    attemptId: string;
    resultId: string;
    commitToken: string;
  }
): Promise<AccountDeletionStorageObjectExecutorResult | null> {
  const completeResp = await client.rpc(
    "complete_account_deletion_storage_execution_object",
    {
      p_request_id: params.requestId,
      p_attempt_id: params.attemptId,
      p_result_id: params.resultId,
      p_delete_commit_token: params.commitToken,
      p_outcome: "failed_retryable",
      p_error_code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
      p_error_detail_safe: null,
    }
  );
  const completePayload = asPayload(completeResp.data);
  if (completePayload.ok !== true) {
    return {
      ok: false,
      code: "complete_failed",
      detail: String(completePayload.code),
    };
  }
  return null;
}

export async function executeAccountDeletionStorageObject(
  input: AccountDeletionStorageObjectExecutorInput,
  deps: AccountDeletionStorageObjectExecutorDeps
): Promise<AccountDeletionStorageObjectExecutorResult> {
  const { globalEnabled, storageEnabled } = resolveExecutionFlags(deps);
  if (!globalEnabled) {
    return { ok: false, code: "execution_disabled" };
  }
  if (!storageEnabled) {
    return { ok: false, code: "storage_execution_disabled" };
  }

  const { requestId, attemptId, resultId } = input;
  const client = deps.serviceRoleClient;

  let claimToken: string | null = null;

  const claimResp = await client.rpc(
    "claim_account_deletion_storage_execution_result",
    {
      p_request_id: requestId,
      p_attempt_id: attemptId,
      p_result_id: resultId,
      p_lease_seconds: 900,
    }
  );

  const claimPayload = asPayload(claimResp.data);
  if (claimPayload.ok === true && typeof claimPayload.claim_token === "string") {
    claimToken = claimPayload.claim_token;
  } else if (claimPayload.code === "not_claimable") {
    const { data: row, error: rowError } = await client
      .from("account_deletion_storage_execution_results")
      .select(
        "execution_state, claim_token, claim_lease_expires_at, delete_commit_token, delete_commit_expires_at"
      )
      .eq("id", resultId)
      .maybeSingle();

    if (rowError || !row) {
      return {
        ok: false,
        code: "claim_failed",
        detail: String(claimPayload.code ?? "not_claimable"),
      };
    }

    const leaseValid =
      row.claim_lease_expires_at &&
      new Date(row.claim_lease_expires_at).getTime() > Date.now();
    const commitValid =
      row.delete_commit_token &&
      row.delete_commit_expires_at &&
      new Date(row.delete_commit_expires_at).getTime() > Date.now();

    if (
      row.execution_state === "deleting" &&
      typeof row.claim_token === "string" &&
      (leaseValid || commitValid)
    ) {
      claimToken = row.claim_token;
    } else {
      return {
        ok: false,
        code: "claim_failed",
        detail: String(claimPayload.code ?? "not_claimable"),
      };
    }
  } else {
    return {
      ok: false,
      code: "claim_failed",
      detail: String(claimPayload.code ?? claimResp.error?.message ?? "claim"),
    };
  }

  const authResp = await client.rpc(
    "authorize_account_deletion_storage_object_delete",
    {
      p_request_id: requestId,
      p_attempt_id: attemptId,
      p_result_id: resultId,
      p_claim_token: claimToken,
    }
  );
  const authPayload = asPayload(authResp.data);

  if (authPayload.ok !== true) {
    return {
      ok: false,
      code: "authorize_failed",
      detail: String(authPayload.code ?? authResp.error?.message ?? "authorize"),
      retryable: authPayload.code === "preservation_hold_active",
    };
  }

  if (
    authPayload.code === "precheck_missing" ||
    authPayload.terminal === true
  ) {
    return {
      ok: true,
      code: "precheck_missing",
      executionState: "missing",
    };
  }

  const bucket = String(authPayload.bucket ?? "");
  const objectPath = String(authPayload.object_path ?? "");
  const commitToken = String(authPayload.delete_commit_token ?? "");

  if (!bucket || !objectPath || !commitToken) {
    return { ok: false, code: "authorize_failed", detail: "incomplete_authority" };
  }

  const targetValidation = validateAccountDeletionStorageDeleteTarget(
    bucket,
    objectPath
  );
  if (targetValidation.ok === false) {
    return {
      ok: false,
      code: "authorize_failed",
      detail: targetValidation.code,
    };
  }

  const existsBefore = await deps.objectExists(bucket, objectPath);
  if (existsBefore.status === "uncertain") {
    const completeFailure = await recordExistenceUncertainRetryable(client, {
      requestId,
      attemptId,
      resultId,
      commitToken,
    });
    if (completeFailure) {
      return completeFailure;
    }
    return {
      ok: false,
      code: "storage_existence_check_failed",
      detail: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
      retryable: true,
    };
  }
  if (existsBefore.status === "absent") {
    const completeMissing = await client.rpc(
      "complete_account_deletion_storage_execution_object",
      {
        p_request_id: requestId,
        p_attempt_id: attemptId,
        p_result_id: resultId,
        p_delete_commit_token: commitToken,
        p_outcome: "missing",
        p_error_code: null,
        p_error_detail_safe: null,
      }
    );
    const completePayload = asPayload(completeMissing.data);
    if (completePayload.ok !== true) {
      return {
        ok: false,
        code: "complete_failed",
        detail: String(completePayload.code),
      };
    }
    return { ok: true, code: "missing", executionState: "missing" };
  }

  const removeResult = await deps.removeObjects(bucket, [objectPath]);
  if (removeResult.error) {
    const mapped = mapAccountDeletionStorageProviderError(
      removeResult.error.message
    );
    await client.rpc("complete_account_deletion_storage_execution_object", {
      p_request_id: requestId,
      p_attempt_id: attemptId,
      p_result_id: resultId,
      p_delete_commit_token: commitToken,
      p_outcome: mapped.terminal ? "failed_terminal" : "failed_retryable",
      p_error_code: mapped.code,
      p_error_detail_safe: sanitizeAccountDeletionStorageProviderDetail(
        removeResult.error.message
      ),
    });
    return {
      ok: false,
      code: "storage_remove_failed",
      detail: mapped.code,
      retryable: !mapped.terminal,
    };
  }

  const afterRemoveExistence = await deps.objectExists(bucket, objectPath);
  if (afterRemoveExistence.status === "uncertain") {
    const completeFailure = await recordExistenceUncertainRetryable(client, {
      requestId,
      attemptId,
      resultId,
      commitToken,
    });
    if (completeFailure) {
      return completeFailure;
    }
    return {
      ok: false,
      code: "storage_existence_check_failed",
      detail: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
      retryable: true,
    };
  }
  if (afterRemoveExistence.status === "exists") {
    await client.rpc("complete_account_deletion_storage_execution_object", {
      p_request_id: requestId,
      p_attempt_id: attemptId,
      p_result_id: resultId,
      p_delete_commit_token: commitToken,
      p_outcome: "failed_retryable",
      p_error_code: "storage_postdelete_verification_failed",
      p_error_detail_safe: "postdelete_verification_failed",
    });
    return {
      ok: false,
      code: "storage_postdelete_verification_failed",
      retryable: true,
    };
  }

  const completeDeleted = await client.rpc(
    "complete_account_deletion_storage_execution_object",
    {
      p_request_id: requestId,
      p_attempt_id: attemptId,
      p_result_id: resultId,
      p_delete_commit_token: commitToken,
      p_outcome: "deleted",
      p_error_code: null,
      p_error_detail_safe: null,
    }
  );
  const deletedPayload = asPayload(completeDeleted.data);
  if (deletedPayload.ok !== true) {
    return {
      ok: false,
      code: "complete_failed",
      detail: String(deletedPayload.code),
    };
  }

  return {
    ok: true,
    code: "deleted",
    executionState: String(deletedPayload.execution_state ?? "deleted"),
  };
}

export function createAccountDeletionStorageObjectExecutorDeps(
  serviceRoleClient: SupabaseClient
): AccountDeletionStorageObjectExecutorDeps {
  const adapter = createAccountDeletionSupabaseStorageAdapter(serviceRoleClient);
  return {
    serviceRoleClient,
    removeObjects: adapter.removeObjects,
    objectExists: adapter.objectExists,
  };
}

export const ACCOUNT_DELETION_STORAGE_OBJECT_EXECUTOR_NOTE =
  "executeAccountDeletionStorageObject accepts only requestId/attemptId/resultId. "
  + "Bucket/path/disposition are DB-derived via authorize RPC. "
  + "Requires HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED=true AND "
  + "HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED=true. "
  + "Uses supabase.storage.from(bucket).remove([path]) via server adapter — never storage.objects DELETE.";

export { isAccountDeletionPhysicalStorageExecutionEnabled };
