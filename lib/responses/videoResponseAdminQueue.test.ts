import { describe, expect, it } from "vitest";
import { responseNeedsAdminAttention } from "./videoResponseAdminQueue";

describe("responseNeedsAdminAttention", () => {
  it("excludes auto-approved low-risk responses from the active admin queue", () => {
    expect(
      responseNeedsAdminAttention({
        status: "approved",
        ai_review_status: "completed",
        ai_risk_level: "low",
        ai_suggested_action: "approve",
        ai_flags: ["text_metadata_only", "video_not_analyzed"],
      })
    ).toBe(false);
  });

  it("includes submitted responses that still need human review", () => {
    expect(
      responseNeedsAdminAttention({
        status: "submitted",
        ai_review_status: "completed",
        ai_risk_level: "high",
        ai_suggested_action: "review",
        ai_flags: ["violence"],
      })
    ).toBe(true);
  });

  it("includes failed AI review responses", () => {
    expect(
      responseNeedsAdminAttention({
        status: "submitted",
        ai_review_status: "failed",
        ai_risk_level: "medium",
        ai_suggested_action: "review",
        ai_flags: ["moderation_unavailable"],
      })
    ).toBe(true);
  });

  it("includes reported responses even when already approved", () => {
    expect(
      responseNeedsAdminAttention(
        {
          status: "approved",
          ai_review_status: "completed",
          ai_risk_level: "low",
          ai_suggested_action: "approve",
          ai_flags: [],
        },
        {
          responseId: "response-1",
          reportedResponseIds: new Set(["response-1"]),
        }
      )
    ).toBe(true);
  });
});
