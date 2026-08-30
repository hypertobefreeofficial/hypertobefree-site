import type { SupabaseClient } from "@supabase/supabase-js";
import { assertAal2ForSensitiveAction } from "../auth/mfaStepUp";
import {
  ACCOUNT_DELETION_OPEN_STATUSES,
  ACCOUNT_DELETION_STATUS,
  ACCOUNT_DELETION_USER_CANCELLABLE_STATUSES,
  getAccountDeletionStatusUserLabel,
  isLegacyAdministrativeClosureStatus,
  normalizeLegacyDeletionStatus,
  validateAccountDeletionTransition,
  type AccountDeletionStatus,
} from "./accountDeletionLifecycle";

export type AccountDeletionRequest = {
  id: string;
  user_id: string | null;
  email: string | null;
  reason: string | null;
  status: string | null;
  created_at: string | null;
  cancelled_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  target_user_id_snapshot?: string | null;
  target_username_snapshot?: string | null;
};

export const ACTIVE_ACCOUNT_DELETION_STATUSES = [
  ...ACCOUNT_DELETION_OPEN_STATUSES,
] as const;

export const ACCOUNT_DELETION_SUBMITTED_STATUS = ACCOUNT_DELETION_STATUS.SUBMITTED;

export type AccountDeletionSubmissionInput = {
  userId: string;
  email: string | null;
  username?: string | null;
  reason?: string | null;
};

export type AccountDeletionSubmissionFailureCode =
  | "not_authenticated"
  | "user_mismatch"
  | "already_requested"
  | "database_error"
  | "insufficient_aal"
  | "factor_not_found"
  | "auth_error";

export type AccountDeletionCancellationFailureCode =
  | "not_authenticated"
  | "not_found"
  | "invalid_transition"
  | "database_error";

export type AccountDeletionSubmissionResult =
  | { ok: true; request: AccountDeletionRequest }
  | {
      ok: false;
      code: AccountDeletionSubmissionFailureCode;
      message: string;
    };

export type AccountDeletionCancellationResult =
  | { ok: true; request: AccountDeletionRequest }
  | {
      ok: false;
      code: AccountDeletionCancellationFailureCode;
      message: string;
    };

export type AccountDeletionQueryResult = {
  request: AccountDeletionRequest | null;
  error: unknown | null;
};

export const ACCOUNT_DELETION_REQUEST_COLUMNS =
  "id, user_id, email, reason, status, created_at, cancelled_at, approved_at, rejected_at, target_user_id_snapshot, target_username_snapshot";

export function buildAccountDeletionInsertRow(
  input: AccountDeletionSubmissionInput
) {
  return {
    user_id: input.userId,
    email: readNullableTrimmedString(input.email),
    reason: readNullableTrimmedString(input.reason ?? null),
    status: ACCOUNT_DELETION_SUBMITTED_STATUS,
    target_user_id_snapshot: input.userId,
    target_username_snapshot: readNullableTrimmedString(input.username ?? null),
  };
}

export function validateAccountDeletionSubmission(input: {
  authenticatedUserId: string | null | undefined;
  requestedUserId: string;
  openRequest: AccountDeletionRequest | null;
}): AccountDeletionSubmissionResult | { ok: true } {
  if (!input.authenticatedUserId) {
    return {
      ok: false,
      code: "not_authenticated",
      message: "Please sign in again before requesting account deletion.",
    };
  }

  if (input.authenticatedUserId !== input.requestedUserId) {
    return {
      ok: false,
      code: "user_mismatch",
      message: "Please sign in again before requesting account deletion.",
    };
  }

  if (input.openRequest) {
    return {
      ok: false,
      code: "already_requested",
      message: "Your account deletion request is already submitted.",
    };
  }

  return { ok: true };
}

export function formatAccountDeletionDatabaseError(): string {
  return "Could not submit your account deletion request right now. Please try again.";
}

export function formatAccountDeletionCancellationError(): string {
  return "Could not cancel your account deletion request right now. Please try again.";
}

export function isOpenAccountDeletionRequest(
  request: AccountDeletionRequest | null | undefined
): request is AccountDeletionRequest {
  if (!request) {
    return false;
  }

  if (isLegacyAdministrativeClosureStatus(request.status)) {
    return false;
  }

  const normalized = normalizeLegacyDeletionStatus(request.status);
  if (!normalized) {
    return false;
  }

  return ACTIVE_ACCOUNT_DELETION_STATUSES.includes(
    normalized as (typeof ACTIVE_ACCOUNT_DELETION_STATUSES)[number]
  );
}

export function isActiveAccountDeletionRequest(
  request: AccountDeletionRequest | null | undefined
): request is AccountDeletionRequest {
  return isOpenAccountDeletionRequest(request);
}

export function canUserCancelAccountDeletionRequest(
  request: AccountDeletionRequest | null | undefined
): boolean {
  const normalized = normalizeLegacyDeletionStatus(request?.status);
  if (!normalized) {
    return false;
  }

  return ACCOUNT_DELETION_USER_CANCELLABLE_STATUSES.includes(
    normalized as (typeof ACCOUNT_DELETION_USER_CANCELLABLE_STATUSES)[number]
  );
}

