import { describe, expect, it } from "vitest";
import { formatFeedRelativeTime } from "./formatFeedRelativeTime";

describe("formatFeedRelativeTime", () => {
  it("returns null for invalid timestamps", () => {
    expect(formatFeedRelativeTime(null)).toBeNull();
    expect(formatFeedRelativeTime("not-a-date")).toBeNull();
  });

  it("formats recent minutes and hours", () => {
    const now = Date.now();
    expect(formatFeedRelativeTime(new Date(now - 5 * 60_000).toISOString())).toBe(
      "5m"
    );
    expect(formatFeedRelativeTime(new Date(now - 3 * 3_600_000).toISOString())).toBe(
      "3h"
    );
  });
});
