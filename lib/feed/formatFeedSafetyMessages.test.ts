import { describe, expect, it } from "vitest";
import {
  formatBlockedUserConfirmation,
  VIDEO_RESPONSE_REPORT_SUCCESS,
} from "./formatFeedSafetyMessages";

describe("formatBlockedUserConfirmation", () => {
  it("formats block confirmation with an @ handle", () => {
    expect(formatBlockedUserConfirmation("hypertobefree")).toBe(
      "You blocked @hypertobefree. Their content will no longer appear for you."
    );
  });

  it("preserves an existing @ prefix", () => {
    expect(formatBlockedUserConfirmation("@deleteme")).toBe(
      "You blocked @deleteme. Their content will no longer appear for you."
    );
  });
});

describe("VIDEO_RESPONSE_REPORT_SUCCESS", () => {
  it("uses the required video report confirmation copy", () => {
    expect(VIDEO_RESPONSE_REPORT_SUCCESS).toBe("This video has been reported.");
  });
});
