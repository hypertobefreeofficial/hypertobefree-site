import {
  buildCreatorStudioLayerDisplayTextUpdate,
  getCreatorStudioLayerDisplayText,
  type CreatorStudioDesign,
  type CreatorStudioTextLayer,
} from "./creationCenter";

export type CreatorStudioLayerRewriteAction =
  | "keep-words"
  | "clearer"
  | "worshipful"
  | "shorter"
  | "stronger"
  | "alternatives";

export const creatorStudioLayerRewriteActions: {
  value: CreatorStudioLayerRewriteAction;
  label: string;
  emoji: string;
  description: string;
}[] = [
  {
    value: "keep-words",
    label: "Keep my words",
    emoji: "✓",
    description: "Light punctuation and capitalization only.",
  },
  {
    value: "clearer",
    label: "Make slightly clearer",
    emoji: "✎",
    description: "Light polish while preserving your meaning.",
  },
  {
    value: "worshipful",
    label: "Make more worshipful",
    emoji: "🙏",
    description: "Gentle worship tone without changing your story.",
  },
  {
    value: "shorter",
    label: "Make shorter",
    emoji: "✂",
    description: "Trim words while keeping the same message.",
  },
  {
    value: "stronger",
    label: "Make stronger",
    emoji: "✨",
    description: "Rewrite strongly — only when you want bolder wording.",
  },
  {
    value: "alternatives",
    label: "Try alternatives",
    emoji: "💡",
    description: "See options and choose one yourself.",
  },
];

export type LayerRewriteResult =
  | { kind: "text"; text: string }
  | { kind: "alternatives"; alternatives: string[] }
  | { kind: "error"; message: string };

export async function requestCreatorStudioLayerRewrite({
  layer,
  action,
  design,
  accessToken,
}: {
  layer: CreatorStudioTextLayer;
  action: CreatorStudioLayerRewriteAction;
  design: CreatorStudioDesign;
  accessToken?: string;
}): Promise<LayerRewriteResult> {
  const currentText = getCreatorStudioLayerDisplayText(design, layer);

  if (!currentText.trim()) {
    return { kind: "error", message: "Add a little text first." };
  }

  const response = await fetch("/api/creator-studio-rewrite-layer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      layer,
      action,
      currentText,
      storyContext: {
        title: design.title,
        overlayText: design.overlayText,
        caption: design.caption,
        category: design.category,
        topic: design.topic,
        visualTheme: design.visualTheme,
        typographyStyle: design.typographyStyle,
      },
    }),
  });

  const payload = (await response.json()) as {
    error?: string;
    text?: string;
    alternatives?: string[];
  };

  if (!response.ok) {
    return {
      kind: "error",
      message: payload.error || "Could not rewrite this text right now.",
    };
  }

  if (action === "alternatives" && payload.alternatives?.length) {
    return { kind: "alternatives", alternatives: payload.alternatives };
  }

  if (payload.text?.trim()) {
    return { kind: "text", text: payload.text.trim() };
  }

  return { kind: "error", message: "No rewrite returned. Try again." };
}

export function applyLayerRewriteText(
  layer: CreatorStudioTextLayer,
  text: string
): Partial<CreatorStudioDesign> {
  return buildCreatorStudioLayerDisplayTextUpdate(layer, text);
}

export function polishTextLocally(
  text: string,
  action: CreatorStudioLayerRewriteAction
): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  if (action === "keep-words") {
    const normalized = trimmed.replace(/\s+/g, " ");
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  if (action === "shorter") {
    const words = trimmed.split(/\s+/);
    return words.slice(0, Math.max(3, Math.ceil(words.length * 0.7))).join(" ");
  }

  if (action === "worshipful") {
    if (/^thank you/i.test(trimmed)) {
      return trimmed.replace(/^thank you/i, "Thank You");
    }
    return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
  }

  if (action === "clearer") {
    return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
  }

  return trimmed;
}
