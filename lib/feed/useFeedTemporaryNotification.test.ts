import { describe, expect, it } from "vitest";
import {
  FEED_REPORT_SUCCESS_MESSAGE,
  FEED_TEMPORARY_NOTIFICATION_EXIT_MS,
  FEED_TEMPORARY_NOTIFICATION_VISIBLE_MS,
} from "./feedTemporaryNotification";

describe("feedTemporaryNotification", () => {
  it("uses the exact report success copy", () => {
    expect(FEED_REPORT_SUCCESS_MESSAGE).toBe(
      "Your report was submitted. Thank you for helping keep HTBF safe."
    );
  });

  it("uses a four second visible window", () => {
    expect(FEED_TEMPORARY_NOTIFICATION_VISIBLE_MS).toBe(4000);
  });

  it("uses a short exit transition", () => {
    expect(FEED_TEMPORARY_NOTIFICATION_EXIT_MS).toBeGreaterThanOrEqual(200);
    expect(FEED_TEMPORARY_NOTIFICATION_EXIT_MS).toBeLessThanOrEqual(300);
  });
});
