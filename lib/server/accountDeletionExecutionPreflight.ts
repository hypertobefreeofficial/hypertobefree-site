import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveDeletionRequestTargetUserId } from "../accountCenter/accountDeletionLifecycle";
import {
  validateExecutionEligibility,
  validatePrivilegedTarget,
  type AccountDeletionExecutionProfileRow,
  type AccountDeletionExecutionRequestRow,
} from "./accountDeletionExecutor";
import {
  loadTargetOwnedStorySafetyInventoriesWithClient,
  type TargetStorySafetyInventoryBatch,
} from "./accountDeletionStorySafetyInventory";
import {
  logAccountDeletionPreflightFailure,
  summarizeStorySafetyInventoryPreflightDiagnostics,
} from "./accountDeletionExecutionPreflightDiagnostics";
import { targetOwnedStoryBlocksNondestructiveDatabaseStage } from "./accountDeletionStoryLifecycle";

const EXECUTION_REQUEST_COLUMNS =
  "id, user_id, email, status, target_user_id_snapshot, execution_started_at";

export type AccountDeletionExecutionPreflightSuccessCode = "preflight_ready";

export type AccountDeletionExecutionPreflightFailureCode =
  | "request_not_approved"
  | "target_not_found"
  | "blocked_owner"
  | "blocked_admin"
  | "unsupported_story_lifecycle"
  | "preflight_lookup_failed"
  | "preflight_invariant_failed"
  | "execution_in_progress";

export type AccountDeletionExecutionPreflightSanitizedSummary = {
  operation:
    | "deletion_request_lookup"
    | "profile_lookup"
    | "story_safety_inventory"
    | "story_lifecycle"
    | "preflight_complete";
  blockerCodes: readonly string[];
  childTablesWithQueryFailures: readonly string[];
  expectedStoryCount: number | null;
  nonAuthoritativeStoryCount: number | null;
};

export type AccountDeletionExecutionPreflightResult =
  | {
      ok: true;
      code: AccountDeletionExecutionPreflightSuccessCode;
      requestId: string;
      targetUserId: string;
      summary: AccountDeletionExecutionPreflightSanitizedSummary;
    }
  | {
      ok: false;
      code: AccountDeletionExecutionPreflightFailureCode;
      summary: AccountDeletionExecutionPreflightSanitizedSummary;
    };

function preflightCompleteSummary(
  batch: TargetStorySafetyInventoryBatch
): AccountDeletionExecutionPreflightSanitizedSummary {
  return {
    operation: "preflight_complete",
    blockerCodes: [],
    childTablesWithQueryFailures: [],
    expectedStoryCount: batch.expectedStoryIds.length,
    nonAuthoritativeStoryCount: 0,
  };
}

function preflightFailureSummary(input: {
  operation: AccountDeletionExecutionPreflightSanitizedSummary["operation"];
  blockerCodes?: readonly string[];
  childTablesWithQueryFailures?: readonly string[];
  expectedStoryCount?: number | null;
  nonAuthoritativeStoryCount?: number | null;
}): AccountDeletionExecutionPreflightSanitizedSummary {
  return {
    operation: input.operation,
    blockerCodes: input.blockerCodes ?? [],
    childTablesWithQueryFailures: input.childTablesWithQueryFailures ?? [],
    expectedStoryCount: input.expectedStoryCount ?? null,
    nonAuthoritativeStoryCount: input.nonAuthoritativeStoryCount ?? null,
  };
}

export type AccountDeletionExecutionPreflightDeps = {
  loadDeletionRequest: (
    requestId: string
  ) => Promise<AccountDeletionExecutionRequestRow | null>;
  loadProfile: (
    userId: string
  ) => Promise<AccountDeletionExecutionProfileRow | null>;
  loadTargetStorySafetyBatch: (
    targetUserId: string
  ) => Promise<TargetStorySafetyInventoryBatch>;
};

