import { describe, expect, it } from "vitest";
import { responseNeedsAdminAttention } from "../responses/videoResponseAdminQueue";
import type { PublicModerationDecision } from "../server/moderatePublicContent";
import { buildVideoResponseModerationUpdate } from "../responses/videoResponseAiReview";

function applyModerationDecision(moderation: PublicModerationDecision) {
  return buildVideoResponseModerationUpdate(moderation);
}

describe("public video response moderation workflow", () => {
  it("maps auto-approved AI decisions out of the admin queue", () => {
    const update = applyModerationDecision({
      statusToUse: "approved",
      aiReviewStatus: "completed",
      aiRiskLevel: "low",
      aiSuggestedAction: "approve",
      aiSummary: "ok",
      aiFlags: [],
    });

    expect(
      responseNeedsAdminAttention({
        status: String(update.status),
        ai_review_status: String(update.ai_review_status),
        ai_risk_level: String(update.ai_risk_level),
        ai_suggested_action: String(update.ai_suggested_action),
        ai_flags: update.ai_flags as string[],
      })
    ).toBe(false);
  });

  it("keeps flagged submissions in the admin queue without publishing", () => {
    const update = applyModerationDecision({
      statusToUse: "submitted",
      aiReviewStatus: "completed",
      aiRiskLevel: "high",
      aiSuggestedAction: "review",
      aiSummary: "flagged",
      aiFlags: ["violence"],
    });

    expect(update.status).toBe("submitted");
    expect(
      responseNeedsAdminAttention({
        status: String(update.status),
        ai_review_status: String(update.ai_review_status),
        ai_risk_level: String(update.ai_risk_level),
        ai_suggested_action: String(update.ai_suggested_action),
        ai_flags: update.ai_flags as string[],
      })
    ).toBe(true);
  });
});
