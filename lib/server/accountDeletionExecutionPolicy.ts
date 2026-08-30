/**
 * Permanent account deletion execution policy (Phase 4C.7B.1C skeleton).
 * Declarative only — no destructive execution in this phase.
 */

export const ACCOUNT_DELETION_EXECUTION_ENV_FLAG =
  "HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED" as const;

export type AccountDeletionExecutionErrorCode =
  | "unauthorized"
  | "forbidden"
  | "mfa_step_up_required"
  | "execution_disabled"
  | "request_not_found"
  | "request_not_approved"
  | "already_deleted"
  | "execution_in_progress"
  | "target_not_found"
  | "blocked_owner"
  | "blocked_admin"
  | "manifest_failed"
  | "manifest_blocked"
  | "rate_limited"
  | "internal_error";

export type AccountDeletionExecutionStage =
  | "authenticate_admin"
  | "verify_admin_aal2"
  | "load_request"
  | "verify_status"
  | "verify_target"
  | "verify_target_not_privileged"
  | "build_manifest"
  | "validate_manifest"
  | "prepare_execution"
  | "acquire_lock"
  | "cleanup_storage"
  | "mutate_database"
  | "revoke_sessions"
  | "delete_auth_user"
  | "finalize_deleted";

export type AccountDeletionExecutionStageStatus =
  | "pending"
  | "completed"
  | "skipped"
  | "NOT_IMPLEMENTED";

export const ACCOUNT_DELETION_EXECUTION_AUDIT_ACTION =
  "account_deletion_execution" as const;

export const BLOCKED_OWNER_ACCOUNT_CODE = "BLOCKED_OWNER_ACCOUNT" as const;

export const BLOCKED_ADMIN_ACCOUNT_CODE =
  "BLOCKED_ADMIN_ACCOUNT_REQUIRES_POLICY" as const;

export type AccountDeletionExecutionAuditEvent = {
  action: typeof ACCOUNT_DELETION_EXECUTION_AUDIT_ACTION;
  actor_user_id: string;
  target_user_id: string | null;
  request_id: string;
  result: string;
  metadata: {
    request_status: string | null;
    stage_reached: AccountDeletionExecutionStage;
  };
};

export function isAccountDeletionExecutionEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env[ACCOUNT_DELETION_EXECUTION_ENV_FLAG] === "true";
}

export function buildAccountDeletionExecutionAuditEvent(input: {
  actorUserId: string;
  targetUserId: string | null;
  requestId: string;
  result: string;
  requestStatus: string | null;
  stageReached: AccountDeletionExecutionStage;
}): AccountDeletionExecutionAuditEvent {
  return {
    action: ACCOUNT_DELETION_EXECUTION_AUDIT_ACTION,
    actor_user_id: input.actorUserId,
    target_user_id: input.targetUserId,
    request_id: input.requestId,
    result: input.result,
    metadata: {
      request_status: input.requestStatus,
      stage_reached: input.stageReached,
    },
  };
}

export function sanitizeAccountDeletionExecutionErrorMessage(
  code: AccountDeletionExecutionErrorCode
): string {
  switch (code) {
    case "unauthorized":
      return "Please sign in as an admin.";
    case "forbidden":
      return "Admin access is required.";
    case "mfa_step_up_required":
      return "Verify your authenticator app before executing account deletion.";
    case "execution_disabled":
      return "account_deletion_execution_disabled";
    case "request_not_found":
      return "That account deletion request could not be found.";
    case "request_not_approved":
      return "This deletion request is not approved for execution.";
    case "already_deleted":
      return "This account deletion request has already completed.";
    case "execution_in_progress":
      return "Account deletion is already in progress for this request.";
    case "target_not_found":
      return "The deletion target identity could not be resolved.";
    case "blocked_owner":
      return "Owner accounts cannot be permanently deleted.";
    case "blocked_admin":
      return "Admin accounts require explicit policy approval before deletion.";
    case "manifest_failed":
      return "Could not build the deletion manifest for this request.";
    case "manifest_blocked":
      return "The deletion manifest blocked execution for this request.";
    case "rate_limited":
      return "Too many execution attempts. Please wait and try again.";
    case "internal_error":
      return "Account deletion execution is unavailable right now.";
    default:
      return "Account deletion execution is unavailable right now.";
  }
}

export function httpStatusForAccountDeletionExecutionError(
  code: AccountDeletionExecutionErrorCode
): number {
  switch (code) {
    case "unauthorized":
      return 401;
    case "forbidden":
    case "mfa_step_up_required":
    case "blocked_owner":
    case "blocked_admin":
    case "manifest_blocked":
      return 403;
    case "request_not_found":
    case "target_not_found":
      return 404;
    case "request_not_approved":
      return 409;
    case "execution_in_progress":
      return 409;
    case "rate_limited":
      return 429;
    case "execution_disabled":
      return 503;
    case "already_deleted":
      return 200;
    case "manifest_failed":
    case "internal_error":
    default:
      return 503;
  }
}
