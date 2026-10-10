/**
 * Storage stage runner policy (Phase 4C.7B.1E.2C.3B.3F.1).
 */

export const ACCOUNT_DELETION_STORAGE_STAGE_RUNNER_BATCH_SIZE = 50;

export type AccountDeletionStorageProgressCounts = {
  total: number;
  pending: number;
  failed_retryable: number;
  deleting: number;
  deleted: number;
  missing: number;
  preserved: number;
  deferred_profile: number;
  blocked: number;
  blocked_on_hold: number;
  failed_terminal: number;
};

export type AccountDeletionStorageStageTickCode =
  | "precondition_failed"
  | "disabled"
  | "blocked"
  | "in_progress"
  | "storage_completed"
  | "already_completed";

export function emptyStorageProgressCounts(): AccountDeletionStorageProgressCounts {
  return {
    total: 0,
    pending: 0,
    failed_retryable: 0,
    deleting: 0,
    deleted: 0,
    missing: 0,
    preserved: 0,
    deferred_profile: 0,
    blocked: 0,
    blocked_on_hold: 0,
    failed_terminal: 0,
  };
}

export function parseStorageProgressCounts(
  raw: Record<string, unknown> | null | undefined
): AccountDeletionStorageProgressCounts {
  const base = emptyStorageProgressCounts();
  if (!raw) {
    return base;
  }
  const num = (key: keyof AccountDeletionStorageProgressCounts) => {
    const value = raw[key];
    return typeof value === "number" ? value : Number(value ?? 0) || 0;
  };
  return {
    total: num("total"),
    pending: num("pending"),
    failed_retryable: num("failed_retryable"),
    deleting: num("deleting"),
    deleted: num("deleted"),
    missing: num("missing"),
    preserved: num("preserved"),
    deferred_profile: num("deferred_profile"),
    blocked: num("blocked"),
    blocked_on_hold: num("blocked_on_hold"),
    failed_terminal: num("failed_terminal"),
  };
}

export function storageProgressHasHardBlockers(
  counts: AccountDeletionStorageProgressCounts
): boolean {
  return (
    counts.blocked > 0 ||
    counts.blocked_on_hold > 0 ||
    counts.failed_terminal > 0
  );
}

export function storageProgressHasActionableDeleteWork(
  counts: AccountDeletionStorageProgressCounts
): boolean {
  return counts.pending > 0 || counts.failed_retryable > 0;
}

export function storageProgressHasInProgressWork(
  counts: AccountDeletionStorageProgressCounts
): boolean {
  return storageProgressHasActionableDeleteWork(counts) || counts.deleting > 0;
}

export const ACCOUNT_DELETION_STORAGE_STAGE_RUNNER_NOTE =
  "runAccountDeletionStorageStageTick performs one bounded Storage stage iteration. "
  + "Not wired to orchestrator, API, cron, or workers. Physical delete requires dual execution flags.";
