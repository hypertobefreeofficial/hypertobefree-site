import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountDeletionRequest = {
  id: string;
  user_id: string;
  email: string | null;
  reason: string | null;
  status: string | null;
  created_at: string | null;
};

export const ACTIVE_ACCOUNT_DELETION_STATUSES = ["submitted", "reviewing"] as const;

export const ACCOUNT_DELETION_SUBMITTED_STATUS = "submitted";

export type AccountDeletionSubmissionInput = {
  userId: string;
  email: string | null;
  reason?: string | null;
};

export type AccountDeletionSubmissionFailureCode =
  | "not_authenticated"
  | "user_mismatch"
  | "already_requested"
  | "database_error";

export type AccountDeletionSubmissionResult =
  | { ok: true; request: AccountDeletionRequest }
  | {
      ok: false;
      code: AccountDeletionSubmissionFailureCode;
      message: string;
    };

export type AccountDeletionQueryResult = {
  request: AccountDeletionRequest | null;
  error: unknown | null;
};

const ACCOUNT_DELETION_REQUEST_COLUMNS =
  "id, user_id, email, reason, status, created_at";

export function buildAccountDeletionInsertRow(
  input: AccountDeletionSubmissionInput
) {
  return {
    user_id: input.userId,
    email: readNullableTrimmedString(input.email),
    reason: readNullableTrimmedString(input.reason ?? null),
    status: ACCOUNT_DELETION_SUBMITTED_STATUS,
  };
}

export function validateAccountDeletionSubmission(input: {
  authenticatedUserId: string | null | undefined;
  requestedUserId: string;
  activeRequest: AccountDeletionRequest | null;
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

  if (input.activeRequest) {
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

export function isActiveAccountDeletionRequest(
  request: AccountDeletionRequest | null | undefined
): request is AccountDeletionRequest {
  if (!request) {
    return false;
  }

  return ACTIVE_ACCOUNT_DELETION_STATUSES.includes(
    (request.status ?? "") as (typeof ACTIVE_ACCOUNT_DELETION_STATUSES)[number]
  );
}

export function parseAccountDeletionRequest(
  value: unknown
): AccountDeletionRequest | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.user_id !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    user_id: candidate.user_id,
    email: readNullableTrimmedString(candidate.email as string | null),
    reason: readNullableTrimmedString(candidate.reason as string | null),
    status:
      typeof candidate.status === "string" ? candidate.status : null,
    created_at:
      typeof candidate.created_at === "string" ? candidate.created_at : null,
  };
}

export async function fetchActiveAccountDeletionRequest(
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

export async function submitAccountDeletionRequest(
  client: SupabaseClient,
  input: {
    authenticatedUserId: string | null | undefined;
    submission: AccountDeletionSubmissionInput;
    activeRequest?: AccountDeletionRequest | null;
  }
): Promise<AccountDeletionSubmissionResult> {
  const validation = validateAccountDeletionSubmission({
    authenticatedUserId: input.authenticatedUserId,
    requestedUserId: input.submission.userId,
    activeRequest: input.activeRequest ?? null,
  });

  if (validation.ok === false) {
    return validation;
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

function readNullableTrimmedString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
