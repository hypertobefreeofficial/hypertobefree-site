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

export type AccountDeletionExecutionPreflightResult =
  | {
      ok: true;
      code: AccountDeletionExecutionPreflightSuccessCode;
      requestId: string;
      targetUserId: string;
    }
  | {
      ok: false;
      code: AccountDeletionExecutionPreflightFailureCode;
    };

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
    if (eligibility.code === "execution_in_progress" && request) {
      const targetUserId = resolveDeletionRequestTargetUserId({
        user_id: request.user_id,
        target_user_id_snapshot: request.target_user_id_snapshot,
      });
      if (!targetUserId) {
        return { ok: false, code: "target_not_found" };
      }
      return {
        ok: true,
        code: "preflight_ready",
        requestId,
        targetUserId,
      };
    }
    return { ok: false, code: mapEligibilityFailure(eligibility.code) };
  }

  const profile = await deps.loadProfile(eligibility.targetUserId);
  const privileged = validatePrivilegedTarget(profile);
  if (privileged.ok === false) {
    return { ok: false, code: privileged.code };
  }

  const storyBatch = await deps.loadTargetStorySafetyBatch(eligibility.targetUserId);
  if (storyBatch.ok === false || storyBatch.blockers.length > 0) {
    return { ok: false, code: "preflight_lookup_failed" };
  }

  const storyBlock = evaluateTargetOwnedStoriesForExecution(storyBatch);
  if (storyBlock) {
    return { ok: false, code: storyBlock };
  }

  return {
    ok: true,
    code: "preflight_ready",
    requestId,
    targetUserId: eligibility.targetUserId,
  };
}

export const ACCOUNT_DELETION_EXECUTION_PREFLIGHT_TOCTOU_NOTE =
  "Pre-acquisition preflight reduces predictable failures but does not eliminate TOCTOU: target data may change before acquisition; write-freeze begins at deletion_in_progress; 3B.1 in-transaction safety preflight remains authoritative.";
