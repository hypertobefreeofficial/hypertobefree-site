import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { buildAccountDeletionDatabasePlan } from "./accountDeletionDatabasePlan";
import type { AccountDeletionManifest } from "./accountDeletionManifest";
import {
  evaluateNeverPublishedStoryDeletionEligibility,
  planStoryDeletionDecision,
  storySafetyInventoryToPlanningInput,
} from "./accountDeletionStoryLifecycle";
import {
  buildChildInventoryFromDependencies,
  computeStorySafetyInventoryFingerprint,
  computeTargetStorySafetyInventoryBatchFingerprint,
  createStorySafetyInventoryQueryDeps,
  loadStoryDeletionSafetyInventory,
  loadTargetOwnedStorySafetyInventories,
  STORY_LINKED_DEPENDENCY_TABLES,
  STORY_SAFETY_INVENTORY_FINGERPRINT_NOTE,
  validateTargetStorySafetyInventoryBatchForPlanning,
  type StorySafetyInventoryQueryDeps,
  type TargetStorySafetyInventoryBatch,
} from "./accountDeletionStorySafetyInventory";
import {
  emptyStoryDeletionChildInventory,
  type StoryDeletionSafetyInventory,
} from "./accountDeletionStoryLifecycle";
import { isAccountDeletionExecutionEnabled } from "./accountDeletionExecutionPolicy";

const TARGET = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const STORY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function storyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: STORY,
    user_id: TARGET,
    status: "pending",
    removed_at: null,
    ...overrides,
  };
}

function okRows<T>(rows: T[]) {
  return { ok: true as const, rows };
}

function queryError() {
  return { ok: false as const, error: true as const };
}

function createDeps(
  overrides: Partial<StorySafetyInventoryQueryDeps> = {}
): StorySafetyInventoryQueryDeps {
  const empty = () => okRows([]);
  return {
    loadStoryOwnership: vi.fn(async () => ({
      ok: true as const,
      row: storyRow(),
    })),
    loadPrayerVideoResponses: vi.fn(async () => empty()),
    loadPrayerWrittenResponses: vi.fn(async () => empty()),
    loadPrayerUpdates: vi.fn(async () => empty()),
    loadStoryVideoReplies: vi.fn(async () => empty()),
    loadContentReports: vi.fn(async () => empty()),
    loadStoryReactions: vi.fn(async () => empty()),
    loadSavedContent: vi.fn(async () => empty()),
    loadPrayerFollows: vi.fn(async () => empty()),
    listTargetOwnedStoryIds: vi.fn(async () => ({
      ok: true as const,
      storyIds: [STORY],
    })),
    ...overrides,
  };
}

const STORY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function loadAuthoritativeBatch(
  overrides: Partial<StorySafetyInventoryQueryDeps> = {}
) {
  return loadTargetOwnedStorySafetyInventories(TARGET, createDeps(overrides));
}

function minimalManifest(): AccountDeletionManifest {
  return {
    identity: {
      requestId: "req-1",
      targetUserId: TARGET,
      username: "member",
      displayName: "Member",
      email: "member@example.com",
      requestStatus: "approved",
      requestCreatedAt: "2026-01-01T00:00:00.000Z",
      authUserExists: true,
      isOwner: false,
      isAdmin: false,
    },
    blocked: false,
    blockCode: null,
    database: {
      hardDelete: [],
      anonymize: [{ table: "stories", count: 1, plannedAction: "anonymize" }],
      preserve: [],
      manualReview: [],
    },
    storage: { objects: [] },
    journey: {
      recipientOwnedRows: { table: "inbox_messages", count: 0, plannedAction: "hard_delete" },
      sentToOtherUserRows: {
        table: "inbox_messages",
        count: 0,
        plannedAction: "preserve_anonymized",
      },
      privateMediaObjects: [],
      relationshipNotes: [],
      journeyReferenceInventoryComplete: true,
      unresolvedJourneyReferenceCount: 0,
    },
    publicContent: { stories: [], profileFieldsToStrip: [] },
    audit: { retain: [], deletionRequestRetentionWarning: "" },
    warnings: [],
    schemaRequirements: [],
    counts: {
      hardDeleteRows: 0,
      anonymizeRows: 0,
      preserveRows: 0,
      manualReviewRows: 0,
      storageObjects: 0,
      unresolvedWarnings: 0,
    },
  };
}

describe("story dependency discovery", () => {
  it("documents all story_id FK tables from Production baseline", () => {
    expect(STORY_LINKED_DEPENDENCY_TABLES).toEqual([
      "prayer_video_responses",
      "prayer_written_responses",
      "prayer_updates",
      "story_video_replies",
      "story_reactions",
      "saved_content",
      "prayer_follows",
      "content_reports",
    ]);
  });
});

