import type {
  StoryDeletionSafetyBlocker,
  StoryDeletionSafetyInventory,
} from "./accountDeletionStoryLifecycle";
import type { TargetStorySafetyInventoryBatch } from "./accountDeletionStorySafetyInventory";

/**
 * Preflight failure paths (read-only, fail-closed):
 * - deletion_request_lookup: account_deletion_requests SELECT failed or row missing → preflight_lookup_failed
 * - profile_lookup: profiles SELECT failed (null row does not block privileged targets)
 * - story_safety_inventory: target-owned story list / per-story child dependency SELECTs → preflight_lookup_failed when batch not authoritative
 * - story_lifecycle: supported lifecycle rules → unsupported_story_lifecycle (orchestrator: execution_preflight_blocked)
 * Schema readiness and acquisition run only after preflight passes (separate orchestrator codes).
 */

export type AccountDeletionPreflightFailureOperation =
  | "deletion_request_lookup"
  | "profile_lookup"
  | "story_safety_inventory"
  | "story_lifecycle";

export type AccountDeletionPreflightFailureDiagnostics = {
  phase: "execution_preflight";
  preflightCode: string;
  operation: AccountDeletionPreflightFailureOperation;
  blockerCodes: readonly string[];
  childTablesWithQueryFailures: readonly string[];
  expectedStoryCount: number | null;
  nonAuthoritativeStoryCount: number | null;
};

const CHILD_QUERY_FAILURE_TABLE_RE =
  /^([a-z_]+) inventory query failed\b/;

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function childTableFromBlocker(blocker: StoryDeletionSafetyBlocker): string | null {
  if (blocker.code !== "STORY_CHILD_QUERY_FAILED") {
    return null;
  }
  const match = blocker.reason.trim().match(CHILD_QUERY_FAILURE_TABLE_RE);
  return match?.[1] ?? null;
}

function collectChildTablesFromInventory(
  inventory: StoryDeletionSafetyInventory
): string[] {
  const tables: string[] = [];
  for (const blocker of inventory.blockers) {
    const table = childTableFromBlocker(blocker);
    if (table) {
      tables.push(table);
    }
  }
  return tables;
}

function isInventoryNonAuthoritative(inventory: StoryDeletionSafetyInventory): boolean {
  return (
    !inventory.ownershipVerified ||
    !inventory.queriesComplete ||
    inventory.blockers.length > 0 ||
    !inventory.childInventory.inventoryComplete
  );
}

export function summarizeStorySafetyInventoryPreflightDiagnostics(
  batch: TargetStorySafetyInventoryBatch
): Omit<
  AccountDeletionPreflightFailureDiagnostics,
  "phase" | "preflightCode"
> {
  const batchBlockerCodes = batch.blockers.map((entry) => entry.code);
  const childTables: string[] = [];
  let nonAuthoritativeStoryCount = 0;

  for (const inventory of batch.inventories) {
    if (isInventoryNonAuthoritative(inventory)) {
      nonAuthoritativeStoryCount += 1;
    }
    childTables.push(...collectChildTablesFromInventory(inventory));
  }

  const blockerCodes = uniqueSorted([
    ...batchBlockerCodes,
    ...(batch.ok === false && batchBlockerCodes.length === 0
      ? ["STORY_SAFETY_BATCH_NOT_OK"]
      : []),
  ]);

  return {
    operation: "story_safety_inventory",
    blockerCodes,
    childTablesWithQueryFailures: uniqueSorted(childTables),
    expectedStoryCount: batch.expectedStoryIds.length,
    nonAuthoritativeStoryCount,
  };
}

export function logAccountDeletionPreflightFailure(
  diagnostics: AccountDeletionPreflightFailureDiagnostics
): void {
  console.info("[account-deletion-preflight]", {
    phase: diagnostics.phase,
    preflightCode: diagnostics.preflightCode,
    operation: diagnostics.operation,
    blockerCodes: diagnostics.blockerCodes,
    childTablesWithQueryFailures: diagnostics.childTablesWithQueryFailures,
    expectedStoryCount: diagnostics.expectedStoryCount,
    nonAuthoritativeStoryCount: diagnostics.nonAuthoritativeStoryCount,
  });
}
