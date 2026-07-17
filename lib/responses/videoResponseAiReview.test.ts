import { describe, expect, it } from "vitest";
import {
  buildVideoResponseAiUpdate,
  presentVideoResponseAiReview,
  resolveAdminParentContentText,
  VIDEO_RESPONSE_AI_SCOPE_FLAG,
} from "./videoResponseAiReview";

describe("presentVideoResponseAiReview", () => {
  it("describes completed low-risk review as text/metadata only", () => {
    const presentation = presentVideoResponseAiReview({
      ai_review_status: "completed",
      ai_risk_level: "low",
      ai_suggested_action: "approve",
      ai_summary: "AI moderation found no flagged content in the submitted text.",
      ai_flags: [VIDEO_RESPONSE_AI_SCOPE_FLAG],
    });

    expect(presentation.headline).toMatch(/text and metadata only/i);
    expect(presentation.scopeLine).toMatch(/Video frames, audio, and transcripts were not analyzed/i);
  });

  it("shows unavailable state when no AI fields exist", () => {
    const presentation = presentVideoResponseAiReview(null);
    expect(presentation.headline).toMatch(/unavailable/i);
  });
});

describe("buildVideoResponseAiUpdate", () => {
  it("always records text/metadata scope flags", () => {
    const update = buildVideoResponseAiUpdate({
      statusToUse: "submitted",
      aiReviewStatus: "completed",
      aiRiskLevel: "low",
      aiSuggestedAction: "approve",
      aiSummary: "ok",
      aiFlags: [],
    });

    expect(update.ai_flags).toEqual(
      expect.arrayContaining(["text_metadata_only", "video_not_analyzed"])
    );
  });
});

describe("resolveAdminParentContentText", () => {
  it("prefers feed parent story text over legacy prayer_text", () => {
    expect(
      resolveAdminParentContentText({
        parent_story_text: "Feed caption",
        prayer_text: null,
      })
    ).toBe("Feed caption");
  });

  it("marks missing parent stories as orphaned", () => {
    expect(
      resolveAdminParentContentText({
        parent_story_text: null,
        prayer_text: null,
        parent_story_missing: true,
      })
    ).toMatch(/orphaned/i);
  });
});
