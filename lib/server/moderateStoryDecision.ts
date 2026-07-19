export type ModerationResult = {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
};

export type ModerationDecision = {
  statusToUse: "approved" | "submitted";
  aiRiskLevel: "low" | "medium" | "high";
  aiSuggestedAction: "approve" | "review";
  aiSummary: string;
  aiFlags: string[];
};

export function getModerationDecision(result: ModerationResult): ModerationDecision {
  const flags = Object.entries(result.categories)
    .filter(([, value]) => value === true)
    .map(([key]) => key);

  const scores = Object.values(result.category_scores);
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;

  const severe =
    result.categories["sexual/minors"] === true ||
    result.categories["self-harm/instructions"] === true ||
    result.categories["self-harm/intent"] === true ||
    result.categories["violence/graphic"] === true ||
    result.categories["hate/threatening"] === true;

  if (severe || result.flagged || maxScore >= 0.75) {
    return {
      statusToUse: "submitted",
      aiRiskLevel: "high",
      aiSuggestedAction: "review",
      aiSummary:
        "AI Assist found a safety flag. This upload should be reviewed by an admin.",
      aiFlags: flags.length > 0 ? flags : ["high_score"],
    };
  }

  if (maxScore >= 0.35) {
    return {
      statusToUse: "submitted",
      aiRiskLevel: "medium",
      aiSuggestedAction: "review",
      aiSummary:
        "AI Assist found a moderate risk signal. This upload should wait for admin review.",
      aiFlags: flags.length > 0 ? flags : ["medium_score"],
    };
  }

  return {
    statusToUse: "approved",
    aiRiskLevel: "low",
    aiSuggestedAction: "approve",
    aiSummary:
      "AI Assist did not find safety concerns. This upload can be approved automatically.",
    aiFlags: [],
  };
}

export function emptyTextModerationResponse(): ModerationDecision & {
  aiReviewStatus: "completed";
} {
  return {
    statusToUse: "submitted",
    aiRiskLevel: "medium",
    aiSuggestedAction: "review",
    aiSummary:
      "No text was provided for AI Assist to review. Admin review is recommended.",
    aiFlags: ["empty_text"],
    aiReviewStatus: "completed",
  };
}