describe("loadStoryDeletionSafetyInventory ownership", () => {
  it("verifies correct target-owned story", async () => {
    const inventory = await loadStoryDeletionSafetyInventory(
      STORY,
      TARGET,
      createDeps()
    );
    expect(inventory.ownershipVerified).toBe(true);
    expect(inventory.queriesComplete).toBe(true);
    expect(inventory.lifecycle).toBe("NEVER_PUBLISHED");
    expect(inventory.childInventory.inventoryComplete).toBe(true);
  });

  it("blocks wrong owner", async () => {
    const inventory = await loadStoryDeletionSafetyInventory(
      STORY,
      TARGET,
      createDeps({
        loadStoryOwnership: vi.fn(async () => ({
          ok: true,
          row: storyRow({ user_id: OTHER }),
        })),
      })
    );
    expect(inventory.ownershipVerified).toBe(false);
    expect(inventory.queriesComplete).toBe(false);
    expect(inventory.blockers.some((b) => b.code === "STORY_OWNERSHIP_MISMATCH")).toBe(
      true
    );
  });

  it("blocks NULL owner", async () => {
    const inventory = await loadStoryDeletionSafetyInventory(
      STORY,
      TARGET,
      createDeps({
        loadStoryOwnership: vi.fn(async () => ({
          ok: true,
          row: storyRow({ user_id: null }),
        })),
      })
    );
    expect(inventory.blockers.some((b) => b.code === "STORY_NULL_OWNER")).toBe(true);
  });

  it("blocks story not found", async () => {
    const inventory = await loadStoryDeletionSafetyInventory(
      STORY,
      TARGET,
      createDeps({
        loadStoryOwnership: vi.fn(async () => ({
          ok: false,
          reason: "not_found",
        })),
      })
    );
    expect(inventory.blockers.some((b) => b.code === "STORY_NOT_FOUND")).toBe(true);
    expect(inventory.dependencies.prayerVideoResponses.querySucceeded).toBe(false);
  });

  it("blocks ownership query error without loading children as zero-truth", async () => {
    const loadPrayerVideoResponses = vi.fn(async () => okRows([]));
    const inventory = await loadStoryDeletionSafetyInventory(
      STORY,
      TARGET,
      createDeps({
        loadStoryOwnership: vi.fn(async () => ({
          ok: false,
          reason: "query_error",
        })),
        loadPrayerVideoResponses,
      })
    );
    expect(inventory.blockers.some((b) => b.code === "STORY_OWNERSHIP_QUERY_FAILED")).toBe(
      true
    );
    expect(loadPrayerVideoResponses).not.toHaveBeenCalled();
  });
});

describe("loadStoryDeletionSafetyInventory lifecycle", () => {
  it("classifies LIVE_PUBLIC and never hard-deletes via planning", async () => {
    const inventory = await loadStoryDeletionSafetyInventory(
      STORY,
      TARGET,
      createDeps({
        loadStoryOwnership: vi.fn(async () => ({
          ok: true,
          row: storyRow({ status: "approved", removed_at: null }),
        })),
      })
    );
    expect(inventory.lifecycle).toBe("LIVE_PUBLIC");
    const decision = planStoryDeletionDecision(
      storySafetyInventoryToPlanningInput(inventory)
    );
    expect(decision.action).toBe("ANONYMIZE");
    expect(decision.action).not.toBe("HARD_DELETE");
  });

  it("classifies PREVIOUSLY_PUBLIC_OR_REMOVED as tombstone preserve", async () => {
    const inventory = await loadStoryDeletionSafetyInventory(
      STORY,
      TARGET,
      createDeps({
        loadStoryOwnership: vi.fn(async () => ({
          ok: true,
          row: storyRow({
            status: "removed",
            removed_at: "2026-01-01T00:00:00.000Z",
          }),
        })),
      })
    );
    expect(inventory.lifecycle).toBe("PREVIOUSLY_PUBLIC_OR_REMOVED");
    const decision = planStoryDeletionDecision(
      storySafetyInventoryToPlanningInput(inventory)
    );
    expect(decision.action).toBe("ANONYMIZE_TOMBSTONE");
  });

  it("allows NEVER_PUBLISHED hard-delete eligibility only with complete clean inventory", async () => {
    const inventory = await loadStoryDeletionSafetyInventory(
      STORY,
      TARGET,
      createDeps()
    );
    const decision = planStoryDeletionDecision(
      storySafetyInventoryToPlanningInput(inventory)
    );
    expect(decision.action).toBe("HARD_DELETE");
  });

  it("blocks UNKNOWN lifecycle", async () => {
    const inventory = await loadStoryDeletionSafetyInventory(
      STORY,
      TARGET,
      createDeps({
        loadStoryOwnership: vi.fn(async () => ({
          ok: true,
          row: storyRow({ status: "legacy-unknown" }),
        })),
      })
    );
    expect(inventory.lifecycle).toBe("UNKNOWN");
    const decision = planStoryDeletionDecision(
      storySafetyInventoryToPlanningInput(inventory)
    );
    expect(decision.action).toBe("BLOCK_UNRESOLVED");
  });
});

