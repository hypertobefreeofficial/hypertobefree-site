import type { SupabaseClient } from "@supabase/supabase-js";
import {
  acquireAccountDeletionExecutionLock,
  type AccountDeletionAcquisitionResult,
} from "./accountDeletionAcquisition";
import {
  advanceAccountDeletionAttemptToInventory,
  type AccountDeletionAttemptStageTransitionResult,
} from "./accountDeletionAttemptStageTransitions";
import { executeAccountDeletionNondestructiveDatabaseStage } from "./accountDeletionNondestructiveDatabaseStage";
import {
  fetchAccountDeletionSchemaProbe,
  isSchemaExecutionReadyFromLiveProbe,
} from "./accountDeletionSchemaProbe";
import {
  createAccountDeletionExecutionPreflightDeps,
  runAccountDeletionExecutionPreflight,
  type AccountDeletionExecutionPreflightResult,
} from "./accountDeletionExecutionPreflight";
import {
  createAccountDeletionSessionRevocationOrchestratorDeps,
  runAccountDeletionSessionRevocationPhase,
  type AccountDeletionSessionRevocationOrchestratorResult,
  type AccountDeletionTrustedSessionExecutionContext,
} from "./accountDeletionSessionRevocationOrchestrator";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AccountDeletionExecutionOrchestratorSuccessCode =
  | "database_completed"
  | "already_completed";

export type AccountDeletionExecutionOrchestratorFailureCode =
  | "invalid_arguments"
  | "schema_not_ready"
  | "target_not_found"
  | "blocked_owner"
  | "blocked_admin"
  | "execution_preflight_blocked"
  | "preflight_lookup_failed"
  | "preflight_invariant_failed"
  | "acquisition_failed"
  | "request_not_approved"
  | "execution_in_progress"
  | "attempt_request_mismatch"
  | "target_mismatch"
  | "attempt_not_active"
  | "request_not_in_progress"
  | "stage_conflict"
  | "session_revocation_failed"
  | "failure_recording_failed"
  | "inventory_transition_failed"
  | "database_stage_failed"
  | "invariant_failed";

export type AccountDeletionExecutionOrchestratorResult =
  | {
      ok: true;
      code: AccountDeletionExecutionOrchestratorSuccessCode;
      requestId: string;
      attemptId: string;
      targetUserId: string;
    }
  | {
      ok: false;
      code: AccountDeletionExecutionOrchestratorFailureCode;
      retryable?: boolean;
    };

function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function mapAcquisitionFailure(
  result: Extract<AccountDeletionAcquisitionResult, { ok: false }>
): AccountDeletionExecutionOrchestratorFailureCode {
  switch (result.code) {
    case "request_not_approved":
      return "request_not_approved";
    case "active_attempt_conflict":
    case "ambiguous_state":
    case "ambiguous_state_target_mismatch":
      return "execution_in_progress";
    case "unauthorized_owner":
    case "invalid_arguments":
    case "readiness_failed":
    case "request_not_found":
    case "target_not_resolved":
    case "rpc_error":
    default:
      return "acquisition_failed";
  }
}

function mapSessionFailure(
  result: Extract<AccountDeletionSessionRevocationOrchestratorResult, { ok: false }>
): AccountDeletionExecutionOrchestratorFailureCode {
  switch (result.code) {
    case "attempt_request_mismatch":
      return "attempt_request_mismatch";
    case "target_mismatch":
      return "target_mismatch";
    case "attempt_not_active":
      return "attempt_not_active";
    case "request_not_in_progress":
      return "request_not_in_progress";
    case "stage_conflict":
    case "pre_signout_state_conflict":
    case "transition_failed":
      return "stage_conflict";
    case "session_revocation_failed":
      return "session_revocation_failed";
    case "failure_recording_failed":
      return "failure_recording_failed";
    default:
      return "invariant_failed";
  }
}

