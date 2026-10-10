import type { SupabaseClient } from "@supabase/supabase-js";
import {
  acquireAccountDeletionExecutionLock,
  type AccountDeletionAcquisitionResult,
} from "./accountDeletionAcquisition";
import {
  advanceAccountDeletionAttemptToInventory,
  type AccountDeletionAttemptStageTransitionResult,
} from "./accountDeletionAttemptStageTransitions";
import { isAccountDeletionExecutionEnabled } from "./accountDeletionExecutionPolicy";
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
import {
  captureAccountDeletionStorageManifest,
  type AccountDeletionStorageManifestCaptureResult,
} from "./accountDeletionStorageManifestCapture";
import { isAccountDeletionPhysicalStorageExecutionEnabled } from "./accountDeletionStorageExecutionPolicy";
import {
  runAccountDeletionStorageStageTick,
  type AccountDeletionStorageStageTickResult,
} from "./accountDeletionStorageStageRunner";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AccountDeletionExecutionOrchestratorSuccessCode =
  | "database_completed"
  | "already_completed"
  | "storage_completed"
  | "storage_in_progress";

export type AccountDeletionExecutionOrchestratorFailureCode =
  | "invalid_arguments"
  | "execution_disabled"
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
  | "storage_manifest_capture_failed"
  | "storage_manifest_blocked"
  | "database_stage_failed"
  | "storage_execution_disabled"
  | "storage_blocked"
  | "storage_precondition_failed"
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
  isGlobalExecutionEnabled?: () => boolean;
  isStorageOrchestrationEnabled?: () => boolean;
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
  captureStorageManifest: (input: {
    requestId: string;
    attemptId: string;
  }) => Promise<AccountDeletionStorageManifestCaptureResult>;
  executeDatabaseStage: (input: {
    requestId: string;
    attemptId: string;
  }) => Promise<
    Awaited<ReturnType<typeof executeAccountDeletionNondestructiveDatabaseStage>>
  >;
  runStorageStageTick: (input: {
    requestId: string;
    attemptId: string;
  }) => Promise<AccountDeletionStorageStageTickResult>;
};

async function verifyStorageStageRunnerReadiness(
  serviceRoleClient: SupabaseClient
): Promise<boolean> {
  const { data, error } = await serviceRoleClient.rpc(
    "verify_account_deletion_storage_stage_runner_ready"
  );
  if (error || data == null || typeof data !== "object") {
    return false;
  }
  return (data as { ready?: boolean }).ready === true;
}

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
    captureStorageManifest(input) {
      return captureAccountDeletionStorageManifest({
        serviceRoleClient,
        requestId: input.requestId,
        attemptId: input.attemptId,
      });
    },
    executeDatabaseStage(input) {
      return executeAccountDeletionNondestructiveDatabaseStage({
        serviceRoleClient,
        requestId: input.requestId,
        attemptId: input.attemptId,
      });
    },
    runStorageStageTick(input) {
      return runAccountDeletionStorageStageTick({
        requestId: input.requestId,
        attemptId: input.attemptId,
        deps: {
          serviceRoleClient,
          verifyRunnerReadiness: () =>
            verifyStorageStageRunnerReadiness(serviceRoleClient),
          isPhysicalStorageExecutionEnabled:
            isAccountDeletionPhysicalStorageExecutionEnabled,
        },
      });
    },
  };
}

type SessionResumePlan =
  | { kind: "advance_inventory" }
  | { kind: "at_inventory" }
  | { kind: "at_database_completed" }
  | { kind: "at_storage" }
  | { kind: "at_storage_completed" };

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
      if (session.stage === "storage") {
        return { ok: true, plan: { kind: "at_storage" } };
      }
      if (session.stage === "storage_completed") {
        return { ok: true, plan: { kind: "at_storage_completed" } };
      }
      return { ok: false, code: "stage_conflict" };
    default:
      return { ok: false, code: "invariant_failed" };
  }
}

function mapStorageTickToOrchestratorResult(
  tick: AccountDeletionStorageStageTickResult,
  context: AccountDeletionTrustedSessionExecutionContext
): AccountDeletionExecutionOrchestratorResult {
  const base = {
    requestId: context.requestId,
    attemptId: context.attemptId,
    targetUserId: context.targetUserId,
  };

  switch (tick.code) {
    case "storage_completed":
    case "already_completed":
      return { ok: true, code: "storage_completed", ...base };
    case "in_progress":
      return { ok: true, code: "storage_in_progress", ...base };
    case "blocked":
      return { ok: false, code: "storage_blocked" };
    case "disabled":
      return { ok: false, code: "storage_execution_disabled" };
    case "precondition_failed":
      return { ok: false, code: "storage_precondition_failed" };
    default:
      return { ok: false, code: "storage_precondition_failed" };
  }
}