describe("loadStoryDeletionSafetyInventory third-party and ambiguous children", () => {
  it("blocks third-party prayer video response", async () => {
    const inventory = await loadStoryDeletionSafetyInventory(
      STORY,
      TARGET,
      createDeps({
        loadPrayerVideoResponses: vi.fn(async () =>
          okRows([{ user_id: OTHER }])
        ),
      })
    );
    expect(inventory.dependencies.prayerVideoResponses.thirdPartyAuthored).toBe(1);
    const decision = planStoryDeletionDecision(
      storySafetyInventoryToPlanningInput(inventory)
    );
    expect(decision.action).toBe("BLOCK_UNRESOLVED");
  });

  it("blocks third-party written response", async () => {
    const inventory = await loadStoryDeletionSafetyInventory(
      STORY,
      TARGET,
      createDeps({
        loadPrayerWrittenResponses: vi.fn(async () =>
          okRows([{ author_user_id: OTHER }])
        ),
      })
    );
    const decision = planStoryDeletionDecision(
      storySafetyInventoryToPlanningInput(inventory)
    );
    expect(decision.action).toBe("BLOCK_UNRESOLVED");
  });

  it("blocks third-party prayer update", async () => {
    const inventory = await loadStoryDeletionSafetyInventory(
      STORY,
      TARGET,
      createDeps({
        loadPrayerUpdates: vi.fn(async () =>
          okRows([{ author_user_id: OTHER }])
        ),
      })
    );
    const decision = planStoryDeletionDecision(
      storySafetyInventoryToPlanningInput(inventory)
    );
    expect(decision.action).toBe("BLOCK_UNRESOLVED");
  });

  it("blocks cross-user story_video_reply", async () => {
    const inventory = await loadStoryDeletionSafetyInventory(
      STORY,
      TARGET,
      createDeps({
        loadStoryVideoReplies: vi.fn(async () =>
          okRows([{ user_id: TARGET, recipient_user_id: OTHER }])
        ),
      })
    );
    expect(inventory.dependencies.storyVideoReplies.crossUser).toBe(1);
    const decision = planStoryDeletionDecision(
      storySafetyInventoryToPlanningInput(inventory)
    );
    expect(decision.action).toBe("BLOCK_UNRESOLVED");
  });

  it("blocks NULL participant story_video_reply", async () => {
    const inventory = await loadStoryDeletionSafetyInventory(
      STORY,
      TARGET,
      createDeps({
        loadStoryVideoReplies: vi.fn(async () =>
          okRows([{ user_id: TARGET, recipient_user_id: null }])
        ),
      })
    );
    expect(inventory.dependencies.storyVideoReplies.ambiguousParticipant).toBe(1);
    const decision = planStoryDeletionDecision(
      storySafetyInventoryToPlanningInput(inventory)
    );
    expect(decision.action).toBe("BLOCK_UNRESOLVED");
  });

  it("flags content reports and blocks hard delete", async () => {
    const inventory = await loadStoryDeletionSafetyInventory(
      STORY,
      TARGET,
      createDeps({
        loadContentReports: vi.fn(async () => okRows([{ id: "report-1" }])),
      })
    );
    expect(inventory.dependencies.contentReports.total).toBe(1);
    expect(
      inventory.blockers.some((b) => b.code === "STORY_REPORT_DETACH_REQUIRED")
    ).toBe(true);
    expect(inventory.childInventory.reportEvidencePreservedBeforeStoryDelete).toBe(
      false
    );
    const decision = planStoryDeletionDecision(
      storySafetyInventoryToPlanningInput(inventory)
    );
    expect(decision.action).toBe("BLOCK_UNRESOLVED");
  });

  it("blocks NULL author prayer video response", async () => {
    const inventory = await loadStoryDeletionSafetyInventory(
      STORY,
      TARGET,
      createDeps({
        loadPrayerVideoResponses: vi.fn(async () => okRows([{ user_id: null }])),
      })
    );
    expect(inventory.childInventory.nullAuthorPrayerVideoResponseCount).toBe(1);
    const decision = planStoryDeletionDecision(
      storySafetyInventoryToPlanningInput(inventory)
    );
    expect(decision.action).toBe("BLOCK_UNRESOLVED");
  });
});

