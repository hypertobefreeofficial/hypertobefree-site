import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ACCOUNT_DELETION_STATUS } from "../accountCenter/accountDeletionLifecycle";
import type { AccountDeletionExecutionRequestRow } from "./accountDeletionExecutor";
import {
  runAccountDeletionExecutionPreflight,
  type AccountDeletionExecutionPreflightDeps,
} from "./accountDeletionExecutionPreflight";
import type { TargetStorySafetyInventoryBatch } from "./accountDeletionStorySafetyInventory";
import type { StoryDeletionSafetyInventory } from "./accountDeletionStoryLifecycle";
import { emptyStoryDeletionChildInventory } from "./accountDeletionStoryLifecycle";

const REQUEST = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STORY_A = "11111111-1111-4111-8111-111111111111";
const STORY_B = "22222222-2222-4222-8222-222222222222";

function approvedRequest(
  overrides: Partial<AccountDeletionExecutionRequestRow> = {}
): AccountDeletionExecutionRequestRow {
  return {
    id: REQUEST,
    user_id: TARGET,
    email: "target@example.test",
    status: ACCOUNT_DELETION_STATUS.APPROVED,
    target_user_id_snapshot: TARGET,
    execution_started_at: null,
    ...overrides,
  };
}

function storyInventory(
  overrides: Partial<StoryDeletionSafetyInventory> = {}
): StoryDeletionSafetyInventory {
  return {
    storyId: STORY_A,
    targetUserId: TARGET,
    ownershipVerified: true,
    status: "approved",
    removedAt: null,
    lifecycle: "LIVE_PUBLIC",
    queriesComplete: true,
    blockers: [],
    dependencies: {} as StoryDeletionSafetyInventory["dependencies"],
    fingerprint: "fp-a",
    childInventory: {
      ...emptyStoryDeletionChildInventory(),
      inventoryComplete: true,
    },
    ...overrides,
  };
}

function okBatch(
  inventories: StoryDeletionSafetyInventory[]
): TargetStorySafetyInventoryBatch {
  return {
    ok: true,
    targetUserId: TARGET,
    expectedStoryIds: inventories.map((row) => row.storyId),
    inventories,
    blockers: [],
    fingerprint: "batch-fp",
  };
}

function createDeps(
  overrides: Partial<AccountDeletionExecutionPreflightDeps> = {}
): AccountDeletionExecutionPreflightDeps {
  return {
    loadDeletionRequest: vi.fn(async () => approvedRequest()),
    loadProfile: vi.fn(async () => ({
      id: TARGET,
      is_owner: false,
      is_admin: false,
    })),
    loadTargetStorySafetyBatch: vi.fn(async () =>
      okBatch([storyInventory()])
    ),
    ...overrides,
  };
}

