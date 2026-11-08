import { describe, expect, it, vi } from "vitest";
import {
  logAccountDeletionPreflightFailure,
  summarizeStorySafetyInventoryPreflightDiagnostics,
} from "./accountDeletionExecutionPreflightDiagnostics";
import type { TargetStorySafetyInventoryBatch } from "./accountDeletionStorySafetyInventory";
import {
  emptyStoryDeletionChildInventory,
  type StoryDeletionSafetyInventory,
} from "./accountDeletionStoryLifecycle";

const TARGET = "11111111-1111-4111-8111-111111111111";
const STORY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function baseInventory(
  overrides: Partial<StoryDeletionSafetyInventory> = {}
): StoryDeletionSafetyInventory {
  return {
    storyId: STORY,
    targetUserId: TARGET,
    ownershipVerified: true,
    status: "approved",
    removedAt: null,
    lifecycle: "LIVE_PUBLIC",
    queriesComplete: true,
    blockers: [],
    dependencies: {} as StoryDeletionSafetyInventory["dependencies"],
    fingerprint: "fp",
    childInventory: { ...emptyStoryDeletionChildInventory(), inventoryComplete: true },
    ...overrides,
  };
}

function batch(
  overrides: Partial<TargetStorySafetyInventoryBatch> = {}
): TargetStorySafetyInventoryBatch {
  return {
    ok: true,
    targetUserId: TARGET,
    expectedStoryIds: [STORY],
    inventories: [baseInventory()],
    blockers: [],
    fingerprint: "batch-fp",
    ...overrides,
  };
}

describe("summarizeStorySafetyInventoryPreflightDiagnostics", () => {
  it("extracts child table from STORY_CHILD_QUERY_FAILED without story identifiers", () => {
    const summary = summarizeStorySafetyInventoryPreflightDiagnostics(
      batch({
        ok: false,
        blockers: [{ code: "STORY_INVENTORY_NOT_AUTHORITATIVE", reason: "x" }],
        inventories: [
          baseInventory({
            queriesComplete: false,
            blockers: [
              {
                code: "STORY_CHILD_QUERY_FAILED",
                reason: "content_reports inventory query failed — cannot authorize deletion.",
              },
            ],
          }),
        ],
      })
    );

    expect(summary.operation).toBe("story_safety_inventory");
    expect(summary.childTablesWithQueryFailures).toEqual(["content_reports"]);
    expect(summary.nonAuthoritativeStoryCount).toBe(1);
    expect(summary.expectedStoryCount).toBe(1);
    expect(
      JSON.stringify(summary).match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
      )
    ).toBeNull();
  });

  it("records list query failure blocker codes", () => {
    const summary = summarizeStorySafetyInventoryPreflightDiagnostics(
      batch({
        ok: false,
        expectedStoryIds: [],
        inventories: [],
        blockers: [{ code: "TARGET_STORY_LIST_QUERY_FAILED", reason: "" }],
      })
    );
    expect(summary.blockerCodes).toContain("TARGET_STORY_LIST_QUERY_FAILED");
    expect(summary.expectedStoryCount).toBe(0);
  });
});

describe("logAccountDeletionPreflightFailure", () => {
  it("logs structured diagnostics without private identifiers", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    logAccountDeletionPreflightFailure({
      phase: "execution_preflight",
      preflightCode: "preflight_lookup_failed",
      operation: "story_safety_inventory",
      blockerCodes: ["STORY_INVENTORY_NOT_AUTHORITATIVE"],
      childTablesWithQueryFailures: ["story_reactions"],
      expectedStoryCount: 49,
      nonAuthoritativeStoryCount: 2,
    });

    expect(spy).toHaveBeenCalledOnce();
    const payload = spy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.operation).toBe("story_safety_inventory");
    expect(payload.childTablesWithQueryFailures).toEqual(["story_reactions"]);
    expect(payload).not.toHaveProperty("requestId");
    expect(payload).not.toHaveProperty("targetUserId");
    spy.mockRestore();
  });
});