describe("loadStoryDeletionSafetyInventory query failures", () => {
  const failureCases: Array<{
    name: string;
    override: Partial<StorySafetyInventoryQueryDeps>;
  }> = [
    {
      name: "prayer_video_responses",
      override: { loadPrayerVideoResponses: vi.fn(async () => queryError()) },
    },
    {
      name: "prayer_written_responses",
      override: { loadPrayerWrittenResponses: vi.fn(async () => queryError()) },
    },
    {
      name: "prayer_updates",
      override: { loadPrayerUpdates: vi.fn(async () => queryError()) },
    },
    {
      name: "story_video_replies",
      override: { loadStoryVideoReplies: vi.fn(async () => queryError()) },
    },
    {
      name: "content_reports",
      override: { loadContentReports: vi.fn(async () => queryError()) },
    },
    {
      name: "story_reactions",
      override: { loadStoryReactions: vi.fn(async () => queryError()) },
    },
    {
      name: "saved_content",
      override: { loadSavedContent: vi.fn(async () => queryError()) },
    },
    {
      name: "prayer_follows",
      override: { loadPrayerFollows: vi.fn(async () => queryError()) },
    },
  ];

  for (const failureCase of failureCases) {
    it(`fail-closed when ${failureCase.name} query errors`, async () => {
      const inventory = await loadStoryDeletionSafetyInventory(
        STORY,
        TARGET,
        createDeps(failureCase.override)
      );
      expect(inventory.queriesComplete).toBe(false);
      expect(inventory.childInventory.inventoryComplete).toBe(false);
      expect(
        inventory.blockers.some((b) => b.code === "STORY_CHILD_QUERY_FAILED")
      ).toBe(true);
      const decision = planStoryDeletionDecision(
        storySafetyInventoryToPlanningInput(inventory)
      );
      expect(decision.action).toBe("BLOCK_UNRESOLVED");
    });
  }
});

describe("inventory fingerprint and authoritative batch loader", () => {
  it("documents fingerprint is drift hint only", () => {
    expect(STORY_SAFETY_INVENTORY_FINGERPRINT_NOTE).toContain(
      "Fingerprint is a drift hint only"
    );
  });

  it("registers loader-produced inventory as trusted instance", async () => {
    const batch = await loadAuthoritativeBatch();
    const validation = validateTargetStorySafetyInventoryBatchForPlanning({
      batch,
      manifestTargetUserId: TARGET,
    });
    expect(validation.ok).toBe(true);
    expect(batch.inventories[0]?.fingerprint).toContain("sv2");
    expect(Object.isFrozen(batch.inventories[0])).toBe(true);
    expect(Object.isFrozen(batch)).toBe(true);
  });

  it("changes fingerprint when same total but ownership class changes", async () => {
    const targetOwned = await loadStoryDeletionSafetyInventory(
      STORY,
      TARGET,
      createDeps({
        loadPrayerVideoResponses: vi.fn(async () =>
          okRows([{ user_id: TARGET }])
        ),
      })
    );
    const thirdParty = await loadStoryDeletionSafetyInventory(
      STORY,
      TARGET,
      createDeps({
        loadPrayerVideoResponses: vi.fn(async () =>
          okRows([{ user_id: OTHER }])
        ),
      })
    );
    expect(targetOwned.dependencies.prayerVideoResponses.total).toBe(1);
    expect(thirdParty.dependencies.prayerVideoResponses.total).toBe(1);
    expect(targetOwned.fingerprint).not.toBe(thirdParty.fingerprint);
  });

  it("list-target-stories query error => batch ok=false, not empty success", async () => {
    const batch = await loadAuthoritativeBatch({
      listTargetOwnedStoryIds: vi.fn(async () => ({ ok: false })),
    });
    expect(batch.ok).toBe(false);
    expect(batch.expectedStoryIds).toEqual([]);
    expect(batch.inventories).toEqual([]);
    expect(batch.blockers.some((b) => b.code === "TARGET_STORY_LIST_QUERY_FAILED")).toBe(
      true
    );
    expect(Object.isFrozen(batch)).toBe(true);
  });

  it("true zero-story target => ok=true with empty arrays", async () => {
    const batch = await loadAuthoritativeBatch({
      listTargetOwnedStoryIds: vi.fn(async () => ({
        ok: true,
        storyIds: [],
      })),
    });
    expect(batch.ok).toBe(true);
    expect(batch.expectedStoryIds).toEqual([]);
    expect(batch.inventories).toEqual([]);
    expect(batch.blockers).toEqual([]);
  });

  it("one per-story inventory failure => entire batch not ok", async () => {
    const batch = await loadAuthoritativeBatch({
      loadPrayerVideoResponses: vi.fn(async () => queryError()),
    });
    expect(batch.ok).toBe(false);
    expect(batch.blockers.some((b) => b.code === "STORY_INVENTORY_NOT_AUTHORITATIVE")).toBe(
      true
    );
  });

  it("loads inventories for all target-owned stories", async () => {
    const batch = await loadAuthoritativeBatch({
      listTargetOwnedStoryIds: vi.fn(async () => ({
        ok: true,
        storyIds: [STORY, STORY_B],
      })),
    });
    expect(batch.inventories).toHaveLength(2);
  });
});

