import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ACCOUNT_DELETION_TRANSITIVE_CASCADE_REGISTRY,
  ACCOUNT_DELETION_DATABASE_PLAN_INVARIANTS,
  classifyDatabaseTablePolicy,
  UNSAFE_TRANSITIVE_CASCADE_IDS,
} from "./accountDeletionDatabasePolicy";
import type { AccountDeletionManifest } from "./accountDeletionManifest";
import {
  buildAccountDeletionDatabasePlan,
  validateDatabasePlanInvariants,
} from "./accountDeletionDatabasePlan";
import {
  classifyStoryLifecycle,
  emptyStoryDeletionChildInventory,
  evaluateNeverPublishedStoryDeletionEligibility,
  planStoryDeletionDecision,
  STORY_SUBSTANTIVE_CHILD_POLICIES,
  type StoryDeletionChildInventory,
  type StoryRowLifecycleInput,
} from "./accountDeletionStoryLifecycle";

const TARGET = "11111111-1111-4111-8111-111111111111";
const STORY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function cleanInventory(
  overrides: Partial<StoryDeletionChildInventory> = {}
): StoryDeletionChildInventory {
  return {
    ...emptyStoryDeletionChildInventory(),
    inventoryComplete: true,
    reportEvidencePreservedBeforeStoryDelete: true,
    ...overrides,
  };
}

