/**
 * Profile-media stage runner policy (Phase 4C.7B.1E.2C.3B.4B.2.2).
 */

import { isAccountDeletionExecutionEnabled } from "./accountDeletionExecutionPolicy";
import type { AccountDeletionProfileMediaProgress } from "./accountDeletionProfileMediaPolicy";
import type { AccountDeletionProfileMediaObjectExecutorResult } from "./accountDeletionProfileMediaObjectExecutor";
import { isAccountDeletionProfileExecutionEnabled } from "./accountDeletionProfileStagePolicy";
import { isAccountDeletionStorageExecutionEnabled } from "./accountDeletionStorageExecutionPolicy";

export const ACCOUNT_DELETION_PROFILE_MEDIA_STAGE_RUNNER_BATCH_SIZE = 5;

export type AccountDeletionProfileMediaStageTickCode =
  | "precondition_failed"
  | "profile_media_completed"
  | "profile_media_in_progress"
  | "profile_media_blocked"
  | "profile_media_precondition_failed"
  | "execution_disabled"
  | "profile_execution_disabled"
  | "profile_storage_execution_disabled";

export type AccountDeletionProfileMediaProgressSummary = {
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

export type AccountDeletionProfileMediaStageTickResult = {
  ok: boolean;
  code: AccountDeletionProfileMediaStageTickCode;
  progress?: AccountDeletionProfileMediaProgressSummary;
  selectedCount?: number;
  processedCount?: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PROFILE_MEDIA_CLAIM_AUTHORIZE_CONTINUE_DETAILS = new Set([
  "not_claimable",
  "claim_conflict",
  "preservation_hold_active",
  "claim_lease_expired",
  "claim_token_mismatch",
  "commit_conflict",
  "not_deleting",
  "delete_already_committed",
]);

export const PROFILE_MEDIA_CLAIM_AUTHORIZE_STOP_DETAILS = new Set([
  "rpc_error",
  "request_not_in_progress",
  "target_unresolved",
  "attempt_mismatch",
  "result_mismatch",
  "profile_media_target_not_scrubbed",
  "profile_media_reference_active",
  "profile_media_authority_mismatch",
  "profile_media_path_not_authorized",
  "invalid_arguments",
  "invalid_lease",
  "invalid_claim_response",
  "invalid_authority",
  "invalid_completion_response",
]);

export function isValidAccountDeletionUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function clampProfileMediaRunnerBatchSize(value: number | undefined): number {
  const base = value ?? ACCOUNT_DELETION_PROFILE_MEDIA_STAGE_RUNNER_BATCH_SIZE;
  return Math.min(
    Math.max(base, 1),
    ACCOUNT_DELETION_PROFILE_MEDIA_STAGE_RUNNER_BATCH_SIZE
  );
}

export function parseAccountDeletionReadinessProbe(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { ready?: unknown }).ready === true
  );
}

export function toProfileMediaProgressSummary(
  progress: AccountDeletionProfileMediaProgress
): AccountDeletionProfileMediaProgressSummary {
  return {
    total: progress.total,
    resultCount: progress.resultCount,
    deferredProfile: progress.deferredProfile,
    deleting: progress.deleting,
    deleted: progress.deleted,
    missing: progress.missing,
    failedRetryable: progress.failedRetryable,
    failedTerminal: progress.failedTerminal,
    activeHoldCount: progress.activeHoldCount,
    actionableCount: progress.actionableCount,
    mismatchCount: progress.mismatchCount,
    completionBlocked: progress.completionBlocked,
  };
}

export function profileMediaProgressHasInflightWork(
  progress: AccountDeletionProfileMediaProgress
): boolean {
  return (
    progress.actionableCount > 0 ||
    progress.deferredProfile > 0 ||
    progress.failedRetryable > 0 ||
    progress.deleting > 0
  );
}

export function mapProfileMediaStatusFromProgress(
  progress: AccountDeletionProfileMediaProgress
): AccountDeletionProfileMediaStageTickCode {
  if (!progress.completionBlocked) {
    return "profile_media_completed";
  }
  if (progress.mismatchCount > 0) {
    return "profile_media_precondition_failed";
  }
  if (progress.failedTerminal > 0) {
    return "profile_media_blocked";
  }
  if (progress.activeHoldCount > 0) {
    return "profile_media_blocked";
  }
  if (progress.deleting > 0) {
    return "profile_media_in_progress";
  }
  if (
    progress.actionableCount > 0 ||
    progress.deferredProfile > 0 ||
    progress.failedRetryable > 0
  ) {
    return "profile_media_in_progress";
  }
  return "profile_media_precondition_failed";
}