describe("batch validation and database plan integration", () => {
  it("plans never-published hard delete from authoritative batch", async () => {
    const batch = await loadAuthoritativeBatch();
    const plan = buildAccountDeletionDatabasePlan({
      manifest: minimalManifest(),
      storySafetyInventoryBatch: batch,
    });
    expect(
      plan.hardDelete.some(
        (entry) =>
          entry.table === "stories" &&
          entry.selector.includes("NEVER_PUBLISHED")
      )
    ).toBe(true);
  });

  it("blocks when canonical expected stories exceed provided inventories", async () => {
    const batch = await loadAuthoritativeBatch({
      listTargetOwnedStoryIds: vi.fn(async () => ({
        ok: true,
        storyIds: [STORY, STORY_B],
      })),
      loadStoryOwnership: vi.fn(async (storyId) => {
        if (storyId === STORY_B) {
          return { ok: false, reason: "not_found" as const };
        }
        return { ok: true as const, row: storyRow() };
      }),
    });

    const plan = buildAccountDeletionDatabasePlan({
      manifest: minimalManifest(),
      storySafetyInventoryBatch: batch,
    });
    expect(plan.hardDelete.some((entry) => entry.table === "stories")).toBe(false);
    expect(plan.blockedExecution).toBe(true);
  });

  it("blocks fabricated plain-object batch", async () => {
    const forged: TargetStorySafetyInventoryBatch = {
      ok: true,
      targetUserId: TARGET,
      expectedStoryIds: [STORY],
      inventories: [
        {
          storyId: STORY,
          targetUserId: TARGET,
          ownershipVerified: true,
          status: "pending",
          removedAt: null,
          lifecycle: "NEVER_PUBLISHED",
          queriesComplete: true,
          blockers: [],
          dependencies: {
            prayerVideoResponses: {
              total: 0,
              targetAuthored: 0,
              thirdPartyAuthored: 0,
              nullAuthor: 0,
              querySucceeded: true,
            },
            prayerWrittenResponses: {
              total: 0,
              targetAuthored: 0,
              thirdPartyAuthored: 0,
              nullAuthor: 0,
              querySucceeded: true,
            },
            prayerUpdates: {
              total: 0,
              targetAuthored: 0,
              thirdPartyAuthored: 0,
              nullAuthor: 0,
              querySucceeded: true,
            },
            storyVideoReplies: {
              total: 0,
              targetOnly: 0,
              crossUser: 0,
              ambiguousParticipant: 0,
              querySucceeded: true,
            },
            contentReports: { total: 0, querySucceeded: true },
            storyReactions: {
              total: 0,
              targetOwned: 0,
              thirdPartyOwned: 0,
              nullOwner: 0,
              querySucceeded: true,
            },
            savedContent: {
              total: 0,
              targetOwned: 0,
              thirdPartyOwned: 0,
              nullOwner: 0,
              querySucceeded: true,
            },
            prayerFollows: {
              total: 0,
              targetOwned: 0,
              thirdPartyOwned: 0,
              nullOwner: 0,
              querySucceeded: true,
            },
          },
          fingerprint: "forged",
          childInventory: {
            ...emptyStoryDeletionChildInventory(),
            inventoryComplete: true,
            reportEvidencePreservedBeforeStoryDelete: true,
          },
        },
      ],
      blockers: [],
      fingerprint: "forged-batch",
    };

    const validation = validateTargetStorySafetyInventoryBatchForPlanning({
      batch: forged,
      manifestTargetUserId: TARGET,
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.blockers.some((b) => b.code === "STORY_INVENTORY_BATCH_UNTRUSTED")).toBe(
        true
      );
    }

    const plan = buildAccountDeletionDatabasePlan({
      manifest: minimalManifest(),
      storySafetyInventoryBatch: forged,
    });
    expect(plan.hardDelete.some((entry) => entry.table === "stories")).toBe(false);
    expect(plan.blockedExecution).toBe(true);
  });

  it("blocks spread-cloned batch with mismatched targetUserId", async () => {
    const batch = await loadAuthoritativeBatch();
    const cloned = { ...batch, targetUserId: OTHER };
    const plan = buildAccountDeletionDatabasePlan({
      manifest: minimalManifest(),
      storySafetyInventoryBatch: cloned,
    });
    expect(plan.hardDelete.some((entry) => entry.table === "stories")).toBe(false);
    expect(plan.blockedExecution).toBe(true);
  });

  it("blocks never-published hard delete when inventory shows third-party child", async () => {
    const batch = await loadAuthoritativeBatch({
      loadPrayerVideoResponses: vi.fn(async () =>
        okRows([{ user_id: OTHER }])
      ),
    });
    const plan = buildAccountDeletionDatabasePlan({
      manifest: minimalManifest(),
      storySafetyInventoryBatch: batch,
    });
    expect(plan.hardDelete.some((entry) => entry.table === "stories")).toBe(false);
    expect(plan.blocked.some((entry) => entry.table === "stories")).toBe(true);
  });

  it("blocks target-authored prayer_update on never-published story", async () => {
    const batch = await loadAuthoritativeBatch({
      loadPrayerUpdates: vi.fn(async () =>
        okRows([{ author_user_id: TARGET }])
      ),
    });
    const plan = buildAccountDeletionDatabasePlan({
      manifest: minimalManifest(),
      storySafetyInventoryBatch: batch,
    });
    expect(plan.hardDelete.some((entry) => entry.table === "stories")).toBe(false);
    expect(plan.blocked.some((entry) => entry.table === "stories")).toBe(true);
  });

  it("blocks NULL-owner engagement on never-published story", async () => {
    const batch = await loadAuthoritativeBatch({
      loadStoryReactions: vi.fn(async () => okRows([{ user_id: null }])),
    });
    const plan = buildAccountDeletionDatabasePlan({
      manifest: minimalManifest(),
      storySafetyInventoryBatch: batch,
    });
    expect(plan.hardDelete.some((entry) => entry.table === "stories")).toBe(false);
  });

  it("absent batch cannot authorize never-published hard-delete alone", () => {
    const plan = buildAccountDeletionDatabasePlan({
      manifest: minimalManifest(),
    });
    expect(
      plan.hardDelete.some(
        (entry) =>
          entry.table === "stories" &&
          entry.selector.includes("NEVER_PUBLISHED")
      )
    ).toBe(false);
  });

  it("does not accept storyPlanningInputs on production plan input", () => {
    type PlanInput = Parameters<typeof buildAccountDeletionDatabasePlan>[0];
    type ForbiddenKey = "storyPlanningInputs";
    type HasDirectPlanningInputs = ForbiddenKey extends keyof PlanInput ? true : false;
    const compileTimeGuard: HasDirectPlanningInputs = false;
    expect(compileTimeGuard).toBe(false);
  });
});

