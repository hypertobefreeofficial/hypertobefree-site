import { type CreatorStudioImageAction } from "../creationCenter";
import {
  CREATOR_STUDIO_IMAGE_MAX_COLOR_PALETTE_ITEMS,
  CREATOR_STUDIO_IMAGE_MAX_CONSTRUCTED_PROMPT_CHARS,
  CREATOR_STUDIO_IMAGE_MAX_DESIGN_FIELD_CHARS,
  CREATOR_STUDIO_IMAGE_MAX_USER_PROMPT_CHARS,
} from "./creatorStudioAiLimits";

const allowedActions: CreatorStudioImageAction[] = [
  "AI Background",
  "New Background",
  "Generate Visual Design",
];

export type CreatorStudioImageValidationResult =
  | {
      ok: true;
      action: CreatorStudioImageAction;
      prompt: string;
      design: Record<string, unknown>;
      imagePrompt: string;
    }
  | { ok: false; code: string; error: string; field: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readBoundedDesignField(value: unknown, field: string):
  | { ok: true; value: string }
  | { ok: false; code: string; error: string; field: string } {
  const text = readString(value);
  if (text.length > CREATOR_STUDIO_IMAGE_MAX_DESIGN_FIELD_CHARS) {
    return {
      ok: false,
      code: "payload_too_large",
      error: "Design metadata field is too long.",
      field,
    };
  }
  return { ok: true, value: text };
}

function readAction(value: unknown): CreatorStudioImageAction | null {
  if (typeof value !== "string") return null;
  return allowedActions.includes(value as CreatorStudioImageAction)
    ? (value as CreatorStudioImageAction)
    : null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, CREATOR_STUDIO_IMAGE_MAX_COLOR_PALETTE_ITEMS)
    : [];
}

export function buildCreatorStudioImagePrompt({
  action,
  prompt,
  design,
}: {
  action: CreatorStudioImageAction;
  prompt: string;
  design: Record<string, unknown>;
}) {
  const readField = (key: string) => readString(design[key]);
  const colorPalette = readStringArray(design.colorPalette);

  return [
    "Create a premium vertical HTBF faith-centered background/design asset for a mobile post.",
    "Do not include readable text, letters, captions, Bible verse text, logos, watermarks, UI, buttons, or app chrome.",
    "Leave natural open space for the app to overlay title/caption text later.",
    "Use a modern, sophisticated, faith-centered visual language with deep HTBF navy, luminous blue, soft white, and tasteful gold accents when appropriate.",
    "Avoid cheesy religious clip art. Favor cinematic light, peaceful nature, abstract sacred atmosphere, elegant texture, and polished editorial composition.",
    `Requested visual action: ${action}`,
    `User story prompt: ${prompt || "A beautiful HTBF faith-centered testimony design."}`,
    readField("title") ? `Working title: ${readField("title")}` : "",
    readField("category") ? `Category: ${readField("category")}` : "",
    readField("topic") ? `Topic: ${readField("topic")}` : "",
    readField("styleMood") ? `Mood: ${readField("styleMood")}` : "",
    readField("layoutType") ? `Layout direction: ${readField("layoutType")}` : "",
    readField("visualTheme") ? `Visual theme: ${readField("visualTheme")}` : "",
    readField("backgroundTreatment")
      ? `Background treatment: ${readField("backgroundTreatment")}`
      : "",
    colorPalette.length > 0
      ? `Preferred palette: ${colorPalette.join(", ")}`
      : "",
    "Portrait composition, 9:16, polished background asset only.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function validateCreatorStudioImageInput(
  body: unknown
): CreatorStudioImageValidationResult {
  if (!isRecord(body)) {
    return {
      ok: false,
      code: "invalid_body",
      error: "Invalid request body.",
      field: "body",
    };
  }

  const action = readAction(body.action);
  if (!action) {
    return {
      ok: false,
      code: "invalid_action",
      error: "Choose AI Background, New Background, or Generate Visual Design.",
      field: "action",
    };
  }

  const prompt = readString(body.prompt);
  if (prompt.length > CREATOR_STUDIO_IMAGE_MAX_USER_PROMPT_CHARS) {
    return {
      ok: false,
      code: "payload_too_large",
      error: "Image prompt is too long.",
      field: "prompt",
    };
  }

  const rawDesign = isRecord(body.design) ? body.design : {};
  const design: Record<string, unknown> = {};

  for (const key of [
    "title",
    "category",
    "topic",
    "styleMood",
    "layoutType",
    "visualTheme",
    "backgroundTreatment",
  ]) {
    if (rawDesign[key] === undefined) continue;
    const bounded = readBoundedDesignField(rawDesign[key], `design.${key}`);
    if (bounded.ok === false) {
      return bounded;
    }
    if (bounded.value) {
      design[key] = bounded.value;
    }
  }

  if (rawDesign.colorPalette !== undefined) {
    if (!Array.isArray(rawDesign.colorPalette)) {
      return {
        ok: false,
        code: "invalid_body",
        error: "Invalid color palette.",
        field: "design.colorPalette",
      };
    }

    const palette = readStringArray(rawDesign.colorPalette);
    for (const color of palette) {
      if (color.length > 50) {
        return {
          ok: false,
          code: "payload_too_large",
          error: "A palette color value is too long.",
          field: "design.colorPalette",
        };
      }
    }

    design.colorPalette = palette;
  }

  const imagePrompt = buildCreatorStudioImagePrompt({ action, prompt, design });
  if (imagePrompt.length > CREATOR_STUDIO_IMAGE_MAX_CONSTRUCTED_PROMPT_CHARS) {
    return {
      ok: false,
      code: "payload_too_large",
      error: "Combined image prompt is too long.",
      field: "prompt",
    };
  }

  return {
    ok: true,
    action,
    prompt,
    design,
    imagePrompt,
  };
}