export function createAccountDeletionExecutionPreflightDeps(
  serviceRoleClient: SupabaseClient
): AccountDeletionExecutionPreflightDeps {
  return {
    async loadDeletionRequest(requestId) {
      const { data, error } = await serviceRoleClient
        .from("account_deletion_requests")
        .select(EXECUTION_REQUEST_COLUMNS)
        .eq("id", requestId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return data as AccountDeletionExecutionRequestRow;
    },
    async loadProfile(userId) {
      const { data, error } = await serviceRoleClient
        .from("profiles")
        .select("id, is_owner, is_admin")
        .eq("id", userId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return data as AccountDeletionExecutionProfileRow;
    },
    loadTargetStorySafetyBatch(targetUserId) {
      return loadTargetOwnedStorySafetyInventoriesWithClient(
        targetUserId,
        serviceRoleClient
      );
    },
  };
}

function mapEligibilityFailure(
  code: string
): AccountDeletionExecutionPreflightFailureCode {
  switch (code) {
    case "target_not_found":
      return "target_not_found";
    case "execution_in_progress":
      return "execution_in_progress";
    case "request_not_found":
      return "preflight_lookup_failed";
    default:
      return "request_not_approved";
  }
}

function logPreflightFailure(input: {
  preflightCode: AccountDeletionExecutionPreflightFailureCode;
  operation:
    | "deletion_request_lookup"
    | "profile_lookup"
    | "story_safety_inventory"
    | "story_lifecycle";
  blockerCodes?: readonly string[];
  childTablesWithQueryFailures?: readonly string[];
  expectedStoryCount?: number | null;
  nonAuthoritativeStoryCount?: number | null;
}): void {
  logAccountDeletionPreflightFailure({
    phase: "execution_preflight",
    preflightCode: input.preflightCode,
    operation: input.operation,
    blockerCodes: input.blockerCodes ?? [],
    childTablesWithQueryFailures: input.childTablesWithQueryFailures ?? [],
    expectedStoryCount: input.expectedStoryCount ?? null,
    nonAuthoritativeStoryCount: input.nonAuthoritativeStoryCount ?? null,
  });
}

function evaluateTargetOwnedStoriesForExecution(
  batch: TargetStorySafetyInventoryBatch
): AccountDeletionExecutionPreflightFailureCode | null {
  for (const inventory of batch.inventories) {
    if (inventory.targetUserId !== batch.targetUserId) {
      return "preflight_invariant_failed";
    }

    if (
      targetOwnedStoryBlocksNondestructiveDatabaseStage({
        status: inventory.status,
        removedAt: inventory.removedAt,
      })
    ) {
      return "unsupported_story_lifecycle";
    }
  }

  return null;
}

/**
 * Read-only execution gate before acquisition. Does not mutate requests, attempts,
 * sessions, stories, or Auth state.
 *
 * Requests already in deletion_in_progress skip BEGIN checks — orchestration resume is
 * handled by acquisition/idempotent stage RPCs, not a new execution start.
 *
 * TOCTOU: target-owned content may change after this check. Acquisition and write-freeze
 * remain authoritative for request state; 3B.1 in-transaction preflight remains the
 * atomic backstop after inventory.
 */
export async function runAccountDeletionExecutionPreflight(options: {
  requestId: string;
  deps: AccountDeletionExecutionPreflightDeps;
}): Promise<AccountDeletionExecutionPreflightResult> {
  const { requestId, deps } = options;

  const request = await deps.loadDeletionRequest(requestId);
  const eligibility = validateExecutionEligibility(request);
  if (eligibility.ok === false) {
    if (eligibility.code === "request_not_found") {
      const summary = preflightFailureSummary({
        operation: "deletion_request_lookup",
        blockerCodes: ["request_not_found"],
      });
      logPreflightFailure({
        preflightCode: "preflight_lookup_failed",
        operation: "deletion_request_lookup",
        blockerCodes: summary.blockerCodes,
      });
      return {
        ok: false,
        code: "preflight_lookup_failed",
        summary,
      };
    }
    if (eligibility.code === "execution_in_progress" && request) {
      const targetUserId = resolveDeletionRequestTargetUserId({
        user_id: request.user_id,
        target_user_id_snapshot: request.target_user_id_snapshot,
      });
      if (!targetUserId) {
        const summary = preflightFailureSummary({
          operation: "deletion_request_lookup",
          blockerCodes: ["target_not_found"],
        });
        logPreflightFailure({
          preflightCode: "target_not_found",
          operation: "deletion_request_lookup",
          blockerCodes: summary.blockerCodes,
        });
        return { ok: false, code: "target_not_found", summary };
      }
      return {
        ok: true,
        code: "preflight_ready",
        requestId,
        targetUserId,
        summary: {
          operation: "preflight_complete",
          blockerCodes: [],
          childTablesWithQueryFailures: [],
          expectedStoryCount: null,
          nonAuthoritativeStoryCount: null,
        },
      };
    }
    const eligibilityCode = mapEligibilityFailure(eligibility.code);
    return {
      ok: false,
      code: eligibilityCode,
      summary: preflightFailureSummary({
        operation: "deletion_request_lookup",
        blockerCodes: [eligibility.code],
      }),
    };
  }

  const profile = await deps.loadProfile(eligibility.targetUserId);
  const privileged = validatePrivilegedTarget(profile);
  if (privileged.ok === false) {
    const summary = preflightFailureSummary({
      operation: "profile_lookup",
      blockerCodes: [privileged.code],
    });
    logPreflightFailure({
      preflightCode: privileged.code,
      operation: "profile_lookup",
      blockerCodes: summary.blockerCodes,
    });
    return { ok: false, code: privileged.code, summary };
  }

  const storyBatch = await deps.loadTargetStorySafetyBatch(eligibility.targetUserId);
  if (storyBatch.ok === false || storyBatch.blockers.length > 0) {
    const storyDiagnostics =
      summarizeStorySafetyInventoryPreflightDiagnostics(storyBatch);
    const summary = preflightFailureSummary({
      operation: "story_safety_inventory",
      blockerCodes: storyDiagnostics.blockerCodes,
      childTablesWithQueryFailures: storyDiagnostics.childTablesWithQueryFailures,
      expectedStoryCount: storyDiagnostics.expectedStoryCount,
      nonAuthoritativeStoryCount: storyDiagnostics.nonAuthoritativeStoryCount,
    });
    logPreflightFailure({
      preflightCode: "preflight_lookup_failed",
      operation: "story_safety_inventory",
      ...storyDiagnostics,
    });
    return { ok: false, code: "preflight_lookup_failed", summary };
  }

  const storyBlock = evaluateTargetOwnedStoriesForExecution(storyBatch);
  if (storyBlock) {
    const summary = preflightFailureSummary({
      operation: "story_lifecycle",
      blockerCodes: [storyBlock],
      expectedStoryCount: storyBatch.expectedStoryIds.length,
      nonAuthoritativeStoryCount: 0,
    });
    logPreflightFailure({
      preflightCode: storyBlock,
      operation: "story_lifecycle",
      blockerCodes: summary.blockerCodes,
      expectedStoryCount: summary.expectedStoryCount,
      nonAuthoritativeStoryCount: summary.nonAuthoritativeStoryCount,
    });
    return { ok: false, code: storyBlock, summary };
  }

  return {
    ok: true,
    code: "preflight_ready",
    requestId,
    targetUserId: eligibility.targetUserId,
    summary: preflightCompleteSummary(storyBatch),
  };
}

export const ACCOUNT_DELETION_EXECUTION_PREFLIGHT_TOCTOU_NOTE =
  "Pre-acquisition preflight reduces predictable failures but does not eliminate TOCTOU: target data may change before acquisition; write-freeze begins at deletion_in_progress; 3B.1 in-transaction safety preflight remains authoritative.";