function buildForgedInventory(
  overrides: Partial<StoryDeletionSafetyInventory> = {}
): StoryDeletionSafetyInventory {
  const base: StoryDeletionSafetyInventory = {
    storyId: STORY,
    targetUserId: TARGET,
    ownershipVerified: true,
    status: "pending",
    removedAt: null,
    lifecycle: "NEVER_PUBLISHED",
    queriesComplete: true,
    blockers: [],
    dependencies: {
      prayerVideoResponses: {
        total: 0,
        targetAuthored: 0,
        thirdPartyAuthored: 0,
        nullAuthor: 0,
        querySucceeded: true,
      },
      prayerWrittenResponses: {
        total: 0,
        targetAuthored: 0,
        thirdPartyAuthored: 0,
        nullAuthor: 0,
        querySucceeded: true,
      },
      prayerUpdates: {
        total: 0,
        targetAuthored: 0,
        thirdPartyAuthored: 0,
        nullAuthor: 0,
        querySucceeded: true,
      },
      storyVideoReplies: {
        total: 0,
        targetOnly: 0,
        crossUser: 0,
        ambiguousParticipant: 0,
        querySucceeded: true,
      },
      contentReports: { total: 0, querySucceeded: true },
      storyReactions: {
        total: 0,
        targetOwned: 0,
        thirdPartyOwned: 0,
        nullOwner: 0,
        querySucceeded: true,
      },
      savedContent: {
        total: 0,
        targetOwned: 0,
        thirdPartyOwned: 0,
        nullOwner: 0,
        querySucceeded: true,
      },
      prayerFollows: {
        total: 0,
        targetOwned: 0,
        thirdPartyOwned: 0,
        nullOwner: 0,
        querySucceeded: true,
      },
    },
    fingerprint: "",
    childInventory: {
      ...emptyStoryDeletionChildInventory(),
      inventoryComplete: true,
      reportEvidencePreservedBeforeStoryDelete: true,
    },
    ...overrides,
  };
  return {
    ...base,
    fingerprint: computeStorySafetyInventoryFingerprint({ inventory: base }),
  };
}

