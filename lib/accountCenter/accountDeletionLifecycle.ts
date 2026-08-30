/**
 * Account deletion request lifecycle (Phase 4C.7B.1B).
 * Status transitions only — no destructive execution.
 */

export const ACCOUNT_DELETION_STATUS = {
  SUBMITTED: "submitted",
  REVIEWING: "reviewing",
  APPROVED: "approved",
  DELETION_IN_PROGRESS: "deletion_in_progress",
  DELETED: "deleted",
  FAILED: "failed",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
  LEGACY_COMPLETED: "legacy_completed",
} as const;

export type AccountDeletionStatus =
  (typeof ACCOUNT_DELETION_STATUS)[keyof typeof ACCOUNT_DELETION_STATUS];

export const ACCOUNT_DELETION_TERMINAL_STATUSES = [
  ACCOUNT_DELETION_STATUS.DELETED,
  ACCOUNT_DELETION_STATUS.REJECTED,
  ACCOUNT_DELETION_STATUS.CANCELLED,
  ACCOUNT_DELETION_STATUS.LEGACY_COMPLETED,
] as const satisfies readonly AccountDeletionStatus[];

export const ACCOUNT_DELETION_USER_CANCELLABLE_STATUSES = [
  ACCOUNT_DELETION_STATUS.SUBMITTED,
  ACCOUNT_DELETION_STATUS.REVIEWING,
] as const satisfies readonly AccountDeletionStatus[];

/** Blocks a new user submission while any of these are open. */
export const ACCOUNT_DELETION_OPEN_STATUSES = [
  ACCOUNT_DELETION_STATUS.SUBMITTED,
  ACCOUNT_DELETION_STATUS.REVIEWING,
  ACCOUNT_DELETION_STATUS.APPROVED,
  ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS,
  ACCOUNT_DELETION_STATUS.FAILED,
] as const satisfies readonly AccountDeletionStatus[];

export const ACCOUNT_DELETION_DRY_RUN_STATUSES = [
  ACCOUNT_DELETION_STATUS.SUBMITTED,
  ACCOUNT_DELETION_STATUS.REVIEWING,
  ACCOUNT_DELETION_STATUS.APPROVED,
  ACCOUNT_DELETION_STATUS.FAILED,
  ACCOUNT_DELETION_STATUS.LEGACY_COMPLETED,
] as const satisfies readonly AccountDeletionStatus[];

/** Transitional DB CHECK values retained during zero-downtime rollout. */
export const ACCOUNT_DELETION_TRANSITIONAL_DB_STATUSES = [
  ...Object.values(ACCOUNT_DELETION_STATUS),
  "completed",
] as const;

export const LEGACY_COMPLETED_RAW_STATUS = "completed" as const;

export const ACCOUNT_DELETION_ADMIN_REVIEW_STATUSES = [
  ACCOUNT_DELETION_STATUS.SUBMITTED,
  ACCOUNT_DELETION_STATUS.REVIEWING,
] as const satisfies readonly AccountDeletionStatus[];

export const LEGACY_COMPLETED_STATUS_NOTE =
  "Legacy administrative closure (completed or legacy_completed) — the account was not permanently deleted.";

export const DELETED_STATUS_NOTE =
  "Status 'deleted' means permanent account deletion was completed.";

const ALLOWED_TRANSITIONS: Record<
  AccountDeletionStatus,
  readonly AccountDeletionStatus[]
> = {
  [ACCOUNT_DELETION_STATUS.SUBMITTED]: [
    ACCOUNT_DELETION_STATUS.REVIEWING,
    ACCOUNT_DELETION_STATUS.REJECTED,
    ACCOUNT_DELETION_STATUS.CANCELLED,
  ],
  [ACCOUNT_DELETION_STATUS.REVIEWING]: [
    ACCOUNT_DELETION_STATUS.APPROVED,
    ACCOUNT_DELETION_STATUS.REJECTED,
    ACCOUNT_DELETION_STATUS.CANCELLED,
  ],
  [ACCOUNT_DELETION_STATUS.APPROVED]: [
    ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS,
  ],
  [ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS]: [
    ACCOUNT_DELETION_STATUS.DELETED,
    ACCOUNT_DELETION_STATUS.FAILED,
  ],
  [ACCOUNT_DELETION_STATUS.FAILED]: [
    ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS,
  ],
  [ACCOUNT_DELETION_STATUS.DELETED]: [],
  [ACCOUNT_DELETION_STATUS.REJECTED]: [],
  [ACCOUNT_DELETION_STATUS.CANCELLED]: [],
  [ACCOUNT_DELETION_STATUS.LEGACY_COMPLETED]: [],
};

