import { describe, expect, it } from "vitest";
import { planRealtimeFeedSync } from "./realtimeFeedSync";

describe("processRealtimeFeedUpdates reaction scoping", () => {
  it("plans reaction-only updates without head refresh", () => {
    const plan = planRealtimeFeedSync(
      {
        storyChanges: [],
        responseChanges: [],
        reactionStoryIds: ["story-1"],
      },
      [],
      {
        blockedUserIds: new Set(),
        removedAtFilterAvailable: true,
      }
    );

    expect(plan.needsHeadRefresh).toBe(false);
    expect(plan.reactionStoryIds.has("story-1")).toBe(true);
  });
});