describe("trust-boundary security regressions", () => {
  it("rejects plain object with legacy string provenance fields", () => {
    const forgedInventory = {
      ...buildForgedInventory(),
      __htbfStorySafetyInventoryProvenance: "authoritative.v1",
    };
    const forgedBatch: TargetStorySafetyInventoryBatch = {
      ok: true,
      targetUserId: TARGET,
      expectedStoryIds: [STORY],
      inventories: [forgedInventory],
      blockers: [],
      fingerprint: "forged",
      __htbfTargetStorySafetyInventoryBatchProvenance: "authoritative.v1",
    };

    const validation = validateTargetStorySafetyInventoryBatchForPlanning({
      batch: forgedBatch,
      manifestTargetUserId: TARGET,
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.blockers.some((b) => b.code === "STORY_INVENTORY_BATCH_UNTRUSTED")).toBe(
        true
      );
      expect(validation.blockers.some((b) => b.code === "STORY_INVENTORY_UNTRUSTED")).toBe(
        true
      );
    }
  });

  it("rejects JSON-parsed lookalike batch", async () => {
    const batch = await loadAuthoritativeBatch();
    const parsed = JSON.parse(JSON.stringify(batch)) as TargetStorySafetyInventoryBatch;
    const validation = validateTargetStorySafetyInventoryBatchForPlanning({
      batch: parsed,
      manifestTargetUserId: TARGET,
    });
    expect(validation.ok).toBe(false);
  });

  it("rejects spread-cloned authoritative inventory in batch", async () => {
    const batch = await loadAuthoritativeBatch();
    const clonedInventory = { ...batch.inventories[0]! };
    const tampered: TargetStorySafetyInventoryBatch = {
      ...batch,
      inventories: [clonedInventory],
    };
    const validation = validateTargetStorySafetyInventoryBatchForPlanning({
      batch: tampered,
      manifestTargetUserId: TARGET,
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.blockers.some(
          (b) =>
            b.code === "STORY_INVENTORY_BATCH_UNTRUSTED" ||
            b.code === "STORY_INVENTORY_BATCH_TAMPERED" ||
            b.code === "STORY_INVENTORY_UNTRUSTED"
        )
      ).toBe(true);
    }
  });

  it("rejects spread-cloned authoritative batch", async () => {
    const batch = await loadAuthoritativeBatch();
    const cloned = { ...batch };
    const validation = validateTargetStorySafetyInventoryBatchForPlanning({
      batch: cloned,
      manifestTargetUserId: TARGET,
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.blockers.some((b) => b.code === "STORY_INVENTORY_BATCH_UNTRUSTED")).toBe(
        true
      );
    }
  });

  it("rejects forged expectedStoryIds subset when canonical list includes two stories", async () => {
    const batch = await loadAuthoritativeBatch({
      listTargetOwnedStoryIds: vi.fn(async () => ({
        ok: true,
        storyIds: [STORY, STORY_B],
      })),
    });
    expect(batch.expectedStoryIds).toEqual([STORY, STORY_B]);

    const subsetForgery: TargetStorySafetyInventoryBatch = {
      ...batch,
      expectedStoryIds: [STORY],
    };
    const validation = validateTargetStorySafetyInventoryBatchForPlanning({
      batch: subsetForgery,
      manifestTargetUserId: TARGET,
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.blockers.some(
          (b) =>
            b.code === "STORY_INVENTORY_BATCH_UNTRUSTED" ||
            b.code === "STORY_INVENTORY_BATCH_TAMPERED" ||
            b.code === "STORY_INVENTORY_MISSING_COVERAGE"
        )
      ).toBe(true);
    }

    const plan = buildAccountDeletionDatabasePlan({
      manifest: minimalManifest(),
      storySafetyInventoryBatch: subsetForgery,
    });
    expect(plan.hardDelete.some((entry) => entry.table === "stories")).toBe(false);
  });

  it("rejects duplicate expected story ids", async () => {
    const batch = await loadAuthoritativeBatch({
      listTargetOwnedStoryIds: vi.fn(async () => ({
        ok: true,
        storyIds: [STORY, STORY],
      })),
    });
    const validation = validateTargetStorySafetyInventoryBatchForPlanning({
      batch,
      manifestTargetUserId: TARGET,
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.blockers.some((b) => b.code === "STORY_INVENTORY_EXPECTED_DUPLICATES")).toBe(
        true
      );
    }
  });

  it("rejects duplicate inventory story ids", async () => {
    const batch = await loadAuthoritativeBatch({
      listTargetOwnedStoryIds: vi.fn(async () => ({
        ok: true,
        storyIds: [STORY, STORY_B],
      })),
    });
    const tampered: TargetStorySafetyInventoryBatch = {
      ...batch,
      inventories: [batch.inventories[0]!, batch.inventories[0]!],
    };
    const validation = validateTargetStorySafetyInventoryBatchForPlanning({
      batch: tampered,
      manifestTargetUserId: TARGET,
    });
    expect(validation.ok).toBe(false);
  });

  it("rejects swapped inventory object reference", async () => {
    const batch = await loadAuthoritativeBatch({
      listTargetOwnedStoryIds: vi.fn(async () => ({
        ok: true,
        storyIds: [STORY, STORY_B],
      })),
    });
    const otherInventory = await loadStoryDeletionSafetyInventory(
      STORY_B,
      TARGET,
      createDeps({
        loadStoryOwnership: vi.fn(async () => ({
          ok: true,
          row: storyRow({ id: STORY_B, status: "approved" }),
        })),
      })
    );
    const tampered: TargetStorySafetyInventoryBatch = {
      ...batch,
      inventories: [otherInventory, batch.inventories[1]!],
    };
    const validation = validateTargetStorySafetyInventoryBatchForPlanning({
      batch: tampered,
      manifestTargetUserId: TARGET,
    });
    expect(validation.ok).toBe(false);
  });

  it("rejects mutated lifecycle on spread-cloned inventory", async () => {
    const batch = await loadAuthoritativeBatch();
    const clonedInventory = {
      ...batch.inventories[0]!,
      status: "approved",
      lifecycle: "LIVE_PUBLIC" as const,
      fingerprint: computeStorySafetyInventoryFingerprint({
        inventory: {
          ...batch.inventories[0]!,
          status: "approved",
          lifecycle: "LIVE_PUBLIC",
        },
      }),
    };
    const tampered: TargetStorySafetyInventoryBatch = {
      ...batch,
      inventories: [clonedInventory],
    };
    const validation = validateTargetStorySafetyInventoryBatchForPlanning({
      batch: tampered,
      manifestTargetUserId: TARGET,
    });
    expect(validation.ok).toBe(false);
  });

  it("rejects mutated child inventory counts on spread-cloned inventory", async () => {
    const batch = await loadAuthoritativeBatch();
    const source = batch.inventories[0]!;
    const clonedInventory = {
      ...source,
      childInventory: {
        ...source.childInventory,
        prayerUpdateCount: 1,
      },
    };
    const tampered: TargetStorySafetyInventoryBatch = {
      ...batch,
      inventories: [clonedInventory],
    };
    const validation = validateTargetStorySafetyInventoryBatchForPlanning({
      batch: tampered,
      manifestTargetUserId: TARGET,
    });
    expect(validation.ok).toBe(false);
  });

  it("cannot authorize HARD_DELETE via direct StoryRowLifecycleInput through plan API", async () => {
    const forgedInput = storySafetyInventoryToPlanningInput(buildForgedInventory());
    const plan = buildAccountDeletionDatabasePlan({
      manifest: minimalManifest(),
    });
    expect(planStoryDeletionDecision(forgedInput).action).toBe("HARD_DELETE");
    expect(plan.hardDelete.some((entry) => entry.table === "stories")).toBe(false);
  });

  it("frozen trusted batch rejects in-place expectedStoryIds mutation attempts", async () => {
    const batch = await loadAuthoritativeBatch({
      listTargetOwnedStoryIds: vi.fn(async () => ({
        ok: true,
        storyIds: [STORY, STORY_B],
      })),
    });

    expect(() => {
      (batch as { expectedStoryIds: string[] }).expectedStoryIds = [STORY];
    }).toThrow();

    const validation = validateTargetStorySafetyInventoryBatchForPlanning({
      batch,
      manifestTargetUserId: TARGET,
    });
    expect(validation.ok).toBe(true);
  });
});

