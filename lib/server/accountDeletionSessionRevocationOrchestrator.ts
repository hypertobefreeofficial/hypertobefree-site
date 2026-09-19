import type { SupabaseClient } from "@supabase/supabase-js";
import {
  advanceAccountDeletionAttemptToSessionsPending,
  advanceAccountDeletionAttemptToSessionsRevoked,
  recordAccountDeletionSessionRevocationFailure,
  type AccountDeletionAttemptStageTransitionResult,
} from "./accountDeletionAttemptStageTransitions";
import {
  isValidSessionRevocationTargetUserId,
  revokeAccountDeletionTargetSessions,
} from "./accountDeletionSessionRevocation";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AccountDeletionTrustedSessionExecutionContext = {
  requestId: string;
  attemptId: string;
  targetUserId: string;
};

export type AccountDeletionSessionRevocationOrchestratorSuccessCode =
  | "sessions_revoked"
  | "already_sessions_revoked"
  | "later_stage_reached";

export type AccountDeletionSessionRevocationOrchestratorFailureCode =
  | "invalid_execution_context"
  | "attempt_not_found"
  | "attempt_not_active"
  | "request_not_in_progress"
  | "target_mismatch"
  | "stage_conflict"
  | "session_revocation_failed"
  | "failure_recording_failed"
  | "transition_failed";

export type AccountDeletionSessionRevocationOrchestratorResult =
  | {
      ok: true;
      code: AccountDeletionSessionRevocationOrchestratorSuccessCode;
      stage: string;
    }
  | {
      ok: false;
      code: AccountDeletionSessionRevocationOrchestratorFailureCode;
      retryable?: boolean;
    };

export type AccountDeletionSessionExecutionSnapshot = {
  attemptStage: string;
  attemptStatus: string;
  attemptTargetUserId: string;
  attemptRequestId: string;
  requestStatus: string;
};

const LATER_THAN_SESSION_REVOCATION_STAGES = new Set([
  "inventory",
  "database",
  "database_completed",
  "storage",
  "profile",
  "auth_pending",
  "auth",
  "finalize",
  "completed",
]);

const SESSION_REVOCATION_FAILURE_CODE = "auth_signout_failed" as const;
const SESSION_REVOCATION_FAILURE_FINGERPRINT = "auth_signout_failed" as const;