export type AccountDeletionTransitionActor = "admin" | "user" | "system";

export type AccountDeletionTransitionValidation =
  | { ok: true }
  | { ok: false; code: string; message: string };

export function isLegacyAdministrativeClosureStatus(
  status: string | null | undefined
): boolean {
  return normalizeLegacyDeletionStatus(status) === ACCOUNT_DELETION_STATUS.LEGACY_COMPLETED;
}

export function isAccountDeletionStatus(
  value: string | null | undefined
): value is AccountDeletionStatus {
  if (!value) {
    return false;
  }

  return Object.values(ACCOUNT_DELETION_STATUS).includes(
    value as AccountDeletionStatus
  );
}

export function normalizeLegacyDeletionStatus(
  status: string | null | undefined
): AccountDeletionStatus | null {
  if (!status) {
    return null;
  }

  if (status === "completed") {
    return ACCOUNT_DELETION_STATUS.LEGACY_COMPLETED;
  }

  return isAccountDeletionStatus(status) ? status : null;
}

export function canTransitionAccountDeletionStatus(
  from: AccountDeletionStatus,
  to: AccountDeletionStatus
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function validateAccountDeletionTransition(options: {
  from: AccountDeletionStatus | null;
  to: AccountDeletionStatus;
  actor: AccountDeletionTransitionActor;
}): AccountDeletionTransitionValidation {
  const { from, to, actor } = options;

  if (!from) {
    return {
      ok: false,
      code: "missing_current_status",
      message: "The current deletion request status is missing.",
    };
  }

  if (from === to) {
    return {
      ok: false,
      code: "noop_transition",
      message: "That status change is not needed.",
    };
  }

  if (!canTransitionAccountDeletionStatus(from, to)) {
    return {
      ok: false,
      code: "invalid_transition",
      message: `Cannot move a deletion request from '${from}' to '${to}'.`,
    };
  }

  if (actor === "user") {
    if (to !== ACCOUNT_DELETION_STATUS.CANCELLED) {
      return {
        ok: false,
        code: "forbidden_actor",
        message: "You can only cancel your own deletion request.",
      };
    }

    if (
      !ACCOUNT_DELETION_USER_CANCELLABLE_STATUSES.includes(
        from as (typeof ACCOUNT_DELETION_USER_CANCELLABLE_STATUSES)[number]
      )
    ) {
      return {
        ok: false,
        code: "not_cancellable",
        message: "This deletion request can no longer be cancelled.",
      };
    }
  }

  if (actor === "admin") {
    const adminAllowed: Partial<
      Record<AccountDeletionStatus, AccountDeletionStatus[]>
    > = {
      [ACCOUNT_DELETION_STATUS.SUBMITTED]: [
        ACCOUNT_DELETION_STATUS.REVIEWING,
        ACCOUNT_DELETION_STATUS.REJECTED,
      ],
      [ACCOUNT_DELETION_STATUS.REVIEWING]: [
        ACCOUNT_DELETION_STATUS.APPROVED,
        ACCOUNT_DELETION_STATUS.REJECTED,
      ],
      [ACCOUNT_DELETION_STATUS.FAILED]: [
        ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS,
      ],
    };

    const allowed = adminAllowed[from] ?? [];
    if (!allowed.includes(to)) {
      return {
        ok: false,
        code: "forbidden_admin_transition",
        message: `Admins cannot move a deletion request from '${from}' to '${to}' in this phase.`,
      };
    }
  }

  if (actor === "system") {
    const systemAllowed: Partial<
      Record<AccountDeletionStatus, AccountDeletionStatus[]>
    > = {
      [ACCOUNT_DELETION_STATUS.APPROVED]: [
        ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS,
      ],
      [ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS]: [
        ACCOUNT_DELETION_STATUS.DELETED,
        ACCOUNT_DELETION_STATUS.FAILED,
      ],
      [ACCOUNT_DELETION_STATUS.FAILED]: [
        ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS,
      ],
    };

    const allowed = systemAllowed[from] ?? [];
    if (!allowed.includes(to)) {
      return {
        ok: false,
        code: "forbidden_system_transition",
        message: `System cannot move a deletion request from '${from}' to '${to}'.`,
      };
    }
  }

  return { ok: true };
}

export type DeletionApprovalTargetProfile = {
  is_owner: boolean;
  is_admin: boolean;
};

export type DeletionApprovalTargetValidation =
  | { ok: true; warnings: string[] }
  | { ok: false; code: "blocked_owner"; message: string };

export function validateDeletionApprovalTarget(
  profile: DeletionApprovalTargetProfile | null
): DeletionApprovalTargetValidation {
  if (profile?.is_owner) {
    return {
      ok: false,
      code: "blocked_owner",
      message:
        "Owner accounts cannot be approved for permanent deletion. This request must remain blocked.",
    };
  }

  const warnings: string[] = [];
  if (profile?.is_admin) {
    warnings.push(
      "Target account is marked admin — confirm policy before approving permanent deletion."
    );
  }

  return { ok: true, warnings };
}

export function getAccountDeletionStatusUserLabel(
  status: string | null | undefined
): string {
  const normalized = normalizeLegacyDeletionStatus(status);

  switch (normalized) {
    case ACCOUNT_DELETION_STATUS.SUBMITTED:
      return "Submitted — waiting for HTBF review";
    case ACCOUNT_DELETION_STATUS.REVIEWING:
      return "Under review";
    case ACCOUNT_DELETION_STATUS.APPROVED:
      return "Approved — your account has not been deleted yet";
    case ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS:
      return "Deletion in progress";
    case ACCOUNT_DELETION_STATUS.DELETED:
      return "Deleted";
    case ACCOUNT_DELETION_STATUS.FAILED:
      return "Deletion failed — HTBF will retry after review";
    case ACCOUNT_DELETION_STATUS.REJECTED:
      return "Rejected";
    case ACCOUNT_DELETION_STATUS.CANCELLED:
      return "Cancelled";
    case ACCOUNT_DELETION_STATUS.LEGACY_COMPLETED:
      return "Previously closed by admin — account was not deleted";
    default:
      return "Unknown";
  }
}

export function getAccountDeletionStatusAdminLabel(
  status: string | null | undefined
): string {
  const normalized = normalizeLegacyDeletionStatus(status);

  switch (normalized) {
    case ACCOUNT_DELETION_STATUS.SUBMITTED:
      return "Submitted";
    case ACCOUNT_DELETION_STATUS.REVIEWING:
      return "Reviewing";
    case ACCOUNT_DELETION_STATUS.APPROVED:
      return "Approved — not yet deleted";
    case ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS:
      return "Deletion in progress";
    case ACCOUNT_DELETION_STATUS.DELETED:
      return "Deleted";
    case ACCOUNT_DELETION_STATUS.FAILED:
      return "Failed";
    case ACCOUNT_DELETION_STATUS.REJECTED:
      return "Rejected";
    case ACCOUNT_DELETION_STATUS.CANCELLED:
      return "Cancelled";
    case ACCOUNT_DELETION_STATUS.LEGACY_COMPLETED:
      return "Legacy closed — not deleted";
    default:
      return "Unknown";
  }
}

export function isAccountDeletionDryRunAllowedStatus(
  status: string | null | undefined
): boolean {
  const normalized = normalizeLegacyDeletionStatus(status);
  if (!normalized) {
    return false;
  }

  return ACCOUNT_DELETION_DRY_RUN_STATUSES.includes(
    normalized as (typeof ACCOUNT_DELETION_DRY_RUN_STATUSES)[number]
  );
}

export function describeAccountDeletionDryRunStatus(
  status: string | null | undefined
): string | null {
  const normalized = normalizeLegacyDeletionStatus(status);

  if (normalized === ACCOUNT_DELETION_STATUS.LEGACY_COMPLETED) {
    return LEGACY_COMPLETED_STATUS_NOTE;
  }

  if (normalized === ACCOUNT_DELETION_STATUS.DELETED) {
    return DELETED_STATUS_NOTE;
  }

  if (normalized === ACCOUNT_DELETION_STATUS.APPROVED) {
    return "Approved for deletion — permanent deletion has not run yet.";
  }

  if (normalized === ACCOUNT_DELETION_STATUS.FAILED) {
    return "Deletion failed — dry-run remains available for replanning before retry.";
  }

  return null;
}

export function resolveDeletionRequestTargetUserId(options: {
  user_id: string | null;
  target_user_id_snapshot: string | null;
}): string | null {
  return options.user_id ?? options.target_user_id_snapshot;
}
