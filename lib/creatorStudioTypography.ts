import type {
  CreatorStudioDesign,
  CreatorStudioLayerStyle,
  CreatorStudioTextLayer,
} from "./creationCenter";

export type CreatorStudioFontPreset =
  | "modern-bold"
  | "elegant-serif"
  | "warm-rounded"
  | "editorial"
  | "cinematic"
  | "reflective"
  | "worshipful"
  | "handwritten-accent";

export const CREATOR_STUDIO_FONT_SCALE_MIN = 0.55;
export const CREATOR_STUDIO_FONT_SCALE_MAX = 2.2;

export const creatorStudioFontPresets: {
  value: CreatorStudioFontPreset;
  label: string;
  className: string;
}[] = [
  {
    value: "modern-bold",
    label: "Modern bold",
    className: "font-[family-name:var(--font-creator-modern)] tracking-tight",
  },
  {
    value: "elegant-serif",
    label: "Elegant serif",
    className: "font-[family-name:var(--font-creator-serif)] tracking-[0.01em]",
  },
  {
    value: "warm-rounded",
    label: "Warm rounded",
    className: "font-[family-name:var(--font-creator-rounded)] tracking-normal",
  },
  {
    value: "editorial",
    label: "Editorial",
    className:
      "font-[family-name:var(--font-creator-editorial)] tracking-[-0.02em]",
  },
  {
    value: "cinematic",
    label: "Cinematic",
    className:
      "font-[family-name:var(--font-creator-cinematic)] uppercase tracking-[0.08em]",
  },
  {
    value: "reflective",
    label: "Reflective",
    className: "font-[family-name:var(--font-creator-reflective)] tracking-wide",
  },
  {
    value: "worshipful",
    label: "Worshipful",
    className:
      "font-[family-name:var(--font-creator-worship)] tracking-[0.04em]",
  },
  {
    value: "handwritten-accent",
    label: "Handwritten accent",
    className:
      "font-[family-name:var(--font-creator-handwritten)] tracking-normal",
  },
];

const presetClassMap = Object.fromEntries(
  creatorStudioFontPresets.map((preset) => [preset.value, preset.className])
) as Record<CreatorStudioFontPreset, string>;

export function clampCreatorStudioFontScale(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }

  return Math.min(
    CREATOR_STUDIO_FONT_SCALE_MAX,
    Math.max(CREATOR_STUDIO_FONT_SCALE_MIN, value)
  );
}

export function inferFontPresetFromDesign(
  design: CreatorStudioDesign
): CreatorStudioFontPreset {
  const hint =
    `${design.typographyPairing ?? ""} ${design.typographyStyle ?? ""} ${design.visualTheme ?? ""} ${design.styleMood ?? ""}`.toLowerCase();

  if (
    hint.includes("handwritten") ||
    hint.includes("journal") ||
    hint.includes("scrapbook")
  ) {
    return "handwritten-accent";
  }
  if (
    hint.includes("worship") ||
    hint.includes("praise") ||
    hint.includes("celebration")
  ) {
    return "worshipful";
  }
  if (
    hint.includes("cinematic") ||
    hint.includes("poster") ||
    hint.includes("documentary")
  ) {
    return "cinematic";
  }
  if (
    hint.includes("editorial") ||
    hint.includes("magazine") ||
    hint.includes("timeline")
  ) {
    return "editorial";
  }
  if (
    hint.includes("minimal") ||
    hint.includes("peaceful") ||
    hint.includes("devotional") ||
    hint.includes("reflect")
  ) {
    return "reflective";
  }
  if (
    hint.includes("serif") ||
    hint.includes("elegant") ||
    hint.includes("quote")
  ) {
    return "elegant-serif";
  }
  if (hint.includes("warm") || hint.includes("friendly") || hint.includes("social")) {
    return "warm-rounded";
  }

  return "modern-bold";
}

export function getDefaultLayerFontPreset(
  design: CreatorStudioDesign,
  layer: CreatorStudioTextLayer
): CreatorStudioFontPreset {
  const base = inferFontPresetFromDesign(design);

  switch (design.layoutType) {
    case "magazine-style":
      if (layer === "title") return "editorial";
      if (layer === "overlay") return "reflective";
      if (layer === "scripture") return "worshipful";
      return base;
    case "full-image-poster":
      if (layer === "title") return "cinematic";
      if (layer === "caption") return "modern-bold";
      return base;
    case "quote-card":
      if (layer === "title") return "elegant-serif";
      if (layer === "scripture") return "worshipful";
      return "reflective";
    case "praise-report-card":
      if (layer === "title") return "worshipful";
      if (layer === "overlay") return "modern-bold";
      return base;
    case "journal-style":
      if (layer === "title") return "handwritten-accent";
      if (layer === "overlay" || layer === "caption") return "reflective";
      return base;
    case "scripture-card":
      if (layer === "scripture" || layer === "title") return "worshipful";
      return "reflective";
    case "split-layout":
      if (layer === "title") return "editorial";
      return "modern-bold";
    case "prayer-request-card":
      return "reflective";
    case "timeline-story":
      if (layer === "caption") return "warm-rounded";
      if (layer === "title") return "editorial";
      return base;
    case "before-after-testimony":
      if (layer === "title") return "cinematic";
      return "modern-bold";
    default:
      if (layer === "scripture") return "worshipful";
      if (layer === "caption") return "reflective";
      return base;
  }
}

export function getCreatorStudioFontClassName(
  design: CreatorStudioDesign,
  layerStyle: CreatorStudioLayerStyle,
  layer: CreatorStudioTextLayer
) {
  const preset =
    layerStyle.fontPreset ?? getDefaultLayerFontPreset(design, layer);

  return presetClassMap[preset] ?? presetClassMap["modern-bold"];
}

export function getCreatorStudioFontPresetLabel(
  preset: CreatorStudioFontPreset | undefined
) {
  return (
    creatorStudioFontPresets.find((entry) => entry.value === preset)?.label ??
    "Modern bold"
  );
}
