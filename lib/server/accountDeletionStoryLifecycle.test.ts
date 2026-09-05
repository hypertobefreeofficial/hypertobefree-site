import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ACCOUNT_DELETION_TRANSITIVE_CASCADE_REGISTRY,
  ACCOUNT_DELETION_DATABASE_PLAN_INVARIANTS,
  classifyDatabaseTablePolicy,
  UNSAFE_TRANSITIVE_CASCADE_IDS,
} from "./accountDeletionDatabasePolicy";
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
    thirdPartyPrayerVideoResponseCount: 0,
    thirdPartyPrayerWrittenResponseCount: 0,
    thirdPartyPrayerUpdateCount: 0,
    crossUserStoryVideoReplyCount: 0,
    ambiguousStoryVideoReplyCount: 0,
    nullAuthorPrayerVideoResponseCount: 0,
    nullAuthorPrayerWrittenResponseCount: 0,
    nullAuthorPrayerUpdateCount: 0,
    thirdPartyReactionCount: 0,
    thirdPartySavedContentCount: 0,
    thirdPartyFollowCount: 0,
    nullOwnerReactionCount: 0,
    nullOwnerSavedContentCount: 0,
    nullOwnerFollowCount: 0,
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

  it("blocks any prayer_updates on never-published stories (ANONYMIZE_AND_PRESERVE)", () => {
    const targetAuthored = evaluateNeverPublishedStoryDeletionEligibility({
      lifecycle: "NEVER_PUBLISHED",
      childInventory: cleanInventory({
        prayerUpdateCount: 1,
        thirdPartyPrayerUpdateCount: 0,
      }),
    });
    expect(targetAuthored.eligible).toBe(false);
    if (!targetAuthored.eligible) {
      expect(targetAuthored.blockCode).toBe("STORY_HAS_SUBSTANTIVE_CHILD");
    }

    const thirdParty = evaluateNeverPublishedStoryDeletionEligibility({
      lifecycle: "NEVER_PUBLISHED",
      childInventory: cleanInventory({
        prayerUpdateCount: 1,
        thirdPartyPrayerUpdateCount: 1,
      }),
    });
    expect(thirdParty.eligible).toBe(false);

    const nullAuthor = evaluateNeverPublishedStoryDeletionEligibility({
      lifecycle: "NEVER_PUBLISHED",
      childInventory: cleanInventory({
        prayerUpdateCount: 1,
        nullAuthorPrayerUpdateCount: 1,
      }),
    });
    expect(nullAuthor.eligible).toBe(false);
  });

  it("blocks NULL-owner engagement on never-published stories", () => {
    const result = evaluateNeverPublishedStoryDeletionEligibility({
      lifecycle: "NEVER_PUBLISHED",
      childInventory: cleanInventory({ nullOwnerReactionCount: 1 }),
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.blockCode).toBe("STORY_HAS_AMBIGUOUS_ENGAGEMENT");
    }
  });

  it("allows derived target-only engagement counts without blocking eligibility", () => {
    expect(
      evaluateNeverPublishedStoryDeletionEligibility({
        lifecycle: "NEVER_PUBLISHED",
        childInventory: cleanInventory({
          reactionCount: 4,
          followCount: 2,
          savedContentCount: 1,
        }),
      }).eligible
    ).toBe(true);
  });

  it("blocks third-party engagement on never-published stories", () => {
    const result = evaluateNeverPublishedStoryDeletionEligibility({
      lifecycle: "NEVER_PUBLISHED",
      childInventory: cleanInventory({ thirdPartyReactionCount: 1 }),
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.blockCode).toBe("STORY_HAS_THIRD_PARTY_ENGAGEMENT");
    }
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

describe("lifecycle-aware story deletion decisions", () => {
  it("does not hard-delete removed stories", () => {
    const decision = planStoryDeletionDecision(
      storyInput({
        status: "removed",
        removedAt: "2026-01-01T00:00:00.000Z",
        childInventory: cleanInventory({ prayerVideoResponseCount: 1 }),
      })
    );

    expect(decision.action).not.toBe("HARD_DELETE");
    expect(decision.action).toBe("ANONYMIZE_TOMBSTONE");
  });

  it("plans never-published hard delete only when eligible", () => {
    const decision = planStoryDeletionDecision(storyInput({ status: "pending" }));
    expect(decision.action).toBe("HARD_DELETE");
  });

  it("blocks never-published hard delete when substantive child exists", () => {
    const decision = planStoryDeletionDecision(
      storyInput({
        status: "pending",
        childInventory: cleanInventory({ prayerVideoResponseCount: 1 }),
      })
    );

    expect(decision.action).not.toBe("HARD_DELETE");
    expect(decision.action).toBe("BLOCK_UNRESOLVED");
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
