import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACCOUNT_DELETION_STATUS,
  normalizeLegacyDeletionStatus,
  validateAccountDeletionTransition,
  validateDeletionApprovalTarget,
  type AccountDeletionStatus,
} from "./accountDeletionLifecycle";

export type AccountDeletionAdminRequest = {
  id: string;
  user_id: string | null;
  email: string | null;
  reason: string | null;
  status: string | null;
  admin_notes: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  created_at: string | null;
};

export type AccountDeletionAdminActionFailureCode =
  | "invalid_transition"
  | "blocked_owner"
  | "profile_load_failed"
  | "database_error";

export type AccountDeletionAdminActionResult =
  | { ok: true; request: AccountDeletionAdminRequest; warnings?: string[] }
  | {
      ok: false;
      code: AccountDeletionAdminActionFailureCode;
      message: string;
      warnings?: string[];
    };

const ADMIN_REQUEST_COLUMNS =
  "id, user_id, email, reason, status, admin_notes, reviewed_at, reviewed_by, approved_at, approved_by, rejected_at, created_at";

function readStatus(
  status: string | null | undefined
): AccountDeletionStatus | null {
  return normalizeLegacyDeletionStatus(status);
}

export async function markAccountDeletionReviewing(
  client: SupabaseClient,
  request: AccountDeletionAdminRequest
): Promise<AccountDeletionAdminActionResult> {
  const currentStatus = readStatus(request.status);
  const nextStatus = ACCOUNT_DELETION_STATUS.REVIEWING;

  const transition = validateAccountDeletionTransition({
    from: currentStatus,
    to: nextStatus,
    actor: "admin",
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
      status: nextStatus,
      admin_notes:
        request.admin_notes ||
        "Account deletion request marked as reviewing by admin.",
    })
    .eq("id", request.id)
    .select(ADMIN_REQUEST_COLUMNS)
    .single();

  if (error || !data) {
    return {
      ok: false,
      code: "database_error",
      message: "Could not mark the deletion request as reviewing.",
    };
  }

  return { ok: true, request: data as AccountDeletionAdminRequest };
}

export async function rejectAccountDeletionRequest(
  client: SupabaseClient,
  request: AccountDeletionAdminRequest,
  adminUserId: string
): Promise<AccountDeletionAdminActionResult> {
  const currentStatus = readStatus(request.status);
  const nextStatus = ACCOUNT_DELETION_STATUS.REJECTED;

  const transition = validateAccountDeletionTransition({
    from: currentStatus,
    to: nextStatus,
    actor: "admin",
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
      status: nextStatus,
      rejected_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminUserId,
      admin_notes:
        request.admin_notes ||
        "Account deletion request rejected by admin. The account was not deleted.",
    })
    .eq("id", request.id)
    .select(ADMIN_REQUEST_COLUMNS)
    .single();

  if (error || !data) {
    return {
      ok: false,
      code: "database_error",
      message: "Could not reject the deletion request.",
    };
  }

  return { ok: true, request: data as AccountDeletionAdminRequest };
}

export async function approveAccountDeletionRequest(
  client: SupabaseClient,
  request: AccountDeletionAdminRequest,
  adminUserId: string
): Promise<AccountDeletionAdminActionResult> {
  const currentStatus = readStatus(request.status);
  const nextStatus = ACCOUNT_DELETION_STATUS.APPROVED;

  const transition = validateAccountDeletionTransition({
    from: currentStatus,
    to: nextStatus,
    actor: "admin",
  });

  if (transition.ok === false) {
    return {
      ok: false,
      code: "invalid_transition",
      message: transition.message,
    };
  }

  if (!request.user_id) {
    return {
      ok: false,
      code: "profile_load_failed",
      message: "Cannot approve a deletion request without a linked user id.",
    };
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("is_owner, is_admin")
    .eq("id", request.user_id)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false,
      code: "profile_load_failed",
      message: "Could not verify the deletion target profile.",
    };
  }

  const approvalTarget = validateDeletionApprovalTarget(
    profile as { is_owner: boolean; is_admin: boolean } | null
  );

  if (approvalTarget.ok === false) {
    return {
      ok: false,
      code: "blocked_owner",
      message: approvalTarget.message,
    };
  }

  const { data, error } = await client
    .from("account_deletion_requests")
    .update({
      status: nextStatus,
      approved_at: new Date().toISOString(),
      approved_by: adminUserId,
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminUserId,
      admin_notes:
        request.admin_notes ||
        "Account deletion request approved by admin. Permanent deletion has not run yet.",
    })
    .eq("id", request.id)
    .select(ADMIN_REQUEST_COLUMNS)
    .single();

  if (error || !data) {
    return {
      ok: false,
      code: "database_error",
      message: "Could not approve the deletion request.",
    };
  }

  return {
    ok: true,
    request: data as AccountDeletionAdminRequest,
    warnings:
      approvalTarget.warnings.length > 0 ? approvalTarget.warnings : undefined,
  };
}
