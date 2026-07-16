import { describe, expect, it } from "vitest";
import { getCommunityFeedVisualValidationFixtures } from "./visualValidationFixtures";

describe("visualValidationFixtures", () => {
  it("builds representative FeedDisplayItem pages", () => {
    const page1 = getCommunityFeedVisualValidationFixtures(1);
    const page2 = getCommunityFeedVisualValidationFixtures(2);

    expect(page1.length).toBeGreaterThanOrEqual(7);
    expect(page2.length).toBeGreaterThanOrEqual(2);
    expect(page1[0]?.kind).toBe("story");
    expect(page1.some((item) => item.kind === "prayer_video_response")).toBe(
      false
    );
    expect(
      page2.some((item) => item.kind === "prayer_video_response")
    ).toBe(true);
  });
});