describe("runAccountDeletionExecutionPreflight", () => {
  it("PF-A: approved ordinary user, supported stories → preflight_ready", async () => {
    const result = await runAccountDeletionExecutionPreflight({
      requestId: REQUEST,
      deps: createDeps(),
    });
    expect(result).toEqual({
      ok: true,
      code: "preflight_ready",
      requestId: REQUEST,
      targetUserId: TARGET,
    });
  });

  it("PF-B2: deletion_in_progress → preflight_ready for orchestration resume", async () => {
    const loadProfile = vi.fn();
    const loadTargetStorySafetyBatch = vi.fn();
    const result = await runAccountDeletionExecutionPreflight({
      requestId: REQUEST,
      deps: createDeps({
        loadDeletionRequest: vi.fn(async () =>
          approvedRequest({ status: ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS })
        ),
        loadProfile,
        loadTargetStorySafetyBatch,
      }),
    });
    expect(result).toEqual({
      ok: true,
      code: "preflight_ready",
      requestId: REQUEST,
      targetUserId: TARGET,
    });
    expect(loadProfile).not.toHaveBeenCalled();
    expect(loadTargetStorySafetyBatch).not.toHaveBeenCalled();
  });

  it("PF-B: request not approved → request_not_approved", async () => {
    const result = await runAccountDeletionExecutionPreflight({
      requestId: REQUEST,
      deps: createDeps({
        loadDeletionRequest: vi.fn(async () =>
          approvedRequest({ status: ACCOUNT_DELETION_STATUS.SUBMITTED })
        ),
      }),
    });
    expect(result).toEqual({ ok: false, code: "request_not_approved" });
  });

  it("PF-C: target missing → target_not_found", async () => {
    const result = await runAccountDeletionExecutionPreflight({
      requestId: REQUEST,
      deps: createDeps({
        loadDeletionRequest: vi.fn(async () =>
          approvedRequest({
            user_id: null,
            target_user_id_snapshot: null,
          })
        ),
      }),
    });
    expect(result).toEqual({ ok: false, code: "target_not_found" });
  });

  it("PF-D: target owner/founder → blocked_owner", async () => {
    const result = await runAccountDeletionExecutionPreflight({
      requestId: REQUEST,
      deps: createDeps({
        loadProfile: vi.fn(async () => ({
          id: TARGET,
          is_owner: true,
          is_admin: false,
        })),
      }),
    });
    expect(result).toEqual({ ok: false, code: "blocked_owner" });
  });

  it("PF-E: target admin → blocked_admin", async () => {
    const result = await runAccountDeletionExecutionPreflight({
      requestId: REQUEST,
      deps: createDeps({
        loadProfile: vi.fn(async () => ({
          id: TARGET,
          is_owner: false,
          is_admin: true,
        })),
      }),
    });
    expect(result).toEqual({ ok: false, code: "blocked_admin" });
  });

  it("PF-F: pending never-published story → unsupported_story_lifecycle", async () => {
    const result = await runAccountDeletionExecutionPreflight({
      requestId: REQUEST,
      deps: createDeps({
        loadTargetStorySafetyBatch: vi.fn(async () =>
          okBatch([
            storyInventory({ status: "pending", removedAt: null, lifecycle: "NEVER_PUBLISHED" }),
          ])
        ),
      }),
    });
    expect(result).toEqual({ ok: false, code: "unsupported_story_lifecycle" });
  });

  it("PF-G: submitted never-published story → unsupported_story_lifecycle", async () => {
    const result = await runAccountDeletionExecutionPreflight({
      requestId: REQUEST,
      deps: createDeps({
        loadTargetStorySafetyBatch: vi.fn(async () =>
          okBatch([
            storyInventory({ status: "submitted", removedAt: null, lifecycle: "NEVER_PUBLISHED" }),
          ])
        ),
      }),
    });
    expect(result).toEqual({ ok: false, code: "unsupported_story_lifecycle" });
  });

  it("PF-H: removed pending/submitted story allowed per 3B.1 semantics", async () => {
    const result = await runAccountDeletionExecutionPreflight({
      requestId: REQUEST,
      deps: createDeps({
        loadTargetStorySafetyBatch: vi.fn(async () =>
          okBatch([
            storyInventory({
              status: "pending",
              removedAt: "2026-01-01T00:00:00.000Z",
              lifecycle: "PREVIOUSLY_PUBLIC_OR_REMOVED",
            }),
          ])
        ),
      }),
    });
    expect(result.ok).toBe(true);
  });

  it("PF-I: supported published story → allowed", async () => {
    const result = await runAccountDeletionExecutionPreflight({
      requestId: REQUEST,
      deps: createDeps({
        loadTargetStorySafetyBatch: vi.fn(async () =>
          okBatch([storyInventory({ status: "approved", removedAt: null })])
        ),
      }),
    });
    expect(result.ok).toBe(true);
  });

  it("PF-J: multiple stories, one unsupported → block entire request", async () => {
    const result = await runAccountDeletionExecutionPreflight({
      requestId: REQUEST,
      deps: createDeps({
        loadTargetStorySafetyBatch: vi.fn(async () =>
          okBatch([
            storyInventory({ storyId: STORY_A, status: "approved", removedAt: null }),
            storyInventory({
              storyId: STORY_B,
              status: "pending",
              removedAt: null,
              lifecycle: "NEVER_PUBLISHED",
            }),
          ])
        ),
      }),
    });
    expect(result).toEqual({ ok: false, code: "unsupported_story_lifecycle" });
  });

  it("PF-K: DB lookup failure → fail closed", async () => {
    const result = await runAccountDeletionExecutionPreflight({
      requestId: REQUEST,
      deps: createDeps({
        loadDeletionRequest: vi.fn(async () => null),
      }),
    });
    expect(result).toEqual({ ok: false, code: "preflight_lookup_failed" });
  });

  it("PF-L: story batch not authoritative → preflight_lookup_failed", async () => {
    const result = await runAccountDeletionExecutionPreflight({
      requestId: REQUEST,
      deps: createDeps({
        loadTargetStorySafetyBatch: vi.fn(async () => ({
          ok: false,
          targetUserId: TARGET,
          expectedStoryIds: [],
          inventories: [],
          blockers: [{ code: "TARGET_STORY_LIST_QUERY_FAILED", reason: "" }],
          fingerprint: "fp",
        })),
      }),
    });
    expect(result).toEqual({ ok: false, code: "preflight_lookup_failed" });
  });

  it("PF-M: preflight resolves target only from deletion request", async () => {
    const loadProfile = vi.fn(async () => ({
      id: TARGET,
      is_owner: false,
      is_admin: false,
    }));
    const loadTargetStorySafetyBatch = vi.fn(async () =>
      okBatch([storyInventory()])
    );

    await runAccountDeletionExecutionPreflight({
      requestId: REQUEST,
      deps: createDeps({ loadProfile, loadTargetStorySafetyBatch }),
    });

    expect(loadProfile).toHaveBeenCalledWith(TARGET);
    expect(loadTargetStorySafetyBatch).toHaveBeenCalledWith(TARGET);
  });

  it("PF-N: preflight performs NO mutation calls", async () => {
    const source = readFileSync(
      "lib/server/accountDeletionExecutionPreflight.ts",
      "utf8"
    );
    expect(source).not.toMatch(/\bUPDATE\b|\bINSERT\b|\bDELETE\b/);
    expect(source).not.toContain(".rpc(");
    expect(source).not.toContain("signOut");
    expect(source).not.toContain("executeAccountDeletionNondestructiveDatabaseStage");
    expect(source).not.toContain("acquireAccountDeletionExecutionLock");
  });
});
