import {
  CREATOR_STUDIO_REWRITE_MAX_CONTEXT_FIELD_CHARS,
  CREATOR_STUDIO_REWRITE_MAX_CONTEXT_KEY_CHARS,
  CREATOR_STUDIO_REWRITE_MAX_CURRENT_TEXT_CHARS,
  CREATOR_STUDIO_REWRITE_MAX_LAYER_CHARS,
} from "./creatorStudioAiLimits";

export type RewriteLayerValidationResult =
  | {
      ok: true;
      layer: string;
      action: string;
      currentText: string;
      storyContext: Record<string, unknown>;
    }
  | { ok: false; code: string; error: string; field: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

const allowedActions = new Set([
  "keep-words",
  "clearer",
  "worshipful",
  "shorter",
  "stronger",
  "alternatives",
]);

function readBoundedContextField(value: unknown, field: string):
  | { ok: true; value: string }
  | { ok: false; code: string; error: string; field: string } {
  const text = readString(value);
  if (text.length > CREATOR_STUDIO_REWRITE_MAX_CONTEXT_FIELD_CHARS) {
    return {
      ok: false,
      code: "payload_too_large",
      error: "Story context field is too long.",
      field,
    };
  }
  return { ok: true, value: text };
}

export function validateCreatorStudioRewriteInput(
  body: unknown
): RewriteLayerValidationResult {
  if (!isRecord(body)) {
    return {
      ok: false,
      code: "invalid_body",
      error: "Invalid request body.",
      field: "body",
    };
  }

  const layer = readString(body.layer) || "title";
  if (layer.length > CREATOR_STUDIO_REWRITE_MAX_LAYER_CHARS) {
    return {
      ok: false,
      code: "payload_too_large",
      error: "Layer identifier is too long.",
      field: "layer",
    };
  }

  const rawAction = readString(body.action) || "clearer";
  const action = allowedActions.has(rawAction) ? rawAction : "clearer";

  const currentText = readString(body.currentText).trim();
  if (!currentText) {
    return {
      ok: false,
      code: "missing_text",
      error: "Add some text before asking AI to rewrite it.",
      field: "currentText",
    };
  }

  if (currentText.length > CREATOR_STUDIO_REWRITE_MAX_CURRENT_TEXT_CHARS) {
    return {
      ok: false,
      code: "payload_too_large",
      error: "Text is too long to rewrite.",
      field: "currentText",
    };
  }

  const rawContext = isRecord(body.storyContext) ? body.storyContext : {};
  const storyContext: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rawContext)) {
    if (key.length > CREATOR_STUDIO_REWRITE_MAX_CONTEXT_KEY_CHARS) {
      return {
        ok: false,
        code: "payload_too_large",
        error: "Story context key is too long.",
        field: "storyContext",
      };
    }

    if (typeof value !== "string") {
      continue;
    }

    const bounded = readBoundedContextField(value, `storyContext.${key}`);
    if (bounded.ok === false) {
      return bounded;
    }

    storyContext[key] = bounded.value;
  }

  return {
    ok: true,
    layer,
    action,
    currentText,
    storyContext,
  };
}
