/**
 * Unwired profile-media DB authority contracts (Phase 4C.7B.1E.2C.3B.4B.1).
 * This module has no provider adapter and performs no physical deletion.
 */

import { isAccountDeletionExecutionEnabled } from "./accountDeletionExecutionPolicy";
import { isAccountDeletionProfileExecutionEnabled } from "./accountDeletionProfileStagePolicy";
import { isAccountDeletionStorageExecutionEnabled } from "./accountDeletionStorageExecutionPolicy";

export const ACCOUNT_DELETION_PROFILE_MEDIA_STATES = [
  "deferred_profile",
  "deleting",
  "deleted",
  "missing",
  "failed_retryable",
  "failed_terminal",
] as const;

export type AccountDeletionProfileMediaState =
  (typeof ACCOUNT_DELETION_PROFILE_MEDIA_STATES)[number];

export const ACCOUNT_DELETION_PROFILE_MEDIA_COMPLETION_OUTCOMES = [
  "deleted",
  "missing",
  "failed_retryable",
  "failed_terminal",
] as const;

export type AccountDeletionProfileMediaCompletionOutcome =
  (typeof ACCOUNT_DELETION_PROFILE_MEDIA_COMPLETION_OUTCOMES)[number];

export type AccountDeletionProfileMediaClaim = {
  resultId: string;
  claimToken: string;
  claimExpiresAt: string;
  reclaimed: boolean;
};

export type AccountDeletionProfileMediaDeleteAuthority = {
  resultId: string;
  bucket: "profile-avatars";
  objectPath: string;
  deleteCommitToken: string;
  deleteCommitExpiresAt: string;
};

export type AccountDeletionProfileMediaProgress = {
  total: number;
  resultCount: number;
  deferredProfile: number;
  deleting: number;
  deleted: number;
  missing: number;
  failedRetryable: number;
  failedTerminal: number;
  activeHoldCount: number;
  actionableCount: number;
  mismatchCount: number;
  completionBlocked: boolean;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: UnknownRecord, key: string): string | null {
  return typeof value[key] === "string" ? value[key] : null;
}

function numberField(value: UnknownRecord, key: string): number | null {
  return typeof value[key] === "number" && Number.isInteger(value[key])
    ? value[key]
    : null;
}

export function parseAccountDeletionProfileMediaClaim(
  value: unknown
): AccountDeletionProfileMediaClaim | null {
  if (!isRecord(value) || value.ok !== true || value.code !== "claimed") return null;
  const resultId = stringField(value, "result_id");
  const claimToken = stringField(value, "claim_token");
  const claimExpiresAt = stringField(value, "claim_lease_expires_at");
  if (!resultId || !claimToken || !claimExpiresAt) return null;
  return {
    resultId,
    claimToken,
    claimExpiresAt,
    reclaimed: value.reclaimed === true,
  };
}

export function parseAccountDeletionProfileMediaDeleteAuthority(
  value: unknown
): AccountDeletionProfileMediaDeleteAuthority | null {
  if (
    !isRecord(value) ||
    value.ok !== true ||
    (value.code !== "authorized" && value.code !== "already_authorized")
  ) {
    return null;
  }
  const resultId = stringField(value, "result_id");
  const objectPath = stringField(value, "object_path");
  const deleteCommitToken = stringField(value, "delete_commit_token");
  const deleteCommitExpiresAt = stringField(value, "delete_commit_expires_at");
  if (
    !resultId ||
    value.bucket !== "profile-avatars" ||
    !objectPath ||
    !deleteCommitToken ||
    !deleteCommitExpiresAt
  ) {
    return null;
  }
  return {
    resultId,
    bucket: "profile-avatars",
    objectPath,
    deleteCommitToken,
    deleteCommitExpiresAt,
  };
}

export function parseAccountDeletionProfileMediaProgress(
  value: unknown
): AccountDeletionProfileMediaProgress | null {
  if (!isRecord(value) || value.ok !== true) return null;
  const total = numberField(value, "total");
  const resultCount = numberField(value, "result_count");
  const deferredProfile = numberField(value, "deferred_profile");
  const deleting = numberField(value, "deleting");
  const deleted = numberField(value, "deleted");
  const missing = numberField(value, "missing");
  const failedRetryable = numberField(value, "failed_retryable");
  const failedTerminal = numberField(value, "failed_terminal");
  const activeHoldCount = numberField(value, "active_hold_count");
  const actionableCount = numberField(value, "actionable_count");
  const mismatchCount = numberField(value, "mismatch_count");
  if (
    total === null ||
    resultCount === null ||
    deferredProfile === null ||
    deleting === null ||
    deleted === null ||
    missing === null ||
    failedRetryable === null ||
    failedTerminal === null ||
    activeHoldCount === null ||
    actionableCount === null ||
    mismatchCount === null ||
    typeof value.completion_blocked !== "boolean"
  ) {
    return null;
  }
  return {
    total,
    resultCount,
    deferredProfile,
    deleting,
    deleted,
    missing,
    failedRetryable,
    failedTerminal,
    activeHoldCount,
    actionableCount,
    mismatchCount,
    completionBlocked: value.completion_blocked,
  };
}

/** Future physical avatar deletion requires all three existing exact-true flags. */
export function isAccountDeletionPhysicalProfileMediaExecutionEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    isAccountDeletionExecutionEnabled(env) &&
    isAccountDeletionProfileExecutionEnabled(env) &&
    isAccountDeletionStorageExecutionEnabled(env)
  );
}

export const ACCOUNT_DELETION_PROFILE_MEDIA_FOUNDATION_NOTE =
  "Profile-media claim/authorize/complete authority is DB-only and unwired. "
  + "It accepts only bound request/attempt/result identifiers, returns profile-avatars authority "
  + "only after reference safety checks, and performs no provider call or physical deletion.";