export function getAccountDeletionRequestUserStatusLabel(
  request: AccountDeletionRequest | null | undefined
): string {
  return getAccountDeletionStatusUserLabel(request?.status);
}

export function parseAccountDeletionRequest(
  value: unknown
): AccountDeletionRequest | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (typeof candidate.id !== "string") {
    return null;
  }

  return {
    id: candidate.id,
    user_id:
      typeof candidate.user_id === "string" ? candidate.user_id : null,
    email: readNullableTrimmedString(candidate.email as string | null),
    reason: readNullableTrimmedString(candidate.reason as string | null),
    status:
      typeof candidate.status === "string" ? candidate.status : null,
    created_at:
      typeof candidate.created_at === "string" ? candidate.created_at : null,
    cancelled_at:
      typeof candidate.cancelled_at === "string" ? candidate.cancelled_at : null,
    approved_at:
      typeof candidate.approved_at === "string" ? candidate.approved_at : null,
    rejected_at:
      typeof candidate.rejected_at === "string" ? candidate.rejected_at : null,
    target_user_id_snapshot:
      typeof candidate.target_user_id_snapshot === "string"
        ? candidate.target_user_id_snapshot
        : null,
    target_username_snapshot:
      typeof candidate.target_username_snapshot === "string"
        ? candidate.target_username_snapshot
        : null,
  };
}

export async function fetchOpenAccountDeletionRequest(
  client: SupabaseClient,
  userId: string
): Promise<AccountDeletionQueryResult> {
  const { data, error } = await client
    .from("account_deletion_requests")
    .select(ACCOUNT_DELETION_REQUEST_COLUMNS)
    .eq("user_id", userId)
    .in("status", [...ACTIVE_ACCOUNT_DELETION_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    request: parseAccountDeletionRequest(data),
    error,
  };
}

export async function fetchActiveAccountDeletionRequest(
  client: SupabaseClient,
  userId: string
): Promise<AccountDeletionQueryResult> {
  return fetchOpenAccountDeletionRequest(client, userId);
}

export async function submitAccountDeletionRequest(
  client: SupabaseClient,
  input: {
    authenticatedUserId: string | null | undefined;
    submission: AccountDeletionSubmissionInput;
    openRequest?: AccountDeletionRequest | null;
  }
): Promise<AccountDeletionSubmissionResult> {
  const validation = validateAccountDeletionSubmission({
    authenticatedUserId: input.authenticatedUserId,
    requestedUserId: input.submission.userId,
    openRequest: input.openRequest ?? null,
  });

  if (validation.ok === false) {
    return validation;
  }

  const aalGate = await assertAal2ForSensitiveAction(client);
  if (aalGate.ok === false) {
    const code: AccountDeletionSubmissionFailureCode =
      aalGate.code === "not_authenticated"
        ? "not_authenticated"
        : aalGate.code === "insufficient_aal"
          ? "insufficient_aal"
          : aalGate.code === "factor_not_found"
            ? "factor_not_found"
            : "auth_error";

    return {
      ok: false,
      code,
      message: aalGate.message,
    };
  }

  const { data, error } = await client
    .from("account_deletion_requests")
    .insert(buildAccountDeletionInsertRow(input.submission))
    .select(ACCOUNT_DELETION_REQUEST_COLUMNS)
    .single();

  if (error) {
    return {
      ok: false,
      code: "database_error",
      message: formatAccountDeletionDatabaseError(),
    };
  }

  const request = parseAccountDeletionRequest(data);

  if (!request) {
    return {
      ok: false,
      code: "database_error",
      message: formatAccountDeletionDatabaseError(),
    };
  }

  return { ok: true, request };
}

export async function cancelAccountDeletionRequest(
  client: SupabaseClient,
  input: {
    authenticatedUserId: string | null | undefined;
    request: AccountDeletionRequest;
  }
): Promise<AccountDeletionCancellationResult> {
  if (!input.authenticatedUserId) {
    return {
      ok: false,
      code: "not_authenticated",
      message: "Please sign in again before cancelling your deletion request.",
    };
  }

  if (input.request.user_id !== input.authenticatedUserId) {
    return {
      ok: false,
      code: "not_found",
      message: "That account deletion request could not be found.",
    };
  }

  const currentStatus = normalizeLegacyDeletionStatus(
    input.request.status
  ) as AccountDeletionStatus | null;

  const transition = validateAccountDeletionTransition({
    from: currentStatus,
    to: ACCOUNT_DELETION_STATUS.CANCELLED,
    actor: "user",
  });

  if (transition.ok === false) {
    return {
      ok: false,
      code: "invalid_transition",
      message: transition.message,
    };
  }

  const { data, error } = await client
    .from("account_deletion_requests")
    .update({
      status: ACCOUNT_DELETION_STATUS.CANCELLED,
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", input.request.id)
    .select(ACCOUNT_DELETION_REQUEST_COLUMNS)
    .single();

  if (error) {
    return {
      ok: false,
      code: "database_error",
      message: formatAccountDeletionCancellationError(),
    };
  }

  const request = parseAccountDeletionRequest(data);
  if (!request) {
    return {
      ok: false,
      code: "database_error",
      message: formatAccountDeletionCancellationError(),
    };
  }

  return { ok: true, request };
}

function readNullableTrimmedString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
