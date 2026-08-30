import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { AccountDeletionStoragePlan } from "./accountDeletionStoragePlan";
import {
  ACCOUNT_DELETION_STORAGE_DELETE_BATCH_SIZE,
  executeAccountDeletionStoragePlan,
  fingerprintStoragePath,
  validateStoragePlanForExecution,
} from "./accountDeletionStorageExecutor";

const TARGET = "11111111-1111-4111-8111-111111111111";

function buildPlan(
  overrides: Partial<AccountDeletionStoragePlan> = {}
): AccountDeletionStoragePlan {
  return {
    targetUserId: TARGET,
    requestId: "req-1",
    delete: [],
    preservePublic: [],
    preserveShared: [],
    blocked: [],
    skipped: [],
    warnings: [],
    journeyReferenceInventoryComplete: true,
    unresolvedJourneyReferenceCount: 0,
    journeyInventoryBlocked: false,
    ...overrides,
  };
}

describe("accountDeletionStorageExecutor", () => {
  it("refuses blocked plans and journey inventory incomplete plans", async () => {
    const blockedPlan = buildPlan({
      blocked: [
        {
          bucket: "journey-private-media",
          path: `${TARGET}/thread-1/object.mp4`,
          classification: "BLOCK_UNRESOLVED",
          manifestClassification: "BLOCK_UNRESOLVED",
          sourceType: "ambiguous_reference",
          sourceId: null,
          reason: "Unresolved ownership",
        },
      ],
    });

    expect(
      (await executeAccountDeletionStoragePlan({
        plan: blockedPlan,
        deps: { removeObjects: vi.fn() },
      })).result
    ).toBe("blocked");

    const incompleteInventoryPlan = buildPlan({
      journeyReferenceInventoryComplete: false,
      journeyInventoryBlocked: true,
      unresolvedJourneyReferenceCount: 1,
      delete: [
        {
          bucket: "journey-private-media",
          path: `${TARGET}/thread-1/object.mp4`,
          classification: "DELETE_PRIVATE",
          manifestClassification: "DELETE_PRIVATE",
          sourceType: "inbox_messages.user_id (recipient-owned)",
          sourceId: "msg-1",
          reason: "Private media",
        },
      ],
    });

    expect(
      validateStoragePlanForExecution(incompleteInventoryPlan).ok
    ).toBe(false);
  });

  it("requires server-side avatar verification instead of caller boolean", async () => {
    const avatarPlan = buildPlan({
      delete: [
        {
          bucket: "profile-avatars",
          path: `${TARGET}/avatar.png`,
          classification: "DELETE_PRIVATE",
          manifestClassification: "DELETE_PRIVATE",
          sourceType: "profiles.avatar_url",
          sourceId: TARGET,
          reason: "Avatar",
          requiresReferencesCleared: true,
        },
      ],
    });

    const withoutVerifier = await executeAccountDeletionStoragePlan({
      plan: avatarPlan,
      deps: { removeObjects: vi.fn() },
    });
    expect(withoutVerifier.result).toBe("refused");
    expect(withoutVerifier.avatarBlockedCount).toBe(1);

    const withFalseVerifier = await executeAccountDeletionStoragePlan({
      plan: avatarPlan,
      deps: {
        removeObjects: vi.fn(),
        verifyProfileAvatarReferencesCleared: vi.fn(async () => ({
          ok: true,
          verified: false,
          reason: "profiles.avatar_url still references this avatar object.",
        })),
      },
    });
    expect(withFalseVerifier.result).toBe("refused");

    const removeObjects = vi.fn(async () => ({
      outcomes: [
        {
          path: `${TARGET}/avatar.png`,
          outcome: "deleted_confirmed" as const,
        },
      ],
      error: null,
    }));

    const withTrueVerifier = await executeAccountDeletionStoragePlan({
      plan: avatarPlan,
      deps: {
        removeObjects,
        verifyProfileAvatarReferencesCleared: vi.fn(async () => ({
          ok: true,
          verified: true,
        })),
      },
    });
    expect(withTrueVerifier.result).toBe("success");
    expect(withTrueVerifier.deletedConfirmedCount).toBe(1);
  });

  it("deletes only DELETE_PRIVATE entries in approved buckets", async () => {
    const removeObjects = vi.fn(async (_bucket: string, paths: string[]) => ({
      outcomes: paths.map((path) => ({
        path,
        outcome: "deleted_confirmed" as const,
      })),
      error: null,
    }));

    const plan = buildPlan({
      delete: [
        {
          bucket: "journey-private-media",
          path: `${TARGET}/thread-1/object.mp4`,
          classification: "DELETE_PRIVATE",
          manifestClassification: "DELETE_PRIVATE",
          sourceType: "inbox_messages.user_id (recipient-owned)",
          sourceId: "msg-1",
          reason: "Recipient-owned private media",
        },
      ],
      preservePublic: [
        {
          bucket: "story-videos",
          path: `${TARGET}/public-story.webm`,
          classification: "PRESERVE_PUBLIC",
          manifestClassification: "PRESERVE_PUBLIC",
          sourceType: "stories.story-videos_url",
          sourceId: "story-1",
          reason: "Preserved testimony media",
        },
      ],
      preserveShared: [
        {
          bucket: "journey-private-media",
          path: `${TARGET}/shared/object.mp4`,
          classification: "PRESERVE_SHARED",
          manifestClassification: "PRESERVE_SHARED",
          sourceType: "inbox_messages.sender_user_id (sent copy in other inbox)",
          sourceId: "msg-2",
          reason: "Shared inbox copy",
        },
      ],
    });

    const result = await executeAccountDeletionStoragePlan({
      plan,
      deps: { removeObjects },
      actorUserId: "admin-1",
    });

    expect(result.success).toBe(true);
    expect(result.deletedConfirmedCount).toBe(1);
    expect(removeObjects).toHaveBeenCalledTimes(1);
    expect(result.preservedCount).toBe(2);
  });

  it("uses bounded batches and honest not-confirmed handling", async () => {
    const removeObjects = vi
      .fn()
      .mockResolvedValueOnce({
        outcomes: [
          {
            path: `${TARGET}/thread-1/object.mp4`,
            outcome: "deleted_confirmed",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        outcomes: [
          {
            path: `${TARGET}/thread-1/object.mp4`,
            outcome: "operation_succeeded_not_confirmed",
          },
        ],
        error: null,
      });

    const plan = buildPlan({
      delete: [
        {
          bucket: "journey-private-media",
          path: `${TARGET}/thread-1/object.mp4`,
          classification: "DELETE_PRIVATE",
          manifestClassification: "DELETE_PRIVATE",
          sourceType: "inbox_messages.user_id (recipient-owned)",
          sourceId: "msg-1",
          reason: "Private media",
        },
      ],
    });

    const first = await executeAccountDeletionStoragePlan({
      plan,
      deps: { removeObjects },
    });
    const second = await executeAccountDeletionStoragePlan({
      plan,
      deps: { removeObjects },
    });

    expect(first.deletedConfirmedCount).toBe(1);
    expect(second.operationSucceededNotConfirmedCount).toBe(1);

    const deleteEntries = Array.from({ length: 120 }, (_, index) => ({
      bucket: "journey-private-media",
      path: `${TARGET}/thread-${index}/object.mp4`,
      classification: "DELETE_PRIVATE" as const,
      manifestClassification: "DELETE_PRIVATE" as const,
      sourceType: "inbox_messages.user_id (recipient-owned)",
      sourceId: `msg-${index}`,
      reason: "Private media",
    }));

    const batchRemove = vi.fn(async (_bucket: string, paths: string[]) => ({
      outcomes: paths.map((path) => ({
        path,
        outcome: "deleted_confirmed" as const,
      })),
      error: null,
    }));

    await executeAccountDeletionStoragePlan({
      plan: buildPlan({ delete: deleteEntries }),
      deps: { removeObjects: batchRemove },
      batchSize: ACCOUNT_DELETION_STORAGE_DELETE_BATCH_SIZE,
    });

    expect(batchRemove).toHaveBeenCalledTimes(3);
  });

  it("reports partial failure without broad prefix fallback", async () => {
    const removeObjects = vi.fn(async () => ({
      data: null,
      error: { message: "storage remove failed" },
    }));

    const result = await executeAccountDeletionStoragePlan({
      plan: buildPlan({
        delete: [
          {
            bucket: "journey-private-media",
            path: `${TARGET}/thread-1/object.mp4`,
            classification: "DELETE_PRIVATE",
            manifestClassification: "DELETE_PRIVATE",
            sourceType: "inbox_messages.user_id (recipient-owned)",
            sourceId: "msg-1",
            reason: "Private media",
          },
        ],
      }),
      deps: { removeObjects },
    });

    expect(result.success).toBe(false);
    expect(result.result).toBe("partial_failure");
    expect(result.failures[0]?.pathFingerprint).toBe(
      fingerprintStoragePath(`${TARGET}/thread-1/object.mp4`)
    );
  });
});

describe("storage executor isolation", () => {
  it("is not imported by live execute handler or route", () => {
    const executeHandler = readFileSync(
      "lib/server/accountDeletionExecuteHandler.ts",
      "utf8"
    );
    const executeRoute = readFileSync(
      "app/api/admin/account-deletion/[requestId]/execute/route.ts",
      "utf8"
    );

    expect(executeHandler).not.toContain("accountDeletionStorageExecutor");
    expect(executeRoute).not.toContain("accountDeletionStorageExecutor");
    expect(executeHandler).not.toContain(".remove(");
  });
});