export function profileMediaExecutionDisabledCode(
  env: NodeJS.ProcessEnv = process.env
): AccountDeletionProfileMediaStageTickCode | null {
  if (!isAccountDeletionExecutionEnabled(env)) {
    return "execution_disabled";
  }
  if (!isAccountDeletionProfileExecutionEnabled(env)) {
    return "profile_execution_disabled";
  }
  if (!isAccountDeletionStorageExecutionEnabled(env)) {
    return "profile_storage_execution_disabled";
  }
  return null;
}

export function tickOkForCode(
  code: AccountDeletionProfileMediaStageTickCode
): boolean {
  return (
    code === "profile_media_completed" || code === "profile_media_in_progress"
  );
}

export function parseAccountDeletionProfileMediaSelectorResult(
  value: unknown
): { ok: true; resultIds: string[] } | { ok: false } {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { ok?: unknown }).ok !== true ||
    (value as { code?: unknown }).code !== "selected"
  ) {
    return { ok: false };
  }
  const record = value as {
    result_ids?: unknown;
    selected_count?: unknown;
  };
  if (!Array.isArray(record.result_ids)) {
    return { ok: false };
  }
  if (
    typeof record.selected_count !== "number" ||
    !Number.isInteger(record.selected_count)
  ) {
    return { ok: false };
  }
  const resultIds: string[] = [];
  const seen = new Set<string>();
  for (const entry of record.result_ids) {
    if (typeof entry !== "string" || !isValidAccountDeletionUuid(entry)) {
      return { ok: false };
    }
    if (seen.has(entry)) {
      return { ok: false };
    }
    seen.add(entry);
    resultIds.push(entry);
  }
  if (record.selected_count !== resultIds.length) {
    return { ok: false };
  }
  if (resultIds.length > ACCOUNT_DELETION_PROFILE_MEDIA_STAGE_RUNNER_BATCH_SIZE) {
    return { ok: false };
  }
  return { ok: true, resultIds };
}

function boundedDetail(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9_]{1,80}$/.test(value)
    ? value
    : null;
}

export function shouldContinueProfileMediaExecutorResult(
  result: AccountDeletionProfileMediaObjectExecutorResult
): boolean {
  if (result.ok === true) {
    return (
      result.code === "deleted" ||
      result.code === "missing" ||
      result.code === "already_terminal"
    );
  }

  switch (result.code) {
    case "delete_authority_expired":
      return result.retryable === true;
    case "storage_existence_check_failed":
    case "storage_postdelete_verification_failed":
    case "storage_remove_failed":
      return result.retryable === true;
    case "claim_failed":
    case "authorize_failed": {
      const detail = boundedDetail(result.detail);
      if (!detail) {
        return false;
      }
      if (detail === "rpc_error") {
        return false;
      }
      if (PROFILE_MEDIA_CLAIM_AUTHORIZE_STOP_DETAILS.has(detail)) {
        return false;
      }
      if (PROFILE_MEDIA_CLAIM_AUTHORIZE_CONTINUE_DETAILS.has(detail)) {
        return true;
      }
      return false;
    }
    default:
      return false;
  }
}

export function disabledCodeFromExecutorResult(
  result: AccountDeletionProfileMediaObjectExecutorResult
): AccountDeletionProfileMediaStageTickCode | null {
  if (result.ok !== false) {
    return null;
  }
  if (result.code === "execution_disabled") {
    return "execution_disabled";
  }
  if (result.code === "profile_execution_disabled") {
    return "profile_execution_disabled";
  }
  if (result.code === "profile_storage_execution_disabled") {
    return "profile_storage_execution_disabled";
  }
  return null;
}

export const ACCOUNT_DELETION_PROFILE_MEDIA_STAGE_RUNNER_NOTE =
  "runAccountDeletionProfileMediaTick performs one bounded profile-media iteration. "
  + "Not wired to orchestrator, API, cron, or workers. Physical delete requires "
  + "global, profile, and storage execution flags to equal the exact string true.";
