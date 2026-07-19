import { describe, expect, it } from "vitest";
import { getModerationDecision } from "./moderateStoryDecision";

describe("getModerationDecision", () => {
  it("never auto-approves flagged provider results", () => {
    const decision = getModerationDecision({
      flagged: true,
      categories: { harassment: true },
      category_scores: { harassment: 0.2 },
    });

    expect(decision.statusToUse).toBe("submitted");
    expect(decision.aiSuggestedAction).toBe("review");
  });

  it("can approve only low-risk unflagged provider results", () => {
    const decision = getModerationDecision({
      flagged: false,
      categories: {},
      category_scores: { harassment: 0.01 },
    });

    expect(decision.statusToUse).toBe("approved");
  });
});
