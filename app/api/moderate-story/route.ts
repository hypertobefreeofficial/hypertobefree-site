import { NextResponse } from "next/server";

type ModerationResult = {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
};

function getDecision(result: ModerationResult) {
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

export async function POST(request: Request) {
  try {
    const rawApiKey = process.env.OPENAI_API_KEY ?? "";
    const apiKeyMatch = rawApiKey.match(/sk-[A-Za-z0-9_-]+/);
    const apiKey = apiKeyMatch?.[0];

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY environment variable." },
        { status: 500 }
      );
    }

    const body = await request.json();

    const storyText =
      typeof body.story_text === "string" ? body.story_text.trim() : "";

    const storyType =
      typeof body.story_type === "string" ? body.story_type.trim() : "";

    const inputText = [storyType, storyText].filter(Boolean).join("\n\n");

    if (!inputText) {
      return NextResponse.json({
        statusToUse: "submitted",
        aiRiskLevel: "medium",
        aiSuggestedAction: "review",
        aiSummary:
          "No text was provided for AI Assist to review. Admin review is recommended.",
        aiFlags: ["empty_text"],
        aiReviewStatus: "completed",
      });
    }

    const moderationResponse = await fetch(
      "https://api.openai.com/v1/moderations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "omni-moderation-latest",
          input: inputText,
        }),
      }
    );

    if (!moderationResponse.ok) {
      const errorText = await moderationResponse.text();

      console.error(
        "OpenAI moderation request failed:",
        moderationResponse.status,
        errorText.slice(0, 300)
      );

      return NextResponse.json(
        {
          error: "OpenAI moderation request failed.",
          status: moderationResponse.status,
          details: errorText.slice(0, 300),
        },
        { status: 500 }
      );
    }

    const moderationData = await moderationResponse.json();
    const result = moderationData.results?.[0] as ModerationResult | undefined;

    if (!result) {
      return NextResponse.json(
        { error: "No moderation result returned." },
        { status: 500 }
      );
    }

    const decision = getDecision(result);

    return NextResponse.json({
      ...decision,
      aiReviewStatus: "completed",
      rawFlagged: result.flagged,
    });
  } catch {
    console.error("AI moderation error occurred.");

    return NextResponse.json(
      { error: "AI moderation failed." },
      { status: 500 }
    );
  }
}
