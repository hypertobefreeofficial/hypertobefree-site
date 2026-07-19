import { describe, expect, it, vi } from "vitest";
import {
  applyGenuinePublicModerationFilter,
  filterGenuinePublicModerationRows,
  isGenuinePublicModerationRecord,
} from "./moderationIsolation";

describe("moderation isolation", () => {
  it("filters genuine admin queries when schema is ready", () => {
    const eq = vi.fn(function (this: unknown) {
      return this;
    });
    applyGenuinePublicModerationFilter(
      { eq },
      "content_reports",
      {
        state: "ready",
        profiles: { hasIsDemo: true },
        stories: { hasIsDemo: true },
        prayerVideoResponses: { hasIsDemo: true },
        storyReactions: { hasIsDemo: true },
        prayerWrittenResponses: { hasIsDemo: true },
        savedContent: { hasIsDemo: true },
        prayerFollows: { hasIsDemo: true },
        storyVideoReplies: { hasIsDemo: true },
        contentReports: { hasIsDemo: true },
        genuinePublicIsolationActive: true,
      }
    );
    expect(eq).toHaveBeenCalledWith("is_demo", false);
  });

  it("excludes demo moderation rows from genuine queues", () => {
    expect(isGenuinePublicModerationRecord({ is_demo: false })).toBe(true);
    expect(isGenuinePublicModerationRecord({ is_demo: true })).toBe(false);
    expect(
      filterGenuinePublicModerationRows([
        { id: "1", is_demo: false },
        { id: "2", is_demo: true },
      ])
    ).toEqual([{ id: "1", is_demo: false }]);
  });
});
