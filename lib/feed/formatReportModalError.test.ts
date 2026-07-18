import { describe, expect, it } from "vitest";
import { formatReportModalError } from "./formatReportModalError";

describe("formatReportModalError", () => {
  it("appends safe API codes in development", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    expect(
      formatReportModalError(
        "We couldn't submit your report. Please try again.",
        "foreign_key_failure"
      )
    ).toBe("We couldn't submit your report. Please try again. [foreign_key_failure]");
    process.env.NODE_ENV = original;
  });

  it("hides codes outside development", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    expect(
      formatReportModalError(
        "We couldn't submit your report. Please try again.",
        "foreign_key_failure"
      )
    ).toBe("We couldn't submit your report. Please try again.");
    process.env.NODE_ENV = original;
  });
});