describe("read-only and execution safety", () => {
  it("does not contain mutation calls in inventory module", () => {
    const source = readFileSync(
      "lib/server/accountDeletionStorySafetyInventory.ts",
      "utf8"
    );
    expect(source).not.toContain(".insert(");
    expect(source).not.toContain(".update(");
    expect(source).not.toContain(".delete(");
    expect(source).not.toContain(".upsert(");
    expect(source).not.toContain("deleteUser");
    expect(source).not.toContain("storage.from");
    expect(source).not.toContain(".remove(");
  });

  it("createStorySafetyInventoryQueryDeps only selects rows", () => {
    const source = readFileSync(
      "lib/server/accountDeletionStorySafetyInventory.ts",
      "utf8"
    );
    expect(source).toContain('.select("id, user_id, status, removed_at")');
    expect(source).toContain('.eq("story_id", storyId)');
  });

  it("keeps execution disabled", () => {
    expect(isAccountDeletionExecutionEnabled()).toBe(false);
  });
});

describe("buildChildInventoryFromDependencies", () => {
  it("does not treat query failures as zero-count eligibility", () => {
    const child = buildChildInventoryFromDependencies({
      targetUserId: TARGET,
      dependencies: {
        prayerVideoResponses: {
          total: 0,
          targetAuthored: 0,
          thirdPartyAuthored: 0,
          nullAuthor: 0,
          querySucceeded: false,
        },
        prayerWrittenResponses: {
          total: 0,
          targetAuthored: 0,
          thirdPartyAuthored: 0,
          nullAuthor: 0,
          querySucceeded: true,
        },
        prayerUpdates: {
          total: 0,
          targetAuthored: 0,
          thirdPartyAuthored: 0,
          nullAuthor: 0,
          querySucceeded: true,
        },
        storyVideoReplies: {
          total: 0,
          targetOnly: 0,
          crossUser: 0,
          ambiguousParticipant: 0,
          querySucceeded: true,
        },
        contentReports: { total: 0, querySucceeded: true },
        storyReactions: {
          total: 0,
          targetOwned: 0,
          thirdPartyOwned: 0,
          nullOwner: 0,
          querySucceeded: true,
        },
        savedContent: {
          total: 0,
          targetOwned: 0,
          thirdPartyOwned: 0,
          nullOwner: 0,
          querySucceeded: true,
        },
        prayerFollows: {
          total: 0,
          targetOwned: 0,
          thirdPartyOwned: 0,
          nullOwner: 0,
          querySucceeded: true,
        },
      },
      queriesComplete: false,
      ownershipVerified: true,
    });
    expect(child.inventoryComplete).toBe(false);
    expect(
      evaluateNeverPublishedStoryDeletionEligibility({
        lifecycle: "NEVER_PUBLISHED",
        childInventory: child,
      }).eligible
    ).toBe(false);
  });
});

describe("createStorySafetyInventoryQueryDeps factory", () => {
  it("exports a Supabase-backed deps factory without mutating", () => {
    expect(typeof createStorySafetyInventoryQueryDeps).toBe("function");
  });
});