async function runBoundedStorageStageTick(
  deps: AccountDeletionExecutionOrchestratorDeps,
  context: AccountDeletionTrustedSessionExecutionContext
): Promise<AccountDeletionExecutionOrchestratorResult> {
  const tick = await deps.runStorageStageTick({
    requestId: context.requestId,
    attemptId: context.attemptId,
  });
  return mapStorageTickToOrchestratorResult(tick, context);
}

function resolveGlobalExecutionEnabled(
  deps: AccountDeletionExecutionOrchestratorDeps
): boolean {
  return (deps.isGlobalExecutionEnabled ?? isAccountDeletionExecutionEnabled)();
}

function resolveStorageOrchestrationEnabled(
  deps: AccountDeletionExecutionOrchestratorDeps
): boolean {
  return (
    deps.isStorageOrchestrationEnabled ??
    isAccountDeletionPhysicalStorageExecutionEnabled
  )();
}

/**
 * Controlled execution orchestrator: pre-Storage phases, then at most one Storage stage tick.
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

  if (!resolveGlobalExecutionEnabled(deps)) {
    return { ok: false, code: "execution_disabled" };
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

  const storageOrchestrationEnabled = resolveStorageOrchestrationEnabled(deps);

  const session = await deps.runSessionPhase(executionContext);
  const resume = planAfterSessionPhase(session);
  if (resume.ok === false) {
    return {
      ok: false,
      code: resume.code,
      retryable: resume.retryable,
    };
  }

  if (resume.plan.kind === "at_storage_completed") {
    return {
      ok: true,
      code: "storage_completed",
      requestId,
      attemptId,
      targetUserId,
    };
  }

  if (resume.plan.kind === "at_storage") {
    if (!storageOrchestrationEnabled) {
      return { ok: false, code: "storage_execution_disabled" };
    }
    return runBoundedStorageStageTick(deps, executionContext);
  }

  if (resume.plan.kind === "at_database_completed") {
    if (!storageOrchestrationEnabled) {
      return {
        ok: true,
        code: "already_completed",
        requestId,
        attemptId,
        targetUserId,
      };
    }
    return runBoundedStorageStageTick(deps, executionContext);
  }

  if (resume.plan.kind === "advance_inventory") {
    const inventory = await deps.advanceToInventory(executionContext);
    const inventoryFailure = parseInventoryTransition(inventory, executionContext);
    if (inventoryFailure) {
      return inventoryFailure;
    }
  }

  if (
    resume.plan.kind === "advance_inventory" ||
    resume.plan.kind === "at_inventory"
  ) {
    const capture = await deps.captureStorageManifest({
      requestId,
      attemptId,
    });
    if (capture.ok === false) {
      if (
        capture.code === "storage_manifest_blocked" ||
        capture.code === "has_block_unresolved"
      ) {
        return { ok: false, code: "storage_manifest_blocked" };
      }
      return {
        ok: false,
        code: "storage_manifest_capture_failed",
        retryable: capture.retryable,
      };
    }
    if (capture.hasBlockUnresolved || capture.blockedCount > 0) {
      return { ok: false, code: "storage_manifest_blocked" };
    }
    if (
      capture.requestId !== requestId ||
      capture.attemptId !== attemptId ||
      capture.targetUserId !== targetUserId
    ) {
      return { ok: false, code: "invariant_failed" };
    }
  }

  const database = await deps.executeDatabaseStage({
    requestId,
    attemptId,
  });

  if (database.ok === false) {
    if (
      database.code === "storage_manifest_not_finalized" ||
      database.code === "storage_manifest_blocked" ||
      database.code === "storage_manifest_state_drift" ||
      database.code === "storage_manifest_integrity_failed"
    ) {
      return {
        ok: false,
        code:
          database.code === "storage_manifest_blocked"
            ? "storage_manifest_blocked"
            : "storage_manifest_capture_failed",
      };
    }
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

  const databaseSuccessCode: AccountDeletionExecutionOrchestratorSuccessCode =
    database.code === "already_completed" ? "already_completed" : "database_completed";

  if (!storageOrchestrationEnabled) {
    return {
      ok: true,
      code: databaseSuccessCode,
      requestId,
      attemptId,
      targetUserId,
    };
  }

  return runBoundedStorageStageTick(deps, executionContext);
}

export const ACCOUNT_DELETION_EXECUTION_ORCHESTRATOR_SCOPE_NOTE =
  "runAccountDeletionExecutionOrchestrator: sessions → inventory → "
  + "authoritative storage manifest capture/finalize → 3B.1 → database_completed; "
  + "when dual execution flags are true, one bounded Storage stage tick via "
  + "runAccountDeletionStorageStageTick. Profile/auth deletion remain later phases. "
  + "Pre-acquisition preflight reduces predictable failures but does not eliminate TOCTOU; "
  + "3B.1 in-transaction preflight + storage-manifest gate remain authoritative after acquisition.";
