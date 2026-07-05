import type { CSSProperties } from "react";
import type {
  CreatorStudioDesign,
  CreatorStudioLayerStyle,
  CreatorStudioTextLayer,
} from "./creationCenter";

export type CreatorStudioFontPreset =
  | "modern-bold"
  | "aptos-clean"
  | "classic-serif"
  | "script-elegant"
  | "handwritten"
  | "worship-serif"
  | "scripture-classic"
  | "cinematic"
  | "minimal"
  | "editorial"
  | "soft-rounded"
  | "strong-impact"
  | "peaceful"
  | "joyful"
  | "caption-clean";

export type CreatorStudioFontPresetCategory =
  | "Modern"
  | "Serif"
  | "Script"
  | "Display"
  | "Warm"
  | "Utility";

export const CREATOR_STUDIO_FONT_PRESET_VALUES: CreatorStudioFontPreset[] = [
  "modern-bold",
  "aptos-clean",
  "classic-serif",
  "script-elegant",
  "handwritten",
  "worship-serif",
  "scripture-classic",
  "cinematic",
  "minimal",
  "editorial",
  "soft-rounded",
  "strong-impact",
  "peaceful",
  "joyful",
  "caption-clean",
];

export const CREATOR_STUDIO_FONT_PRESET_CATEGORIES: CreatorStudioFontPresetCategory[] =
  ["Modern", "Serif", "Script", "Display", "Warm", "Utility"];

const LEGACY_FONT_PRESET_MAP: Record<string, CreatorStudioFontPreset> = {
  "elegant-serif": "classic-serif",
  "warm-rounded": "soft-rounded",
  reflective: "minimal",
  worshipful: "worship-serif",
  "handwritten-accent": "handwritten",
};

export type CreatorStudioFontPresetDefinition = {
  value: CreatorStudioFontPreset;
  label: string;
  category: CreatorStudioFontPresetCategory;
  previewSample: string;
  fontFamily: string;
  className: string;
  weight: "regular" | "bold";
  italic: boolean;
  fontSize: NonNullable<CreatorStudioLayerStyle["fontSize"]>;
  fontScale: number;
  letterSpacing: number;
  lineHeight: number;
  shadowStrength: number;
  outlineWidth: number;
};

