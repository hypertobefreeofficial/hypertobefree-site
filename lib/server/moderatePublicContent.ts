export type PublicModerationDecision = {
  statusToUse: "approved" | "submitted";
  aiRiskLevel: "low" | "medium" | "high";
  aiSuggestedAction: "approve" | "review" | "reject";
  aiSummary: string;
  aiFlags: string[];
  aiReviewStatus: string;
};

type PublicModerationInput = {
  storyType: string;
  storyText: string;
  hasVideo: boolean;
  hasPhoto: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function submittedForReview(summary: string): PublicModerationDecision {
  return {
    statusToUse: "submitted",
    aiRiskLevel: "medium",
    aiSuggestedAction: "review",
    aiSummary: summary,
    aiFlags: ["moderation_unavailable"],
    aiReviewStatus: "failed",
  };
}

export async function moderatePublicContent({
  storyType,
  storyText,
  hasVideo,
  hasPhoto,
}: PublicModerationInput): Promise<PublicModerationDecision> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return submittedForReview(
      "AI moderation is unavailable, so this upload was sent to admin review."
    );
  }

  const input = [
    `Content type: ${storyType}`,
    `Video present: ${hasVideo ? "yes" : "no"}`,
    `Photo present: ${hasPhoto ? "yes" : "no"}`,
    storyText.trim() || "No written text was provided.",
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "omni-moderation-latest",
        input,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`OpenAI moderation failed with ${response.status}.`);
    }

    const payload: unknown = await response.json();
    const firstResult =
      isRecord(payload) && Array.isArray(payload.results)
        ? payload.results[0]
        : null;

    if (!isRecord(firstResult) || typeof firstResult.flagged !== "boolean") {
      throw new Error("OpenAI moderation returned an invalid response.");
    }

    const flags = isRecord(firstResult.categories)
      ? Object.entries(firstResult.categories)
          .filter(([, flagged]) => flagged === true)
          .map(([category]) => category)
      : [];

    if (firstResult.flagged) {
      return {
        statusToUse: "submitted",
        aiRiskLevel: "high",
        aiSuggestedAction: "review",
        aiSummary: "AI moderation flagged this upload for admin review.",
        aiFlags: flags,
        aiReviewStatus: "completed",
      };
    }

    return {
      statusToUse: "approved",
      aiRiskLevel: "low",
      aiSuggestedAction: "approve",
      aiSummary: "AI moderation found no flagged content in the submitted text.",
      aiFlags: [],
      aiReviewStatus: "completed",
    };
  } catch (error) {
    console.error("Public content moderation failed:", error);

    return submittedForReview(
      "AI moderation could not complete, so this upload was sent to admin review."
    );
  }
}
