import {
  buildCreatorStudioLayerDisplayTextUpdate,
  getCreatorStudioLayerDisplayText,
  type CreatorStudioDesign,
  type CreatorStudioTextLayer,
} from "./creationCenter";

export type CreatorStudioLayerRewriteAction =
  | "stronger"
  | "softer"
  | "hopeful"
  | "personal"
  | "biblical"
  | "shorten"
  | "alternatives"
  | "peaceful"
  | "encouraging"
  | "powerful"
  | "joyful";

export const creatorStudioLayerRewriteActions: {
  value: CreatorStudioLayerRewriteAction;
  label: string;
  emoji: string;
}[] = [
  { value: "stronger", label: "Make stronger", emoji: "✨" },
  { value: "peaceful", label: "More peaceful", emoji: "🕊" },
  { value: "personal", label: "More personal", emoji: "❤️" },
  { value: "biblical", label: "Add scripture tone", emoji: "📖" },
  { value: "encouraging", label: "More encouraging", emoji: "🙏" },
  { value: "shorten", label: "Make shorter", emoji: "✂" },
  { value: "powerful", label: "More powerful", emoji: "🔥" },
  { value: "joyful", label: "More joyful", emoji: "😊" },
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
