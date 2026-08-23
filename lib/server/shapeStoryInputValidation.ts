import {
  SHAPE_STORY_MAX_DRAFT_TEXT_CHARS,
  SHAPE_STORY_MAX_PROMPT_ANSWER_CHARS,
  SHAPE_STORY_MAX_PROMPT_ANSWERS,
  SHAPE_STORY_MAX_PROMPT_CHARS,
} from "./creatorStudioAiLimits";

export type ShapeStoryValidationResult =
  | { ok: true }
  | { ok: false; code: string; error: string; field: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function validateShapeStoryInput(body: Record<string, unknown>): ShapeStoryValidationResult {
  const prompt = readString(body.prompt);
  if (prompt.length > SHAPE_STORY_MAX_PROMPT_CHARS) {
    return {
      ok: false,
      code: "payload_too_large",
      error: "Prompt is too long.",
      field: "prompt",
    };
  }

  const draftText =
    readString(body.draftText) || readString(body.currentText);
  if (draftText.length > SHAPE_STORY_MAX_DRAFT_TEXT_CHARS) {
    return {
      ok: false,
      code: "payload_too_large",
      error: "Draft text is too long.",
      field: "draftText",
    };
  }

  if (body.promptAnswers !== undefined && !isRecord(body.promptAnswers)) {
    return {
      ok: false,
      code: "invalid_body",
      error: "Invalid promptAnswers payload.",
      field: "promptAnswers",
    };
  }

  if (isRecord(body.promptAnswers)) {
    const entries = Object.entries(body.promptAnswers);
    if (entries.length > SHAPE_STORY_MAX_PROMPT_ANSWERS) {
      return {
        ok: false,
        code: "payload_too_large",
        error: "Too many guided answers.",
        field: "promptAnswers",
      };
    }

    for (const [question, answer] of entries) {
      if (typeof answer !== "string") {
        return {
          ok: false,
          code: "invalid_body",
          error: "Invalid guided answer value.",
          field: "promptAnswers",
        };
      }

      if (answer.length > SHAPE_STORY_MAX_PROMPT_ANSWER_CHARS) {
        return {
          ok: false,
          code: "payload_too_large",
          error: "A guided answer is too long.",
          field: "promptAnswers",
        };
      }

      if (question.length > 500) {
        return {
          ok: false,
          code: "payload_too_large",
          error: "A guided answer key is too long.",
          field: "promptAnswers",
        };
      }
    }
  }

  const inspirationChips = readStringArray(body.inspirationChips);
  if (inspirationChips.length > 20) {
    return {
      ok: false,
      code: "payload_too_large",
      error: "Too many inspiration chips.",
      field: "inspirationChips",
    };
  }

  for (const chip of inspirationChips) {
    if (chip.length > 200) {
      return {
        ok: false,
        code: "payload_too_large",
        error: "An inspiration chip is too long.",
        field: "inspirationChips",
      };
    }
  }

  return { ok: true };
}
