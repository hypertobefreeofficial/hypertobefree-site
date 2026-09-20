import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountDeletionStorageManifestCaptureResult =
  | {
      ok: true;
      code: string;
      requestId: string;
      attemptId: string;
      targetUserId: string;
      objectCount: number;
      fingerprint: string | null;
      blockedCount: number;
      deletePrivateCount: number;
      hasBlockUnresolved: boolean;
    }
  | {
      ok: false;
      code: string;
      retryable?: boolean;
    };

type CaptureRpcPayload = {
  ok?: boolean;
  code?: string;
  request_id?: string;
  attempt_id?: string;
  target_user_id?: string;
  object_count?: number;
  fingerprint?: string | null;
  blocked_count?: number;
  delete_private_count?: number;
  has_block_unresolved?: boolean;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Invokes DB-authoritative storage manifest capture + finalize.
 * Accepts only requestId/attemptId — never bucket/path/disposition from callers.
 */
export async function captureAccountDeletionStorageManifest(input: {
  serviceRoleClient: SupabaseClient;
  requestId: string;
  attemptId: string;
}): Promise<AccountDeletionStorageManifestCaptureResult> {
  const { serviceRoleClient, requestId, attemptId } = input;

  if (!isNonEmptyString(requestId) || !isNonEmptyString(attemptId)) {
    return { ok: false, code: "invalid_arguments" };
  }

  const { data, error } = await serviceRoleClient.rpc(
    "capture_account_deletion_storage_manifest",
    {
      p_request_id: requestId,
      p_attempt_id: attemptId,
    }
  );

  if (error) {
    return { ok: false, code: "capture_rpc_failed", retryable: true };
  }

  const payload = (data ?? null) as CaptureRpcPayload | null;
  if (!payload || payload.ok !== true) {
    const code = isNonEmptyString(payload?.code)
      ? payload.code
      : "capture_failed";
    return {
      ok: false,
      code,
      retryable:
        code === "manifest_state_drift" ||
        code === "invariant_failed" ||
        code === "capture_rpc_failed",
    };
  }

  if (
    !isNonEmptyString(payload.request_id) ||
    !isNonEmptyString(payload.attempt_id) ||
    !isNonEmptyString(payload.target_user_id)
  ) {
    return { ok: false, code: "invariant_failed" };
  }

  return {
    ok: true,
    code: isNonEmptyString(payload.code) ? payload.code : "captured",
    requestId: payload.request_id,
    attemptId: payload.attempt_id,
    targetUserId: payload.target_user_id,
    objectCount: Number(payload.object_count ?? 0),
    fingerprint: payload.fingerprint ?? null,
    blockedCount: Number(payload.blocked_count ?? 0),
    deletePrivateCount: Number(payload.delete_private_count ?? 0),
    hasBlockUnresolved: Boolean(payload.has_block_unresolved),
  };
}

export const ACCOUNT_DELETION_STORAGE_MANIFEST_CAPTURE_MODULE_NOTE =
  "captureAccountDeletionStorageManifest coordinates the DB-authoritative capture RPC only. "
  + "No HTTP classification API; no Storage remove(); no post-database_completed progression.";
