import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateShapeStoryInput } from "./shapeStoryInputValidation";
import { SHAPE_STORY_MAX_DRAFT_TEXT_CHARS, SHAPE_STORY_MAX_PROMPT_CHARS } from "./creatorStudioAiLimits";

describe("validateShapeStoryInput", () => {
  it("accepts valid payloads", () => {
    expect(
      validateShapeStoryInput({
        prompt: "Tell my story",
        draftText: "God is good.",
        promptAnswers: { q1: "Answer" },
      }).ok
    ).toBe(true);
  });

  it("rejects oversized prompt", () => {
    const result = validateShapeStoryInput({
      prompt: "x".repeat(SHAPE_STORY_MAX_PROMPT_CHARS + 1),
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.field).toBe("prompt");
    }
  });

  it("rejects oversized draft text", () => {
    const result = validateShapeStoryInput({
      draftText: "x".repeat(SHAPE_STORY_MAX_DRAFT_TEXT_CHARS + 1),
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.field).toBe("draftText");
    }
  });

  it("rejects too many promptAnswers", () => {
    const promptAnswers: Record<string, string> = {};
    for (let index = 0; index < 21; index += 1) {
      promptAnswers[`q${index}`] = "answer";
    }

    const result = validateShapeStoryInput({ promptAnswers });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.field).toBe("promptAnswers");
    }
  });
});
