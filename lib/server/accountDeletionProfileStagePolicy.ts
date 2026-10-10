/**
 * Profile-stage execution kill switch (Phase 4C.7B.1E.2C.3B.4A).
 * Not wired to orchestrator or HTTP in 3B.4A.
 */

export const ACCOUNT_DELETION_PROFILE_EXECUTION_ENV_FLAG =
  "HTBF_ACCOUNT_DELETION_PROFILE_EXECUTION_ENABLED" as const;

export function isAccountDeletionProfileExecutionEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env[ACCOUNT_DELETION_PROFILE_EXECUTION_ENV_FLAG] === "true";
}

/** Mirrors SQL account_deletion_scrubbed_profile_email(uuid) for tests and docs. */
export function accountDeletionScrubbedProfileEmail(targetUserId: string): string {
  return `account-deletion+${targetUserId}@deleted.invalid`;
}

/** Mirrors SQL account_deletion_scrubbed_profile_username(uuid) for tests and docs. */
export function accountDeletionScrubbedProfileUsername(targetUserId: string): string {
  const hex = targetUserId.replace(/-/g, "").slice(0, 20);
  return `del_${hex}`;
}

/** Mirrors SQL account_deletion_profile_username_is_deletion_tombstone_namespace(text). */
export function accountDeletionProfileUsernameIsDeletionTombstoneNamespace(
  username: string
): boolean {
  return /^del_[0-9a-f]{20}$/.test(username);
}

export const ACCOUNT_DELETION_PROFILE_STAGE_FOUNDATION_NOTE =
  "prepare_account_deletion_profile_stage performs DB-only profile cleanup from "
  + "storage_completed→profile. No profiles row DELETE, no Storage remove(), "
  + "no deferred_profile mutation. HTBF_ACCOUNT_DELETION_PROFILE_EXECUTION_ENABLED "
  + "is exact-string false by default and is not orchestrator-wired in 3B.4A.";
