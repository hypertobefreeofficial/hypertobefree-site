import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AccountDeletionProfileStageSuccessCode = "prepared" | "already_prepared";

export type AccountDeletionProfileStageFailureCode =
  | "invalid_arguments"
  | "rpc_error"
  | "request_not_in_progress"
  | "target_unresolved"
  | "attempt_mismatch"
  | "invalid_stage"
  | "irreversible_stage"
  | "storage_manifest_not_finalized"
  | "storage_execution_not_complete"
  | "profile_not_found"
  | "profile_username_tombstone_unavailable"
  | "invariant_failed";

export type AccountDeletionProfileCleanupSnapshot = {
  profileRowExists?: boolean;
  avatarUrlSevered?: boolean;
  identityScrubbed?: boolean;
  privateInboxRemaining?: number;
  storyReactionsRemaining?: number;
  savedContentRemaining?: number;
  prayerFollowsRemaining?: number;
  prayerSearchPreferencesRemaining?: number;
  blockedUsersRemaining?: number;
  deferredProfileResultCount?: number;
  deferredProfileActiveHoldCount?: number;
};

export type AccountDeletionProfileStageResult =
  | {
      ok: true;
      code: AccountDeletionProfileStageSuccessCode;
      requestId: string;
      attemptId: string;
      targetUserId: string;
      stage: string;
      profileRowsAffected: Record<string, unknown>;
      cleanupSnapshot: AccountDeletionProfileCleanupSnapshot;
      checkedAt?: string;
    }
  | {
      ok: false;
      code: AccountDeletionProfileStageFailureCode;
    };

type PrepareRpcPayload = {
  ok?: boolean;
  code?: string;
  request_id?: string;
  attempt_id?: string;
  target_user_id?: string;
  stage?: string;
  profile_rows_affected?: Record<string, unknown>;
  cleanup_snapshot?: Record<string, unknown>;
  checked_at?: string;
};

function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function parseCleanupSnapshot(
  raw: Record<string, unknown> | undefined
): AccountDeletionProfileCleanupSnapshot {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const num = (key: string) => {
    const value = raw[key];
    return typeof value === "number" ? value : undefined;
  };
  const bool = (key: string) => {
    const value = raw[key];
    return typeof value === "boolean" ? value : undefined;
  };
  return {
    profileRowExists: bool("profile_row_exists"),
    avatarUrlSevered: bool("avatar_url_severed"),
    identityScrubbed: bool("identity_scrubbed"),
    privateInboxRemaining: num("private_inbox_remaining"),
    storyReactionsRemaining: num("story_reactions_remaining"),
    savedContentRemaining: num("saved_content_remaining"),
    prayerFollowsRemaining: num("prayer_follows_remaining"),
    prayerSearchPreferencesRemaining: num("prayer_search_preferences_remaining"),
    blockedUsersRemaining: num("blocked_users_remaining"),
    deferredProfileResultCount: num("deferred_profile_result_count"),
    deferredProfileActiveHoldCount: num("deferred_profile_active_hold_count"),
  };
}

/**
 * Disconnected service-role wrapper for prepare_account_deletion_profile_stage.
 * NOT wired to execute handler or orchestrator in 3B.4A.
 */
export async function prepareAccountDeletionProfileStage(options: {
  serviceRoleClient: SupabaseClient;
  requestId: string;
  attemptId: string;
}): Promise<AccountDeletionProfileStageResult> {
  const { serviceRoleClient, requestId, attemptId } = options;

  if (!isValidUuid(requestId) || !isValidUuid(attemptId)) {
    return { ok: false, code: "invalid_arguments" };
  }

  const { data, error } = await serviceRoleClient.rpc(
    "prepare_account_deletion_profile_stage",
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
    typeof payload.target_user_id === "string"
  ) {
    return {
      ok: true,
      code,
      requestId: payload.request_id,
      attemptId: payload.attempt_id,
      targetUserId: payload.target_user_id,
      stage: typeof payload.stage === "string" ? payload.stage : "profile",
      profileRowsAffected: payload.profile_rows_affected ?? {},
      cleanupSnapshot: parseCleanupSnapshot(payload.cleanup_snapshot),
      checkedAt: payload.checked_at,
    };
  }

  const failureCode =
    typeof code === "string"
      ? (code as AccountDeletionProfileStageFailureCode)
      : "invariant_failed";

  return { ok: false, code: failureCode };
}