function parseInventoryTransition(
  result: AccountDeletionAttemptStageTransitionResult,
  context: AccountDeletionTrustedSessionExecutionContext
): AccountDeletionExecutionOrchestratorResult | null {
  if (result.ok === false) {
    if (result.code === "attempt_request_mismatch") {
      return { ok: false, code: "attempt_request_mismatch" };
    }
    if (result.code === "target_mismatch") {
      return { ok: false, code: "target_mismatch" };
    }
    if (result.code === "stage_conflict") {
      return { ok: false, code: "stage_conflict" };
    }
    return { ok: false, code: "inventory_transition_failed", retryable: true };
  }

  if (
    result.requestId !== context.requestId ||
    result.attemptId !== context.attemptId ||
    result.stage !== "inventory"
  ) {
    return { ok: false, code: "inventory_transition_failed", retryable: true };
  }

  return null;
}

function mapPreflightFailure(
  result: Extract<AccountDeletionExecutionPreflightResult, { ok: false }>
): AccountDeletionExecutionOrchestratorFailureCode {
  switch (result.code) {
    case "target_not_found":
      return "target_not_found";
    case "blocked_owner":
      return "blocked_owner";
    case "blocked_admin":
      return "blocked_admin";
    case "unsupported_story_lifecycle":
      return "execution_preflight_blocked";
    case "preflight_lookup_failed":
      return "preflight_lookup_failed";
    case "preflight_invariant_failed":
      return "preflight_invariant_failed";
    case "execution_in_progress":
      return "execution_in_progress";
    case "request_not_approved":
      return "request_not_approved";
    default:
      return "preflight_invariant_failed";
  }
}

export type AccountDeletionExecutionOrchestratorDeps = {
  verifySchemaReadiness: () => Promise<boolean>;
  runPreflight: (input: {
    requestId: string;
  }) => Promise<AccountDeletionExecutionPreflightResult>;
  acquire: (input: {
    requestId: string;
    initiatedBy: string;
  }) => Promise<AccountDeletionAcquisitionResult>;
  runSessionPhase: (
    context: AccountDeletionTrustedSessionExecutionContext
  ) => Promise<AccountDeletionSessionRevocationOrchestratorResult>;
  advanceToInventory: (
    context: AccountDeletionTrustedSessionExecutionContext
  ) => Promise<AccountDeletionAttemptStageTransitionResult>;
  executeDatabaseStage: (input: {
    requestId: string;
    attemptId: string;
  }) => Promise<
    Awaited<ReturnType<typeof executeAccountDeletionNondestructiveDatabaseStage>>
  >;
};

export function createAccountDeletionExecutionOrchestratorDeps(
  serviceRoleClient: SupabaseClient
): AccountDeletionExecutionOrchestratorDeps {
  const sessionDeps = createAccountDeletionSessionRevocationOrchestratorDeps(
    serviceRoleClient
  );
  const preflightDeps =
    createAccountDeletionExecutionPreflightDeps(serviceRoleClient);

  return {
    async verifySchemaReadiness() {
      const probe = await fetchAccountDeletionSchemaProbe(serviceRoleClient);
      return isSchemaExecutionReadyFromLiveProbe(probe);
    },
    runPreflight(input) {
      return runAccountDeletionExecutionPreflight({
        requestId: input.requestId,
        deps: preflightDeps,
      });
    },
    acquire(input) {
      return acquireAccountDeletionExecutionLock({
        serviceRoleClient,
        requestId: input.requestId,
        initiatedBy: input.initiatedBy,
      });
    },
    runSessionPhase(context) {
      return runAccountDeletionSessionRevocationPhase({
        context,
        deps: sessionDeps,
      });
    },
    advanceToInventory(context) {
      return advanceAccountDeletionAttemptToInventory({
        serviceRoleClient,
        requestId: context.requestId,
        attemptId: context.attemptId,
      });
    },
    executeDatabaseStage(input) {
      return executeAccountDeletionNondestructiveDatabaseStage({
        serviceRoleClient,
        requestId: input.requestId,
        attemptId: input.attemptId,
      });
    },
  };
}

type SessionResumePlan =
  | { kind: "advance_inventory" }
  | { kind: "at_inventory" }
  | { kind: "at_database_completed" };