export const creatorStudioFontPresets: CreatorStudioFontPresetDefinition[] = [
  {
    value: "modern-bold",
    label: "Modern Bold",
    category: "Modern",
    previewSample: "FREEDOM",
    fontFamily: "DM Sans",
    className:
      "font-[family-name:var(--font-creator-modern-bold)] tracking-tight uppercase",
    weight: "bold",
    italic: false,
    fontSize: "hero",
    fontScale: 1.14,
    letterSpacing: -0.03,
    lineHeight: 0.98,
    shadowStrength: 0.55,
    outlineWidth: 0,
  },
  {
    value: "aptos-clean",
    label: "Aptos Clean",
    category: "Modern",
    previewSample: "Grace",
    fontFamily: "Segoe UI",
    className:
      "font-[family-name:var(--font-creator-aptos-clean)] tracking-normal normal-case",
    weight: "regular",
    italic: false,
    fontSize: "large",
    fontScale: 1.02,
    letterSpacing: 0,
    lineHeight: 1.24,
    shadowStrength: 0,
    outlineWidth: 0,
  },
  {
    value: "classic-serif",
    label: "Classic Serif",
    category: "Serif",
    previewSample: "Truth",
    fontFamily: "Times New Roman",
    className:
      "font-[family-name:var(--font-creator-classic-serif)] tracking-[0.02em] normal-case",
    weight: "regular",
    italic: false,
    fontSize: "large",
    fontScale: 1.08,
    letterSpacing: 0.02,
    lineHeight: 1.16,
    shadowStrength: 0.28,
    outlineWidth: 0,
  },
  {
    value: "script-elegant",
    label: "Script Elegant",
    category: "Script",
    previewSample: "Blessed",
    fontFamily: "Great Vibes",
    className:
      "font-[family-name:var(--font-creator-script-elegant)] tracking-normal normal-case",
    weight: "regular",
    italic: false,
    fontSize: "hero",
    fontScale: 1.22,
    letterSpacing: 0.01,
    lineHeight: 1,
    shadowStrength: 0.32,
    outlineWidth: 0,
  },
  {
    value: "handwritten",
    label: "Handwritten",
    category: "Script",
    previewSample: "My Story",
    fontFamily: "Caveat",
    className:
      "font-[family-name:var(--font-creator-handwritten)] tracking-normal normal-case",
    weight: "regular",
    italic: false,
    fontSize: "large",
    fontScale: 1.18,
    letterSpacing: 0.004,
    lineHeight: 1.08,
    shadowStrength: 0.2,
    outlineWidth: 0,
  },
  {
    value: "worship-serif",
    label: "Worship Serif",
    category: "Serif",
    previewSample: "HOLY",
    fontFamily: "Cormorant Garamond",
    className:
      "font-[family-name:var(--font-creator-worship-serif)] tracking-[0.14em] uppercase",
    weight: "bold",
    italic: false,
    fontSize: "large",
    fontScale: 1.1,
    letterSpacing: 0.14,
    lineHeight: 1.04,
    shadowStrength: 0.42,
    outlineWidth: 0,
  },
  {
    value: "scripture-classic",
    label: "Scripture Classic",
    category: "Serif",
    previewSample: "Psalm 23",
    fontFamily: "Merriweather",
    className:
      "font-[family-name:var(--font-creator-scripture-classic)] tracking-[0.04em] normal-case",
    weight: "regular",
    italic: true,
    fontSize: "medium",
    fontScale: 0.98,
    letterSpacing: 0.04,
    lineHeight: 1.42,
    shadowStrength: 0.14,
    outlineWidth: 0,
  },
  {
    value: "cinematic",
    label: "Cinematic",
    category: "Display",
    previewSample: "BREAKTHROUGH",
    fontFamily: "Oswald",
    className:
      "font-[family-name:var(--font-creator-cinematic)] uppercase tracking-[0.16em]",
    weight: "bold",
    italic: false,
    fontSize: "hero",
    fontScale: 1.16,
    letterSpacing: 0.16,
    lineHeight: 0.92,
    shadowStrength: 0.72,
    outlineWidth: 0,
  },
  {
    value: "minimal",
    label: "Minimal",
    category: "Modern",
    previewSample: "still",
    fontFamily: "Helvetica Neue",
    className:
      "font-[family-name:var(--font-creator-minimal)] tracking-[0.12em] lowercase",
    weight: "regular",
    italic: false,
    fontSize: "medium",
    fontScale: 0.9,
    letterSpacing: 0.12,
    lineHeight: 1.45,
    shadowStrength: 0,
    outlineWidth: 0,
  },
  {
    value: "editorial",
    label: "Editorial",
    category: "Display",
    previewSample: "Revival",
    fontFamily: "Playfair Display",
    className:
      "font-[family-name:var(--font-creator-editorial)] tracking-[-0.04em] normal-case",
    weight: "bold",
    italic: false,
    fontSize: "hero",
    fontScale: 1.1,
    letterSpacing: -0.04,
    lineHeight: 1.02,
    shadowStrength: 0.46,
    outlineWidth: 0,
  },
  {
    value: "soft-rounded",
    label: "Soft Rounded",
    category: "Warm",
    previewSample: "Kindness",
    fontFamily: "Nunito",
    className:
      "font-[family-name:var(--font-creator-soft-rounded)] tracking-normal normal-case",
    weight: "regular",
    italic: false,
    fontSize: "large",
    fontScale: 1.04,
    letterSpacing: 0.01,
    lineHeight: 1.28,
    shadowStrength: 0.16,
    outlineWidth: 0,
  },
  {
    value: "strong-impact",
    label: "Strong Impact",
    category: "Display",
    previewSample: "VICTORY",
    fontFamily: "Bebas Neue",
    className:
      "font-[family-name:var(--font-creator-strong-impact)] uppercase tracking-[0.08em]",
    weight: "bold",
    italic: false,
    fontSize: "hero",
    fontScale: 1.24,
    letterSpacing: 0.08,
    lineHeight: 0.88,
    shadowStrength: 0.62,
    outlineWidth: 0.65,
  },
  {
    value: "peaceful",
    label: "Peaceful",
    category: "Warm",
    previewSample: "Rest",
    fontFamily: "Lora",
    className:
      "font-[family-name:var(--font-creator-peaceful)] tracking-[0.03em] normal-case",
    weight: "regular",
    italic: true,
    fontSize: "medium",
    fontScale: 1,
    letterSpacing: 0.03,
    lineHeight: 1.48,
    shadowStrength: 0.08,
    outlineWidth: 0,
  },
  {
    value: "joyful",
    label: "Joyful",
    category: "Warm",
    previewSample: "Celebrate!",
    fontFamily: "Fredoka",
    className:
      "font-[family-name:var(--font-creator-joyful)] tracking-[0.02em] normal-case",
    weight: "bold",
    italic: false,
    fontSize: "large",
    fontScale: 1.12,
    letterSpacing: 0.02,
    lineHeight: 1.12,
    shadowStrength: 0.3,
    outlineWidth: 0,
  },
  {
    value: "caption-clean",
    label: "Caption Clean",
    category: "Utility",
    previewSample: "Every detail matters in the story we share together.",
    fontFamily: "Source Sans 3",
    className:
      "font-[family-name:var(--font-creator-caption-clean)] tracking-normal normal-case",
    weight: "regular",
    italic: false,
    fontSize: "small",
    fontScale: 0.88,
    letterSpacing: 0.006,
    lineHeight: 1.46,
    shadowStrength: 0.04,
    outlineWidth: 0,
  },
];

const presetDefinitionMap = Object.fromEntries(
  creatorStudioFontPresets.map((preset) => [preset.value, preset])
) as Record<CreatorStudioFontPreset, CreatorStudioFontPresetDefinition>;

const presetClassMap = Object.fromEntries(
  creatorStudioFontPresets.map((preset) => [preset.value, preset.className])
) as Record<CreatorStudioFontPreset, string>;

