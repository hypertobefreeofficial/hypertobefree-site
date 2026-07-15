import { describe, expect, it } from "vitest";
import {
  COMMUNITY_FEED_APPROVED_IS_PUBLIC,
  COMMUNITY_FEED_RESPONSE_PUBLIC_STATUS,
  COMMUNITY_FEED_STORY_PUBLIC_STATUS,
} from "./invariant";
import { isStoryFeedEligible } from "./eligibility";
import { buildStory } from "./testFixtures";

describe("community feed public distribution invariant", () => {
  it("documents that approved story status means public feed intent", () => {
    expect(COMMUNITY_FEED_APPROVED_IS_PUBLIC).toBe(true);
    expect(COMMUNITY_FEED_STORY_PUBLIC_STATUS).toBe("approved");
    expect(COMMUNITY_FEED_RESPONSE_PUBLIC_STATUS).toBe("approved");
  });

  it("includes approved stories under the invariant without creation_mode proxy", () => {
    expect(
      isStoryFeedEligible(
        buildStory({
          status: "approved",
          creation_mode: "creator-studio",
          story_type: "Prayer Request",
        }),
        { removedAtFilterAvailable: true }
      )
    ).toBe(true);
  });

  it("does not treat non-approved statuses as public feed eligible", () => {
    for (const status of ["pending", "rejected", "removed", "private"]) {
      expect(
        isStoryFeedEligible(buildStory({ status }), {
          removedAtFilterAvailable: true,
        })
      ).toBe(false);
    }
  });
});
