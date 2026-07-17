import type { PublicModerationDecision } from "../server/moderatePublicContent";

export type VideoResponseAiReviewFields = {
  ai_review_status?: string | null;
  ai_risk_level?: string | null;
  ai_suggested_action?: string | null;
  ai_summary?: string | null;
  ai_flags?: string[] | null;
};

export const VIDEO_RESPONSE_AI_SCOPE_FLAG = "text_metadata_only";
export const VIDEO_RESPONSE_VIDEO_NOT_ANALYZED_FLAG = "video_not_analyzed";

export function buildVideoResponseAiFlags(
  flags: string[] | null | undefined
): string[] {
  const merged = new Set(flags ?? []);
  merged.add(VIDEO_RESPONSE_AI_SCOPE_FLAG);
  merged.add(VIDEO_RESPONSE_VIDEO_NOT_ANALYZED_FLAG);
  return [...merged];
}

export function buildVideoResponseAiUpdate(
  moderation: PublicModerationDecision
): Record<string, unknown> {
  return {
    ai_review_status: moderation.aiReviewStatus,
    ai_risk_level: moderation.aiRiskLevel,
    ai_suggested_action: moderation.aiSuggestedAction,
    ai_summary: moderation.aiSummary,
    ai_flags: buildVideoResponseAiFlags(moderation.aiFlags),
  };
}

export function buildUnavailableVideoResponseAiUpdate(
  summary: string
): Record<string, unknown> {
  return {
    ai_review_status: "unavailable",
    ai_risk_level: "medium",
    ai_suggested_action: "review",
    ai_summary: summary,
    ai_flags: buildVideoResponseAiFlags(["moderation_unavailable"]),
  };
}

export type VideoResponseAiReviewPresentation = {
  headline: string;
  detail: string;
  scopeLine: string;
  flags: string[];
};

export function presentVideoResponseAiReview(
  review: VideoResponseAiReviewFields | null | undefined
): VideoResponseAiReviewPresentation {
  const flags = Array.isArray(review?.ai_flags)
    ? review.ai_flags.filter((flag): flag is string => typeof flag === "string")
    : [];

  const status = review?.ai_review_status?.trim() || "unavailable";
  const suggestedAction = review?.ai_suggested_action?.trim() || null;
  const riskLevel = review?.ai_risk_level?.trim() || null;
  const summary =
    review?.ai_summary?.trim() ||
    "Automated review has not been recorded for this response yet.";

  let headline = "AI review unavailable — manual review required.";
  if (status === "completed" && suggestedAction === "approve") {
    headline = "AI review completed — text and metadata only.";
  } else if (status === "completed") {
    headline = "AI review flagged this response for human review.";
  } else if (status === "failed" || flags.includes("moderation_unavailable")) {
    headline = "AI review unavailable — manual review required.";
  } else if (status === "unavailable") {
    headline = "AI review unavailable — manual review required.";
  }

  const detailParts = [
    summary,
    suggestedAction ? `Suggested action: ${suggestedAction}` : null,
    riskLevel ? `Risk level: ${riskLevel}` : null,
    `Review status: ${status}`,
  ].filter(Boolean);

  return {
    headline,
    detail: detailParts.join(" · "),
    scopeLine:
      "Reviewed inputs: parent caption/text, parent story type, response context, and safe media metadata. Video frames, audio, and transcripts were not analyzed.",
    flags,
  };
}

export function resolveAdminParentContentText(response: {
  parent_story_text?: string | null;
  prayer_text?: string | null;
  parent_story_missing?: boolean;
}): string {
  const parentText =
    response.parent_story_text?.trim() || response.prayer_text?.trim() || "";
  if (parentText) return parentText;
  if (response.parent_story_missing) {
    return "Parent story could not be loaded. This response may be orphaned and should not be approved.";
  }
  return "Parent content unavailable.";
}