export const CREATOR_STUDIO_FONT_SCALE_MIN = 0.55;
export const CREATOR_STUDIO_FONT_SCALE_MAX = 2.2;

export function groupCreatorStudioFontPresetsByCategory() {
  return CREATOR_STUDIO_FONT_PRESET_CATEGORIES.map((category) => ({
    category,
    presets: creatorStudioFontPresets.filter(
      (preset) => preset.category === category
    ),
  })).filter((group) => group.presets.length > 0);
}

export function normalizeCreatorStudioFontPreset(
  value: string | undefined | null
): CreatorStudioFontPreset | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  const normalized = LEGACY_FONT_PRESET_MAP[trimmed] ?? trimmed;

  return CREATOR_STUDIO_FONT_PRESET_VALUES.includes(
    normalized as CreatorStudioFontPreset
  )
    ? (normalized as CreatorStudioFontPreset)
    : undefined;
}

export function getCreatorStudioFontPresetDefinition(
  fontPreset: CreatorStudioFontPreset | string | undefined | null
) {
  const normalized = normalizeCreatorStudioFontPreset(fontPreset ?? undefined);
  if (!normalized) return null;
  return presetDefinitionMap[normalized] ?? null;
}

export function buildCreatorStudioFontPresetPreviewStyle(
  preset: CreatorStudioFontPresetDefinition
): { className: string; style: CSSProperties } {
  return {
    className: `${preset.className} ${
      preset.weight === "bold" ? "font-black" : "font-semibold"
    } ${preset.italic ? "italic" : ""}`,
    style: {
      letterSpacing: `${preset.letterSpacing}em`,
      lineHeight: preset.lineHeight,
      textShadow:
        preset.shadowStrength > 0
          ? `0 2px ${Math.round(preset.shadowStrength * 18)}px rgba(0,0,0,${Math.min(0.85, preset.shadowStrength)})`
          : undefined,
      WebkitTextStroke:
        preset.outlineWidth > 0
          ? `${preset.outlineWidth}px rgba(0,0,0,${Math.min(0.75, 0.25 + preset.outlineWidth * 0.15)})`
          : undefined,
    },
  };
}

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
    return "handwritten";
  }
  if (
    hint.includes("worship") ||
    hint.includes("praise") ||
    hint.includes("celebration")
  ) {
    return "worship-serif";
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
    return "peaceful";
  }
  if (
    hint.includes("serif") ||
    hint.includes("elegant") ||
    hint.includes("quote")
  ) {
    return "classic-serif";
  }
  if (hint.includes("warm") || hint.includes("friendly") || hint.includes("social")) {
    return "joyful";
  }
  if (hint.includes("caption")) {
    return "caption-clean";
  }
  if (hint.includes("aptos") || hint.includes("clean")) {
    return "aptos-clean";
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
      if (layer === "overlay") return "minimal";
      if (layer === "scripture") return "scripture-classic";
      return base;
    case "full-image-poster":
      if (layer === "title") return "cinematic";
      if (layer === "caption") return "caption-clean";
      return base;
    case "quote-card":
      if (layer === "title") return "classic-serif";
      if (layer === "scripture") return "scripture-classic";
      return "peaceful";
    case "praise-report-card":
      if (layer === "title") return "worship-serif";
      if (layer === "overlay") return "modern-bold";
      return base;
    case "journal-style":
      if (layer === "title") return "handwritten";
      if (layer === "overlay" || layer === "caption") return "peaceful";
      return base;
    case "scripture-card":
      if (layer === "scripture" || layer === "title") return "scripture-classic";
      return "peaceful";
    case "split-layout":
      if (layer === "title") return "editorial";
      return "modern-bold";
    case "prayer-request-card":
      return "peaceful";
    case "timeline-story":
      if (layer === "caption") return "caption-clean";
      if (layer === "title") return "editorial";
      return base;
    case "before-after-testimony":
      if (layer === "title") return "strong-impact";
      return "modern-bold";
    default:
      if (layer === "scripture") return "scripture-classic";
      if (layer === "caption") return "caption-clean";
      return base;
  }
}

export function getCreatorStudioFontClassName(
  design: CreatorStudioDesign,
  layerStyle: CreatorStudioLayerStyle,
  layer: CreatorStudioTextLayer
) {
  const preset =
    normalizeCreatorStudioFontPreset(layerStyle.fontPreset) ??
    getDefaultLayerFontPreset(design, layer);

  return presetClassMap[preset] ?? presetClassMap["modern-bold"];
}

export function getCreatorStudioFontPresetClassName(
  preset: CreatorStudioFontPreset | string | undefined
) {
  const normalized =
    normalizeCreatorStudioFontPreset(preset) ?? ("modern-bold" as const);

  return presetClassMap[normalized] ?? presetClassMap["modern-bold"];
}

export function getCreatorStudioFontPresetLabel(
  preset: CreatorStudioFontPreset | string | undefined
) {
  const definition = getCreatorStudioFontPresetDefinition(preset);
  return definition?.label ?? "Modern Bold";
}