function storyInput(
  overrides: Partial<StoryRowLifecycleInput> = {}
): StoryRowLifecycleInput {
  return {
    storyId: STORY,
    status: "pending",
    removedAt: null,
    targetUserId: TARGET,
    childInventory: cleanInventory(),
    ...overrides,
  };
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

describe("story lifecycle classification", () => {
  it("classifies approved + no removed_at as LIVE_PUBLIC", () => {
    expect(
      classifyStoryLifecycle({ status: "approved", removedAt: null })
    ).toBe("LIVE_PUBLIC");
  });

  it("classifies removed status as PREVIOUSLY_PUBLIC_OR_REMOVED even without removed_at", () => {
    expect(
      classifyStoryLifecycle({ status: "removed", removedAt: null })
    ).toBe("PREVIOUSLY_PUBLIC_OR_REMOVED");
  });

  it("classifies approved + removed_at as tombstone", () => {
    expect(
      classifyStoryLifecycle({
        status: "approved",
        removedAt: "2026-01-01T00:00:00.000Z",
      })
    ).toBe("PREVIOUSLY_PUBLIC_OR_REMOVED");
  });

  it("classifies pending/submitted never-published stories", () => {
    expect(classifyStoryLifecycle({ status: "pending", removedAt: null })).toBe(
      "NEVER_PUBLISHED"
    );
    expect(
      classifyStoryLifecycle({ status: "submitted", removedAt: null })
    ).toBe("NEVER_PUBLISHED");
  });

  it("classifies unknown statuses as UNKNOWN", () => {
    expect(classifyStoryLifecycle({ status: "legacy", removedAt: null })).toBe(
      "UNKNOWN"
    );
  });
});

describe("never-published deletion eligibility", () => {
  it("allows HARD_DELETE planning when inventory is clean", () => {
    expect(
      evaluateNeverPublishedStoryDeletionEligibility({
        lifecycle: "NEVER_PUBLISHED",
        childInventory: cleanInventory(),
      }).eligible
    ).toBe(true);
  });

  it("blocks when inventory is incomplete", () => {
    const result = evaluateNeverPublishedStoryDeletionEligibility({
      lifecycle: "NEVER_PUBLISHED",
      childInventory: cleanInventory({ inventoryComplete: false }),
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.blockCode).toBe("STORY_CHILD_INVENTORY_INCOMPLETE");
    }
  });

  it("blocks when prayer video responses exist", () => {
    const result = evaluateNeverPublishedStoryDeletionEligibility({
      lifecycle: "NEVER_PUBLISHED",
      childInventory: cleanInventory({ prayerVideoResponseCount: 1 }),
    });
    expect(result.eligible).toBe(false);
  });

  it("blocks when written responses exist", () => {
    const result = evaluateNeverPublishedStoryDeletionEligibility({
      lifecycle: "NEVER_PUBLISHED",
      childInventory: cleanInventory({ prayerWrittenResponseCount: 1 }),
    });
    expect(result.eligible).toBe(false);
  });

  it("blocks when story video replies exist", () => {
    const result = evaluateNeverPublishedStoryDeletionEligibility({
      lifecycle: "NEVER_PUBLISHED",
      childInventory: cleanInventory({ storyVideoReplyCount: 1 }),
    });
    expect(result.eligible).toBe(false);
  });

  it("blocks when content reports exist without evidence preservation proof", () => {
    const result = evaluateNeverPublishedStoryDeletionEligibility({
      lifecycle: "NEVER_PUBLISHED",
      childInventory: cleanInventory({
        contentReportCount: 1,
        reportEvidencePreservedBeforeStoryDelete: false,
      }),
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.blockCode).toBe("STORY_REPORT_EVIDENCE_UNPRESERVED");
    }
  });

  it("allows derived engagement counts without blocking eligibility", () => {
    expect(
      evaluateNeverPublishedStoryDeletionEligibility({
        lifecycle: "NEVER_PUBLISHED",
        childInventory: cleanInventory({
          reactionCount: 4,
          followCount: 2,
          savedContentCount: 1,
          prayerUpdateCount: 1,
        }),
      }).eligible
    ).toBe(true);
  });
});

describe("planStoryDeletionDecision adversarial scenarios", () => {
  it("scenario 1: removed story with other-user response → tombstone not hard delete", () => {
    const decision = planStoryDeletionDecision(
      storyInput({
        status: "removed",
        removedAt: "2026-01-01T00:00:00.000Z",
        childInventory: cleanInventory({ prayerVideoResponseCount: 1 }),
      })
    );
    expect(decision.action).toBe("ANONYMIZE_TOMBSTONE");
    expect(decision.action).not.toBe("HARD_DELETE");
  });

  it("scenario 2: pending clean inventory → eligible hard delete", () => {
    const decision = planStoryDeletionDecision(storyInput({ status: "pending" }));
    expect(decision.action).toBe("HARD_DELETE");
  });

  it("scenario 3: pending story with unexpected reply → block", () => {
    const decision = planStoryDeletionDecision(
      storyInput({
        status: "pending",
        childInventory: cleanInventory({ storyVideoReplyCount: 1 }),
      })
    );
    expect(decision.action).toBe("BLOCK_UNRESOLVED");
  });

  it("scenario 4: unknown lifecycle → block", () => {
    const decision = planStoryDeletionDecision(
      storyInput({ status: "archived" })
    );
    expect(decision.action).toBe("BLOCK_UNRESOLVED");
  });
});

describe("lifecycle-aware database plan", () => {
  it("does not hard-delete removed stories", () => {
    const plan = buildAccountDeletionDatabasePlan({
      manifest: minimalManifest(),
      storyPlanningInputs: [
        storyInput({
          status: "removed",
          removedAt: "2026-01-01T00:00:00.000Z",
          childInventory: cleanInventory({ prayerVideoResponseCount: 1 }),
        }),
      ],
    });

    expect(plan.hardDelete.some((entry) => entry.table === "stories")).toBe(false);
    expect(
      plan.anonymize.some(
        (entry) =>
          entry.table === "stories" &&
          entry.selector.includes("PREVIOUSLY_PUBLIC_OR_REMOVED")
      )
    ).toBe(true);
    expect(validateDatabasePlanInvariants(plan).ok).toBe(true);
  });

  it("plans never-published hard delete only when eligible", () => {
    const plan = buildAccountDeletionDatabasePlan({
      manifest: minimalManifest(),
      storyPlanningInputs: [storyInput({ status: "pending" })],
    });

    expect(
      plan.hardDelete.some(
        (entry) =>
          entry.table === "stories" &&
          entry.selector.includes("NEVER_PUBLISHED")
      )
    ).toBe(true);
  });

  it("blocks never-published hard delete when substantive child exists", () => {
    const plan = buildAccountDeletionDatabasePlan({
      manifest: minimalManifest(),
      storyPlanningInputs: [
        storyInput({
          status: "pending",
          childInventory: cleanInventory({ prayerVideoResponseCount: 1 }),
        }),
      ],
    });

    expect(plan.hardDelete.some((entry) => entry.table === "stories")).toBe(false);
    expect(plan.blocked.some((entry) => entry.table === "stories")).toBe(true);
  });
});

describe("policy registry reconciliation", () => {
  it("does not contain the broad non-approved hard delete selector", () => {
    const source = readFileSync(
      "lib/server/accountDeletionDatabasePolicy.ts",
      "utf8"
    );
    expect(source).not.toContain("status != 'approved' OR removed_at IS NOT NULL");
  });

  it("includes tombstone anonymize policy", () => {
    const tombstone = classifyDatabaseTablePolicy("stories").find((entry) =>
      entry.selector.includes("PREVIOUSLY_PUBLIC_OR_REMOVED")
    );
    expect(tombstone?.action).toBe("ANONYMIZE");
  });

  it("replaces old irrelevant story-child cascade entry", () => {
    const source = readFileSync(
      "lib/server/accountDeletionDatabasePolicy.ts",
      "utf8"
    );
    expect(source).not.toContain("story_child_cascade_on_story_delete");
    expect(UNSAFE_TRANSITIVE_CASCADE_IDS).toContain(
      "story_delete_other_user_prayer_video_responses"
    );
    expect(
      ACCOUNT_DELETION_TRANSITIVE_CASCADE_REGISTRY.some(
        (entry) => entry.id === "story_delete_story_video_replies"
      )
    ).toBe(true);
  });

  it("classifies substantive children explicitly", () => {
    expect(STORY_SUBSTANTIVE_CHILD_POLICIES.prayer_video_responses).toBe(
      "ANONYMIZE_AND_PRESERVE"
    );
    expect(STORY_SUBSTANTIVE_CHILD_POLICIES.story_video_replies).toBe(
      "DETACH_AND_PRESERVE"
    );
    expect(STORY_SUBSTANTIVE_CHILD_POLICIES.prayer_updates).toBe(
      "ANONYMIZE_AND_PRESERVE"
    );
    expect(STORY_SUBSTANTIVE_CHILD_POLICIES.content_reports).toBe(
      "PRESERVE_AND_DETACH"
    );
  });

  it("includes cross-user story invariant", () => {
    expect(
      ACCOUNT_DELETION_DATABASE_PLAN_INVARIANTS.join(" ")
    ).toContain("must not HARD_DELETE substantive content");
  });
});

describe("no mutation in lifecycle modules", () => {
  it("does not ship runtime mutation or auth delete", () => {
    const lifecycleSource = readFileSync(
      "lib/server/accountDeletionStoryLifecycle.ts",
      "utf8"
    );
    const planSource = readFileSync(
      "lib/server/accountDeletionDatabasePlan.ts",
      "utf8"
    );
    expect(lifecycleSource).not.toContain("deleteUser");
    expect(planSource).not.toContain("deleteUser");
    expect(planSource).not.toContain(".remove(");
    expect(planSource).not.toContain("auth.admin");
  });

  it("keeps live execute route disconnected", () => {
    const executeRoute = readFileSync(
      "app/api/admin/account-deletion/[requestId]/execute/route.ts",
      "utf8"
    );
    expect(executeRoute).not.toContain("accountDeletionStoryLifecycle");
    expect(executeRoute).not.toContain("accountDeletionDatabasePlan");
  });
});
