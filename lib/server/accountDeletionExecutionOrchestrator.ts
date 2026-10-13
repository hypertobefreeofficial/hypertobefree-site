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
  finalizeAccountDeletionProfileStage,
  type AccountDeletionProfileCompletionResult,
} from "./accountDeletionProfileCompletion";
import {
  prepareAccountDeletionProfileStage,
  type AccountDeletionProfileStageResult,
} from "./accountDeletionProfileStage";
import { executeAccountDeletionAuthDelete } from "./accountDeletionAuthExecutor";
import type { AccountDeletionAuthExecutorResult } from "./accountDeletionAuthExecutor";
import {
  prepareAccountDeletionAuthStage,
  type AccountDeletionAuthStageResult,
} from "./accountDeletionAuthStage";
import { isAccountDeletionAuthExecutionEnabled } from "./accountDeletionAuthExecutionPolicy";
import { isAccountDeletionProfileExecutionEnabled } from "./accountDeletionProfileStagePolicy";
import {
  createAccountDeletionProfileMediaStageRunnerDeps,
  runAccountDeletionProfileMediaTick,
  verifyAccountDeletionProfileMediaStageRunnerReadiness,
} from "./accountDeletionProfileMediaStageRunner";
import type { AccountDeletionProfileMediaStageTickResult } from "./accountDeletionProfileMediaStageRunnerPolicy";
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
  | "storage_in_progress"
  | "profile_completed"
  | "profile_in_progress"
  | "auth_finalize"
  | "auth_in_progress";

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
  | "profile_execution_disabled"
  | "profile_precondition_failed"
  | "profile_blocked"
  | "profile_completion_failed"
  | "auth_execution_disabled"
  | "auth_execution_failed"
  | "auth_precondition_failed"
  | "auth_blocked"
  | "auth_stage_failed"
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
  isProfileOrchestrationEnabled?: () => boolean;
  isAuthOrchestrationEnabled?: () => boolean;
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
  prepareProfileStage: (input: {
    requestId: string;
    attemptId: string;
  }) => Promise<AccountDeletionProfileStageResult>;
  runProfileMediaTick: (input: {
    requestId: string;
    attemptId: string;
  }) => Promise<AccountDeletionProfileMediaStageTickResult>;
  finalizeProfileStage: (input: {
    requestId: string;
    attemptId: string;
  }) => Promise<AccountDeletionProfileCompletionResult>;
  prepareAuthStage: (input: {
    requestId: string;
    attemptId: string;
  }) => Promise<AccountDeletionAuthStageResult>;
  executeAuthDelete: (input: {
    requestId: string;
    attemptId: string;
  }) => Promise<AccountDeletionAuthExecutorResult>;
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
  const profileMediaRunnerDeps =
    createAccountDeletionProfileMediaStageRunnerDeps(serviceRoleClient);

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
    prepareProfileStage(input) {
      return prepareAccountDeletionProfileStage({
        serviceRoleClient,
        requestId: input.requestId,
        attemptId: input.attemptId,
      });
    },
    runProfileMediaTick(input) {
      return runAccountDeletionProfileMediaTick({
        requestId: input.requestId,
        attemptId: input.attemptId,
        deps: {
          ...profileMediaRunnerDeps,
          verifyRunnerReadiness: () =>
            verifyAccountDeletionProfileMediaStageRunnerReadiness(
              serviceRoleClient
            ),
        },
      });
    },
    finalizeProfileStage(input) {
      return finalizeAccountDeletionProfileStage({
        serviceRoleClient,
        requestId: input.requestId,
        attemptId: input.attemptId,
      });
    },
    prepareAuthStage(input) {
      return prepareAccountDeletionAuthStage({
        serviceRoleClient,
        requestId: input.requestId,
        attemptId: input.attemptId,
      });
    },
    executeAuthDelete(input) {
      return executeAccountDeletionAuthDelete({
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
  | { kind: "at_database_completed" }
  | { kind: "at_storage" }
  | { kind: "at_storage_completed" }
  | { kind: "at_profile" }
  | { kind: "at_profile_completed" }
  | { kind: "at_auth_pending" }
  | { kind: "at_auth" }
  | { kind: "at_finalize" };

type ProfileSegmentEntry = "storage_completed" | "profile";
type AuthSegmentEntry = "profile_completed" | "auth_pending" | "auth";

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
      if (session.stage === "profile") {
        return { ok: true, plan: { kind: "at_profile" } };
      }
      if (session.stage === "profile_completed") {
        return { ok: true, plan: { kind: "at_profile_completed" } };
      }
      if (session.stage === "auth_pending") {
        return { ok: true, plan: { kind: "at_auth_pending" } };
      }
      if (session.stage === "auth") {
        return { ok: true, plan: { kind: "at_auth" } };
      }
      if (session.stage === "finalize") {
        return { ok: true, plan: { kind: "at_finalize" } };
      }
      return { ok: false, code: "stage_conflict" };
    default:
      return { ok: false, code: "invariant_failed" };
  }
}

function orchestratorSuccessBase(
  context: AccountDeletionTrustedSessionExecutionContext
) {
  return {
    requestId: context.requestId,
    attemptId: context.attemptId,
    targetUserId: context.targetUserId,
  };
}

function mapPrepareFailure(
  result: Extract<AccountDeletionProfileStageResult, { ok: false }>
): AccountDeletionExecutionOrchestratorResult {
  switch (result.code) {
    case "request_not_in_progress":
    case "attempt_mismatch":
    case "invalid_stage":
    case "irreversible_stage":
    case "storage_manifest_not_finalized":
    case "storage_execution_not_complete":
      return { ok: false, code: "stage_conflict" };
    case "target_unresolved":
    case "profile_not_found":
    case "profile_username_tombstone_unavailable":
      return { ok: false, code: "profile_precondition_failed" };
    case "rpc_error":
      return { ok: false, code: "profile_completion_failed", retryable: true };
    case "invalid_arguments":
      return { ok: false, code: "invariant_failed" };
    default:
      return { ok: false, code: "profile_completion_failed" };
  }
}

function mapProfileMediaTick(
  tick: AccountDeletionProfileMediaStageTickResult,
  context: AccountDeletionTrustedSessionExecutionContext
): AccountDeletionExecutionOrchestratorResult | { proceedToFinalize: true } {
  const base = orchestratorSuccessBase(context);

  if (tick.code === "profile_media_completed") {
    return { proceedToFinalize: true };
  }

  if (tick.code === "profile_media_in_progress") {
    return { ok: true, code: "profile_in_progress", ...base };
  }

  if (tick.code === "profile_media_blocked") {
    return { ok: false, code: "profile_blocked" };
  }

  if (
    tick.code === "profile_media_precondition_failed" ||
    tick.code === "precondition_failed"
  ) {
    return {
      ok: false,
      code: "profile_precondition_failed",
      retryable: tick.code === "precondition_failed",
    };
  }

  if (
    tick.code === "execution_disabled" ||
    tick.code === "profile_execution_disabled" ||
    tick.code === "profile_storage_execution_disabled"
  ) {
    return { ok: false, code: "profile_execution_disabled" };
  }

  return { ok: false, code: "profile_precondition_failed" };
}

function mapFinalizeFailure(
  result: Extract<AccountDeletionProfileCompletionResult, { ok: false }>
): AccountDeletionExecutionOrchestratorResult {
  switch (result.code) {
    case "profile_media_not_complete":
      return { ok: false, code: "invariant_failed" };
    case "rpc_error":
      return { ok: false, code: "profile_completion_failed", retryable: true };
    case "request_not_in_progress":
    case "attempt_mismatch":
    case "invalid_stage":
    case "storage_manifest_not_finalized":
    case "irreversible_stage":
      return { ok: false, code: "stage_conflict" };
    case "target_unresolved":
      return { ok: false, code: "profile_precondition_failed" };
    case "inconsistent_state":
    case "profile_delete_invariant_failed":
    case "invariant_failed":
      return { ok: false, code: "profile_completion_failed" };
    case "invalid_arguments":
      return { ok: false, code: "invariant_failed" };
    default:
      return { ok: false, code: "profile_completion_failed" };
  }
}

function mapFinalizeSuccess(
  result: Extract<AccountDeletionProfileCompletionResult, { ok: true }>,
  context: AccountDeletionTrustedSessionExecutionContext
): AccountDeletionExecutionOrchestratorResult {
  if (
    result.requestId !== context.requestId ||
    result.attemptId !== context.attemptId ||
    result.targetUserId !== context.targetUserId
  ) {
    return { ok: false, code: "invariant_failed" };
  }
  return {
    ok: true,
    code: "profile_completed",
    requestId: context.requestId,
    attemptId: context.attemptId,
    targetUserId: context.targetUserId,
  };
}

async function runBoundedProfileStageSegment(
  deps: AccountDeletionExecutionOrchestratorDeps,
  context: AccountDeletionTrustedSessionExecutionContext,
  entry: ProfileSegmentEntry
): Promise<AccountDeletionExecutionOrchestratorResult> {
  if (entry === "storage_completed") {
    const prepared = await deps.prepareProfileStage({
      requestId: context.requestId,
      attemptId: context.attemptId,
    });
    if (prepared.ok === false) {
      return mapPrepareFailure(prepared);
    }
    if (
      prepared.code !== "prepared" &&
      prepared.code !== "already_prepared"
    ) {
      return { ok: false, code: "invariant_failed" };
    }
    if (
      prepared.requestId !== context.requestId ||
      prepared.attemptId !== context.attemptId ||
      prepared.targetUserId !== context.targetUserId
    ) {
      return { ok: false, code: "invariant_failed" };
    }
  }

  const tick = await deps.runProfileMediaTick({
    requestId: context.requestId,
    attemptId: context.attemptId,
  });

  const tickMapped = mapProfileMediaTick(tick, context);
  if (!("proceedToFinalize" in tickMapped)) {
    return tickMapped;
  }

  const finalized = await deps.finalizeProfileStage({
    requestId: context.requestId,
    attemptId: context.attemptId,
  });

  if (finalized.ok === false) {
    if (finalized.code === "profile_media_not_complete") {
      return {
        ok: true,
        code: "profile_in_progress",
        ...orchestratorSuccessBase(context),
      };
    }
    return mapFinalizeFailure(finalized);
  }

  return mapFinalizeSuccess(finalized, context);
}

function mapStorageTickToOrchestratorResult(
  tick: AccountDeletionStorageStageTickResult,
  context: AccountDeletionTrustedSessionExecutionContext
): AccountDeletionExecutionOrchestratorResult {
  const base = orchestratorSuccessBase(context);

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

function mapAuthPrepareFailure(
  result: Extract<AccountDeletionAuthStageResult, { ok: false }>
): AccountDeletionExecutionOrchestratorResult {
  switch (result.code) {
    case "preservation_hold_active":
      return { ok: false, code: "auth_blocked" };
    case "request_not_in_progress":
    case "attempt_mismatch":
    case "invalid_stage":
    case "irreversible_stage":
    case "storage_manifest_not_finalized":
    case "profile_completion_not_evidence_backed":
    case "inconsistent_state":
      return { ok: false, code: "stage_conflict" };
    case "target_unresolved":
      return { ok: false, code: "auth_precondition_failed" };
    case "rpc_error":
    case "invariant_failed":
      return { ok: false, code: "auth_stage_failed", retryable: true };
    case "invalid_arguments":
      return { ok: false, code: "invariant_failed" };
    default:
      return { ok: false, code: "auth_stage_failed" };
  }
}

function mapAuthExecutorResult(
  result: AccountDeletionAuthExecutorResult,
  context: AccountDeletionTrustedSessionExecutionContext
): AccountDeletionExecutionOrchestratorResult {
  const base = orchestratorSuccessBase(context);

  if (result.ok === true) {
    if (
      result.requestId !== context.requestId ||
      result.attemptId !== context.attemptId ||
      result.stage !== "finalize"
    ) {
      return { ok: false, code: "invariant_failed" };
    }
    return { ok: true, code: "auth_finalize", ...base };
  }

  switch (result.code) {
    case "auth_execution_disabled":
      return { ok: false, code: "auth_execution_disabled" };
    case "auth_claim_in_progress":
      return { ok: true, code: "auth_in_progress", ...base };
    case "claim_rpc_failed":
    case "auth_precheck_failed":
    case "auth_postcheck_failed":
    case "complete_rpc_failed":
      return {
        ok: false,
        code: "auth_execution_failed",
        retryable: result.retryable ?? true,
      };
    case "claim_precondition_failed":
    case "complete_precondition_failed":
      return { ok: false, code: "auth_precondition_failed" };
    case "preservation_hold_active":
      return { ok: false, code: "auth_blocked" };
    case "stage_conflict":
      return { ok: false, code: "stage_conflict" };
    case "invalid_arguments":
    case "claim_invariant_failed":
    case "complete_invariant_failed":
    case "auth_verification_failed":
      return { ok: false, code: "auth_execution_failed" };
    default:
      return {
        ok: false,
        code: "auth_execution_failed",
        retryable: result.retryable,
      };
  }
}

async function runBoundedAuthStageSegment(
  deps: AccountDeletionExecutionOrchestratorDeps,
  context: AccountDeletionTrustedSessionExecutionContext,
  entry: AuthSegmentEntry
): Promise<AccountDeletionExecutionOrchestratorResult> {
  if (entry === "profile_completed") {
    const prepared = await deps.prepareAuthStage({
      requestId: context.requestId,
      attemptId: context.attemptId,
    });
    if (prepared.ok === false) {
      return mapAuthPrepareFailure(prepared);
    }
    if (
      prepared.code !== "prepared" &&
      prepared.code !== "already_prepared"
    ) {
      return { ok: false, code: "invariant_failed" };
    }
    if (
      prepared.requestId !== context.requestId ||
      prepared.attemptId !== context.attemptId ||
      prepared.targetUserId !== context.targetUserId ||
      prepared.stage !== "auth_pending"
    ) {
      return { ok: false, code: "invariant_failed" };
    }
  }

  const authResult = await deps.executeAuthDelete({
    requestId: context.requestId,
    attemptId: context.attemptId,
  });

  return mapAuthExecutorResult(authResult, context);
}

async function continueAfterProfileResult(
  deps: AccountDeletionExecutionOrchestratorDeps,
  context: AccountDeletionTrustedSessionExecutionContext,
  profileResult: AccountDeletionExecutionOrchestratorResult
): Promise<AccountDeletionExecutionOrchestratorResult> {
  if (!profileResult.ok || profileResult.code !== "profile_completed") {
    return profileResult;
  }
  if (!resolveAuthOrchestrationEnabled(deps)) {
    return profileResult;
  }
  return runBoundedAuthStageSegment(deps, context, "profile_completed");
}

async function continueAfterStorageResult(
  deps: AccountDeletionExecutionOrchestratorDeps,
  context: AccountDeletionTrustedSessionExecutionContext,
  storageResult: AccountDeletionExecutionOrchestratorResult
): Promise<AccountDeletionExecutionOrchestratorResult> {
  if (!storageResult.ok || storageResult.code !== "storage_completed") {
    return storageResult;
  }
  if (!resolveProfileOrchestrationEnabled(deps)) {
    return storageResult;
  }
  const profileResult = await runBoundedProfileStageSegment(
    deps,
    context,
    "storage_completed"
  );
  return continueAfterProfileResult(deps, context, profileResult);
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

function resolveProfileOrchestrationEnabled(
  deps: AccountDeletionExecutionOrchestratorDeps
): boolean {
  return (
    deps.isProfileOrchestrationEnabled ?? isAccountDeletionProfileExecutionEnabled
  )();
}

function resolveAuthOrchestrationEnabled(
  deps: AccountDeletionExecutionOrchestratorDeps
): boolean {
  return (
    deps.isAuthOrchestrationEnabled ?? isAccountDeletionAuthExecutionEnabled
  )();
}

/**
 * Controlled execution orchestrator: pre-Storage phases, at most one Storage tick,
 * then at most one profile prepare / profile-media tick / finalizer when enabled.
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
  const profileOrchestrationEnabled = resolveProfileOrchestrationEnabled(deps);

  const session = await deps.runSessionPhase(executionContext);
  const resume = planAfterSessionPhase(session);
  if (resume.ok === false) {
    return {
      ok: false,
      code: resume.code,
      retryable: resume.retryable,
    };
  }

  if (resume.plan.kind === "at_finalize") {
    return {
      ok: true,
      code: "auth_finalize",
      ...orchestratorSuccessBase(executionContext),
    };
  }

  if (resume.plan.kind === "at_auth_pending") {
    if (!resolveAuthOrchestrationEnabled(deps)) {
      return { ok: false, code: "auth_execution_disabled" };
    }
    return runBoundedAuthStageSegment(deps, executionContext, "auth_pending");
  }

  if (resume.plan.kind === "at_auth") {
    if (!resolveAuthOrchestrationEnabled(deps)) {
      return { ok: false, code: "auth_execution_disabled" };
    }
    return runBoundedAuthStageSegment(deps, executionContext, "auth");
  }

  if (resume.plan.kind === "at_profile_completed") {
    if (!resolveAuthOrchestrationEnabled(deps)) {
      return {
        ok: true,
        code: "profile_completed",
        ...orchestratorSuccessBase(executionContext),
      };
    }
    return runBoundedAuthStageSegment(
      deps,
      executionContext,
      "profile_completed"
    );
  }

  if (resume.plan.kind === "at_profile") {
    if (!profileOrchestrationEnabled) {
      return { ok: false, code: "profile_execution_disabled" };
    }
    const profileResult = await runBoundedProfileStageSegment(
      deps,
      executionContext,
      "profile"
    );
    return continueAfterProfileResult(deps, executionContext, profileResult);
  }

  if (resume.plan.kind === "at_storage_completed") {
    if (!profileOrchestrationEnabled) {
      return {
        ok: true,
        code: "storage_completed",
        ...orchestratorSuccessBase(executionContext),
      };
    }
    const profileResult = await runBoundedProfileStageSegment(
      deps,
      executionContext,
      "storage_completed"
    );
    return continueAfterProfileResult(deps, executionContext, profileResult);
  }

  if (resume.plan.kind === "at_storage") {
    if (!storageOrchestrationEnabled) {
      return { ok: false, code: "storage_execution_disabled" };
    }
    const storageResult = await runBoundedStorageStageTick(
      deps,
      executionContext
    );
    return continueAfterStorageResult(deps, executionContext, storageResult);
  }

  if (resume.plan.kind === "at_database_completed") {
    if (!storageOrchestrationEnabled) {
      return {
        ok: true,
        code: "already_completed",
        ...orchestratorSuccessBase(executionContext),
      };
    }
    const storageResult = await runBoundedStorageStageTick(
      deps,
      executionContext
    );
    return continueAfterStorageResult(deps, executionContext, storageResult);
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

  const storageResult = await runBoundedStorageStageTick(deps, executionContext);
  return continueAfterStorageResult(deps, executionContext, storageResult);
}

export const ACCOUNT_DELETION_EXECUTION_ORCHESTRATOR_SCOPE_NOTE =
  "runAccountDeletionExecutionOrchestrator: sessions → inventory → "
  + "authoritative storage manifest capture/finalize → 3B.1 → database_completed; "
  + "when dual execution flags are true, one bounded Storage stage tick via "
  + "runAccountDeletionStorageStageTick; when profile execution is enabled, at most "
  + "one prepare + profile-media tick + finalize_account_deletion_profile_stage per "
  + "invocation; when Auth execution is enabled after profile_completed, at most one "
  + "prepare_account_deletion_auth_stage + one executeAccountDeletionAuthDelete per "
  + "invocation (stops at finalize). Request terminal completion is not in scope. "
  + "Pre-acquisition preflight reduces predictable failures but does not eliminate TOCTOU; "
  + "3B.1 in-transaction preflight + storage-manifest gate remain authoritative after acquisition.";