function planAfterSessionPhase(
  session: AccountDeletionSessionRevocationOrchestratorResult
):
  | { ok: true; plan: SessionResumePlan }
  | { ok: false; code: AccountDeletionExecutionOrchestratorFailureCode; retryable?: boolean } {
  if (session.ok === false) {
    return {
      ok: false,
      code: mapSessionFailure(session),
      retryable: session.retryable,
    };
  }

  switch (session.code) {
    case "sessions_revoked":
    case "already_sessions_revoked":
      return { ok: true, plan: { kind: "advance_inventory" } };
    case "later_stage_reached":
      if (session.stage === "inventory") {
        return { ok: true, plan: { kind: "at_inventory" } };
      }
      if (session.stage === "database_completed") {
        return { ok: true, plan: { kind: "at_database_completed" } };
      }
      return { ok: false, code: "stage_conflict" };
    default:
      return { ok: false, code: "invariant_failed" };
  }
}

/**
 * End-to-end orchestration through nondestructive database stage only.
 * Stops at database_completed — no storage/profile/auth deletion.
 */
export async function runAccountDeletionExecutionOrchestrator(options: {
  requestId: string;
  initiatedBy: string;
  deps: AccountDeletionExecutionOrchestratorDeps;
}): Promise<AccountDeletionExecutionOrchestratorResult> {
  const { requestId, initiatedBy, deps } = options;

  if (!isValidUuid(requestId) || !isValidUuid(initiatedBy)) {
    return { ok: false, code: "invalid_arguments" };
  }

  const schemaReady = await deps.verifySchemaReadiness();
  if (!schemaReady) {
    return { ok: false, code: "schema_not_ready" };
  }

  const preflight = await deps.runPreflight({ requestId });
  if (preflight.ok === false) {
    return { ok: false, code: mapPreflightFailure(preflight) };
  }

  const acquired = await deps.acquire({ requestId, initiatedBy });
  if (acquired.ok === false) {
    return { ok: false, code: mapAcquisitionFailure(acquired) };
  }

  const { attemptId, targetUserId } = acquired.context;
  if (
    !isValidUuid(attemptId) ||
    !isValidUuid(targetUserId) ||
    acquired.context.requestId !== requestId
  ) {
    return { ok: false, code: "invariant_failed" };
  }

  const executionContext: AccountDeletionTrustedSessionExecutionContext = {
    requestId,
    attemptId,
    targetUserId,
  };

  const session = await deps.runSessionPhase(executionContext);
  const resume = planAfterSessionPhase(session);
  if (resume.ok === false) {
    return {
      ok: false,
      code: resume.code,
      retryable: resume.retryable,
    };
  }

  if (resume.plan.kind === "advance_inventory") {
    const inventory = await deps.advanceToInventory(executionContext);
    const inventoryFailure = parseInventoryTransition(inventory, executionContext);
    if (inventoryFailure) {
      return inventoryFailure;
    }
  }

  const database = await deps.executeDatabaseStage({
    requestId,
    attemptId,
  });

  if (database.ok === false) {
    if (
      database.code === "invalid_stage" ||
      database.code === "attempt_mismatch" ||
      database.code === "stale_state"
    ) {
      return { ok: false, code: "stage_conflict" };
    }
    if (database.code === "readiness_failed") {
      return { ok: false, code: "schema_not_ready" };
    }
    return { ok: false, code: "database_stage_failed", retryable: true };
  }

  if (
    database.requestId !== requestId ||
    database.attemptId !== attemptId ||
    database.targetUserId !== targetUserId
  ) {
    return { ok: false, code: "invariant_failed" };
  }

  return {
    ok: true,
    code:
      database.code === "already_completed"
        ? "already_completed"
        : "database_completed",
    requestId,
    attemptId,
    targetUserId,
  };
}

export const ACCOUNT_DELETION_EXECUTION_ORCHESTRATOR_SCOPE_NOTE =
  "runAccountDeletionExecutionOrchestrator stops at database_completed. "
  + "Storage, profile, auth user deletion, and request finalize=deleted are later phases. "
  + "Pre-acquisition preflight reduces predictable failures but does not eliminate TOCTOU; "
  + "3B.1 in-transaction preflight remains authoritative after acquisition.";