function isValidExecutionId(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function validateExecutionContext(
  context: AccountDeletionTrustedSessionExecutionContext
): AccountDeletionSessionRevocationOrchestratorFailureCode | null {
  if (
    !isValidExecutionId(context.requestId) ||
    !isValidExecutionId(context.attemptId) ||
    !isValidSessionRevocationTargetUserId(context.targetUserId)
  ) {
    return "invalid_execution_context";
  }
  return null;
}

function mapTransitionFailure(
  result: AccountDeletionAttemptStageTransitionResult
): AccountDeletionSessionRevocationOrchestratorFailureCode {
  switch (result.code) {
    case "attempt_not_found":
      return "attempt_not_found";
    case "attempt_not_active":
      return "attempt_not_active";
    case "request_not_in_progress":
      return "request_not_in_progress";
    case "target_mismatch":
    case "attempt_request_mismatch":
      return "target_mismatch";
    case "stage_conflict":
      return "stage_conflict";
    default:
      return "transition_failed";
  }
}

function parseRevokedTransition(
  result: AccountDeletionAttemptStageTransitionResult,
  context: AccountDeletionTrustedSessionExecutionContext
): AccountDeletionSessionRevocationOrchestratorResult | null {
  if (result.ok === false) {
    return { ok: false, code: mapTransitionFailure(result) };
  }

  if (
    result.requestId !== context.requestId ||
    result.attemptId !== context.attemptId ||
    result.stage !== "sessions_revoked"
  ) {
    return { ok: false, code: "transition_failed" };
  }

  return { ok: true, code: "sessions_revoked", stage: "sessions_revoked" };
}

export type AccountDeletionSessionRevocationOrchestratorDeps = {
  loadExecutionSnapshot: (
    context: AccountDeletionTrustedSessionExecutionContext
  ) => Promise<
    | { ok: true; snapshot: AccountDeletionSessionExecutionSnapshot }
    | { ok: false; code: AccountDeletionSessionRevocationOrchestratorFailureCode }
  >;
  advanceToSessionsPending: (
    context: AccountDeletionTrustedSessionExecutionContext
  ) => Promise<AccountDeletionAttemptStageTransitionResult>;
  advanceToSessionsRevoked: (
    context: AccountDeletionTrustedSessionExecutionContext
  ) => Promise<AccountDeletionAttemptStageTransitionResult>;
  recordSessionRevocationFailure: (
    context: AccountDeletionTrustedSessionExecutionContext
  ) => Promise<{ ok: true } | { ok: false }>;
  revokeTargetSessions: (
    context: AccountDeletionTrustedSessionExecutionContext
  ) => Promise<{ ok: true } | { ok: false }>;
};

export function createAccountDeletionSessionRevocationOrchestratorDeps(
  serviceRoleClient: SupabaseClient
): AccountDeletionSessionRevocationOrchestratorDeps {
  return {
    async loadExecutionSnapshot(context) {
      const { data: attemptRow, error: attemptError } = await serviceRoleClient
        .from("account_deletion_execution_attempts")
        .select("id, deletion_request_id, target_user_id, status, stage")
        .eq("id", context.attemptId)
        .maybeSingle();

      if (attemptError || !attemptRow) {
        return { ok: false, code: "attempt_not_found" };
      }

      const attempt = attemptRow as {
        id: string;
        deletion_request_id: string;
        target_user_id: string;
        status: string;
        stage: string;
      };

      const { data: requestRow, error: requestError } = await serviceRoleClient
        .from("account_deletion_requests")
        .select("status")
        .eq("id", context.requestId)
        .maybeSingle();

      if (requestError || !requestRow) {
        return { ok: false, code: "request_not_in_progress" };
      }

      return {
        ok: true,
        snapshot: {
          attemptStage: attempt.stage,
          attemptStatus: attempt.status,
          attemptTargetUserId: attempt.target_user_id,
          attemptRequestId: attempt.deletion_request_id,
          requestStatus: (requestRow as { status: string }).status,
        },
      };
    },
    advanceToSessionsPending(context) {
      return advanceAccountDeletionAttemptToSessionsPending({
        serviceRoleClient,
        requestId: context.requestId,
        attemptId: context.attemptId,
      });
    },
    advanceToSessionsRevoked(context) {
      return advanceAccountDeletionAttemptToSessionsRevoked({
        serviceRoleClient,
        requestId: context.requestId,
        attemptId: context.attemptId,
      });
    },
    async recordSessionRevocationFailure(context) {
      const recorded = await recordAccountDeletionSessionRevocationFailure({
        serviceRoleClient,
        requestId: context.requestId,
        attemptId: context.attemptId,
        errorCode: SESSION_REVOCATION_FAILURE_CODE,
        errorFingerprint: SESSION_REVOCATION_FAILURE_FINGERPRINT,
      });
      return recorded.ok ? { ok: true } : { ok: false };
    },
    async revokeTargetSessions(context) {
      const revoked = await revokeAccountDeletionTargetSessions({
        serviceRoleClient,
        targetUserId: context.targetUserId,
      });
      return revoked.ok ? { ok: true } : { ok: false };
    },
  };
}

async function ensureSessionsPendingStage(
  context: AccountDeletionTrustedSessionExecutionContext,
  stage: string,
  deps: AccountDeletionSessionRevocationOrchestratorDeps
): Promise<AccountDeletionSessionRevocationOrchestratorResult | { ok: true; atPending: true }> {
  if (stage === "sessions_pending") {
    return { ok: true, atPending: true };
  }

  if (stage !== "lock_acquired") {
    return { ok: false, code: "stage_conflict" };
  }

  const pending = await deps.advanceToSessionsPending(context);
  if (pending.ok === false) {
    return { ok: false, code: mapTransitionFailure(pending) };
  }

  if (pending.stage !== "sessions_pending") {
    return { ok: false, code: "transition_failed" };
  }

  return { ok: true, atPending: true };
}

/**
 * Session phase only: sessions_pending → global signOut → sessions_revoked.
 * Does not acquire locks, advance inventory, or run database deletion.
 */
export async function runAccountDeletionSessionRevocationPhase(options: {
  context: AccountDeletionTrustedSessionExecutionContext;
  deps: AccountDeletionSessionRevocationOrchestratorDeps;
}): Promise<AccountDeletionSessionRevocationOrchestratorResult> {
  const invalid = validateExecutionContext(options.context);
  if (invalid) {
    return { ok: false, code: invalid };
  }

  const loaded = await options.deps.loadExecutionSnapshot(options.context);
  if (loaded.ok === false) {
    return { ok: false, code: loaded.code };
  }

  const { snapshot } = loaded;

  if (snapshot.attemptRequestId !== options.context.requestId) {
    return { ok: false, code: "target_mismatch" };
  }

  if (snapshot.attemptTargetUserId !== options.context.targetUserId) {
    return { ok: false, code: "target_mismatch" };
  }

  if (snapshot.attemptStatus !== "active") {
    return { ok: false, code: "attempt_not_active" };
  }

  if (snapshot.requestStatus !== "deletion_in_progress") {
    return { ok: false, code: "request_not_in_progress" };
  }

  if (LATER_THAN_SESSION_REVOCATION_STAGES.has(snapshot.attemptStage)) {
    return {
      ok: true,
      code: "later_stage_reached",
      stage: snapshot.attemptStage,
    };
  }

  if (snapshot.attemptStage === "sessions_revoked") {
    return {
      ok: true,
      code: "already_sessions_revoked",
      stage: "sessions_revoked",
    };
  }

  const pendingReady = await ensureSessionsPendingStage(
    options.context,
    snapshot.attemptStage,
    options.deps
  );
  if (!("atPending" in pendingReady)) {
    return pendingReady;
  }

  const revoked = await options.deps.revokeTargetSessions(options.context);
  if (revoked.ok === false) {
    const recorded = await options.deps.recordSessionRevocationFailure(
      options.context
    );
    if (recorded.ok === false) {
      return { ok: false, code: "failure_recording_failed", retryable: true };
    }
    return {
      ok: false,
      code: "session_revocation_failed",
      retryable: true,
    };
  }

  const advanced = await options.deps.advanceToSessionsRevoked(options.context);
  const parsed = parseRevokedTransition(advanced, options.context);
  if (!parsed || parsed.ok === false) {
    if (parsed && parsed.ok === false) {
      return { ...parsed, retryable: true };
    }
    return { ok: false, code: "transition_failed", retryable: true };
  }

  return parsed;
}

export const ACCOUNT_DELETION_SESSION_REVOCATION_ORCHESTRATOR_DISCONNECTED_NOTE =
  "runAccountDeletionSessionRevocationPhase is not wired to accountDeletionExecuteHandler "
  + "until Phase 3B.2E. Global signOut does not replace DB/RLS stale-JWT write barriers.";

export const ACCOUNT_DELETION_STALE_JWT_SESSION_REVOCATION_NOTE =
  "auth.admin.signOut(global) invalidates refresh/session state but access JWTs may remain "
  + "valid until expiry. Deletion safety still requires current_user_account_write_blocked(), "
  + "shared write-freeze triggers, and service-role target guards while deletion_in_progress.";
