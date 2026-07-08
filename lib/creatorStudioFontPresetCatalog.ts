import type { CSSProperties } from "react";
import type { CreatorStudioLayerStyle } from "./creationCenter";

export type CreatorStudioFontPreset =
  | "clean-modern"
  | "bold-testimony"
  | "elegant-scripture"
  | "soft-encouragement"
  | "worship-praise"
  | "minimal-caption"
  | "prayer-card"
  | "breakthrough-glow"
  | "handwritten-faith"
  | "typewriter-reflection"
  | "bold-all-caps"
  | "elegant-serif"
  | "modern-label"
  | "soft-script"
  | "grunge-impact";

export type CreatorStudioFontPresetCategory =
  | "Modern"
  | "Testimony"
  | "Scripture"
  | "Worship"
  | "Warm"
  | "Classic";

export type CreatorStudioPresetAccentLine = {
  color: string;
  height: number;
  widthPercent?: number;
  marginTop?: number;
};

export type CreatorStudioPresetDecoration = {
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
  accentLine?: CreatorStudioPresetAccentLine;
  previewBackground?: string;
};

export type CreatorStudioFontPresetDefinition = {
  value: CreatorStudioFontPreset;
  label: string;
  category: CreatorStudioFontPresetCategory;
  previewSample: string;
  fontFamily: string;
  className: string;
  weightClass: string;
  weight: "regular" | "bold";
  italic: boolean;
  fontSize: NonNullable<CreatorStudioLayerStyle["fontSize"]>;
  fontScale: number;
  letterSpacing: number;
  lineHeight: number;
  shadowStrength: number;
  outlineWidth: number;
  textTransform?: NonNullable<CreatorStudioLayerStyle["textTransform"]>;
  defaultColor?: string;
  glowColor?: string;
  decoration?: CreatorStudioPresetDecoration;
};

export const CREATOR_STUDIO_FONT_PRESET_VALUES: CreatorStudioFontPreset[] = [
  "clean-modern",
  "bold-testimony",
  "elegant-scripture",
  "soft-encouragement",
  "worship-praise",
  "minimal-caption",
  "prayer-card",
  "breakthrough-glow",
  "handwritten-faith",
  "typewriter-reflection",
  "bold-all-caps",
  "elegant-serif",
  "modern-label",
  "soft-script",
  "grunge-impact",
];

export const CREATOR_STUDIO_FONT_PRESET_CATEGORIES: CreatorStudioFontPresetCategory[] =
  ["Modern", "Testimony", "Scripture", "Worship", "Warm", "Classic"];

const PRESET_DARK_BG =
  "linear-gradient(145deg, #041428 0%, #062a57 48%, #0b63ce 100%)";
const PRESET_LIGHT_BG =
  "linear-gradient(160deg, #fff8f0 0%, #f8fbff 55%, #eff6ff 100%)";
const PRESET_PINK_BG =
  "linear-gradient(160deg, #fff1f2 0%, #fce7f3 55%, #fdf2f8 100%)";
const PRESET_WARM_BG =
  "linear-gradient(160deg, #fffbeb 0%, #fef3c7 45%, #fde68a 100%)";

export const LEGACY_FONT_PRESET_MAP: Record<string, CreatorStudioFontPreset> = {
  "aptos-clean": "clean-modern",
  "classic-serif": "elegant-serif",
  "script-elegant": "soft-script",
  handwritten: "handwritten-faith",
  "worship-serif": "worship-praise",
  "scripture-classic": "elegant-scripture",
  cinematic: "bold-all-caps",
  minimal: "minimal-caption",
  editorial: "elegant-serif",
  "soft-rounded": "modern-label",
  "strong-impact": "grunge-impact",
  peaceful: "soft-encouragement",
  joyful: "worship-praise",
  "caption-clean": "minimal-caption",
  reflective: "typewriter-reflection",
  worshipful: "worship-praise",
  "handwritten-accent": "handwritten-faith",
  "modern-bold": "bold-testimony",
  "elegant-serif-old": "elegant-serif",
  "handwritten-journal": "handwritten-faith",
  "worship-script": "soft-script",
  "typewriter-testimony": "typewriter-reflection",
  "minimal-uppercase": "minimal-caption",
  "cinematic-poster": "bold-all-caps",
  "magazine-editorial": "elegant-serif",
  "neon-glow": "breakthrough-glow",
  "vintage-church": "grunge-impact",
  chalkboard: "soft-encouragement",
  "brush-stroke": "bold-testimony",
  "luxury-gold": "grunge-impact",
  "clean-modern-sans": "clean-modern",
  "faith-journal": "soft-encouragement",
  newspaper: "typewriter-reflection",
  storybook: "soft-encouragement",
  "hero-title": "bold-all-caps",
  "social-creator": "modern-label",
  "scripture-card": "elegant-scripture",
};

export const creatorStudioFontPresets: CreatorStudioFontPresetDefinition[] = [
  {
    value: "clean-modern",
    label: "Clean Modern",
    category: "Modern",
    previewSample: "God is faithful",
    fontFamily: "Inter",
    className:
      "font-[family-name:var(--font-creator-clean-modern)] tracking-[-0.01em] normal-case",
    weightClass: "font-semibold",
    weight: "regular",
    italic: false,
    fontSize: "large",
    fontScale: 1.02,
    letterSpacing: -0.01,
    lineHeight: 1.22,
    shadowStrength: 0.42,
    outlineWidth: 0,
    defaultColor: "#FFFFFF",
    decoration: {
      previewBackground: PRESET_DARK_BG,
      accentLine: { color: "#0b63ce", height: 3, widthPercent: 34, marginTop: 8 },
    },
  },
  {
    value: "bold-testimony",
    label: "Bold Testimony",
    category: "Testimony",
    previewSample: "FREEDOM",
    fontFamily: "Manrope",
    className:
      "font-[family-name:var(--font-creator-bold-testimony)] uppercase tracking-[-0.03em]",
    weightClass: "font-extrabold",
    weight: "bold",
    italic: false,
    fontSize: "hero",
    fontScale: 1.16,
    letterSpacing: -0.03,
    lineHeight: 0.94,
    shadowStrength: 0.72,
    outlineWidth: 0,
    textTransform: "uppercase",
    defaultColor: "#FFFFFF",
    decoration: { previewBackground: PRESET_DARK_BG },
  },
  {
    value: "elegant-scripture",
    label: "Elegant Scripture",
    category: "Scripture",
    previewSample: "The Lord is near",
    fontFamily: "EB Garamond",
    className:
      "font-[family-name:var(--font-creator-elegant-scripture)] tracking-[0.02em] normal-case",
    weightClass: "font-medium",
    weight: "regular",
    italic: true,
    fontSize: "medium",
    fontScale: 1.08,
    letterSpacing: 0.02,
    lineHeight: 1.46,
    shadowStrength: 0.18,
    outlineWidth: 0,
    defaultColor: "#1E293B",
    decoration: { previewBackground: PRESET_LIGHT_BG },
  },
  {
    value: "soft-encouragement",
    label: "Soft Encouragement",
    category: "Warm",
    previewSample: "You are loved",
    fontFamily: "Manrope",
    className:
      "font-[family-name:var(--font-creator-soft-encouragement)] tracking-[0.01em] normal-case",
    weightClass: "font-semibold",
    weight: "regular",
    italic: false,
    fontSize: "large",
    fontScale: 1.06,
    letterSpacing: 0.01,
    lineHeight: 1.28,
    shadowStrength: 0.12,
    outlineWidth: 0,
    defaultColor: "#9D174D",
    decoration: { previewBackground: PRESET_PINK_BG },
  },
  {
    value: "worship-praise",
    label: "Worship / Praise",
    category: "Worship",
    previewSample: "HALLELUJAH",
    fontFamily: "Funnel Display",
    className:
      "font-[family-name:var(--font-creator-worship-praise)] uppercase tracking-[0.04em]",
    weightClass: "font-extrabold",
    weight: "bold",
    italic: false,
    fontSize: "hero",
    fontScale: 1.18,
    letterSpacing: 0.04,
    lineHeight: 0.92,
    shadowStrength: 0.58,
    outlineWidth: 0,
    textTransform: "uppercase",
    defaultColor: "#FFFFFF",
    decoration: { previewBackground: PRESET_DARK_BG },
  },
  {
    value: "minimal-caption",
    label: "Minimal Caption",
    category: "Modern",
    previewSample: "STILL",
    fontFamily: "Inter",
    className:
      "font-[family-name:var(--font-creator-minimal-caption)] uppercase tracking-[0.2em]",
    weightClass: "font-medium",
    weight: "regular",
    italic: false,
    fontSize: "small",
    fontScale: 0.92,
    letterSpacing: 0.2,
    lineHeight: 1.5,
    shadowStrength: 0.08,
    outlineWidth: 0,
    textTransform: "uppercase",
    defaultColor: "#FFFFFF",
    decoration: { previewBackground: PRESET_DARK_BG },
  },
  {
    value: "prayer-card",
    label: "Prayer Card",
    category: "Scripture",
    previewSample: "Be still and know",
    fontFamily: "EB Garamond",
    className:
      "font-[family-name:var(--font-creator-prayer-card)] tracking-[0.03em] normal-case",
    weightClass: "font-normal",
    weight: "regular",
    italic: false,
    fontSize: "medium",
    fontScale: 1.02,
    letterSpacing: 0.03,
    lineHeight: 1.42,
    shadowStrength: 0,
    outlineWidth: 0,
    defaultColor: "#334155",
    decoration: {
      previewBackground: PRESET_LIGHT_BG,
      wrapperStyle: {
        backgroundColor: "rgba(255, 248, 240, 0.94)",
        padding: "0.75rem 1rem",
        borderRadius: "1rem",
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.14)",
        border: "1px solid rgba(255, 255, 255, 0.65)",
      },
      accentLine: { color: "#D4AF37", height: 2, widthPercent: 36, marginTop: 10 },
    },
  },
  {
    value: "breakthrough-glow",
    label: "Breakthrough Glow",
    category: "Testimony",
    previewSample: "BREAKTHROUGH",
    fontFamily: "Manrope",
    className:
      "font-[family-name:var(--font-creator-breakthrough-glow)] uppercase tracking-[0.06em]",
    weightClass: "font-extrabold",
    weight: "bold",
    italic: false,
    fontSize: "hero",
    fontScale: 1.12,
    letterSpacing: 0.06,
    lineHeight: 1,
    shadowStrength: 0.95,
    outlineWidth: 0,
    textTransform: "uppercase",
    defaultColor: "#FFFFFF",
    glowColor: "#FFFFFF",
    decoration: { previewBackground: PRESET_DARK_BG },
  },
  {
    value: "handwritten-faith",
    label: "Handwritten Faith",
    category: "Warm",
    previewSample: "My story",
    fontFamily: "Caveat Brush",
    className:
      "font-[family-name:var(--font-creator-handwritten-faith)] tracking-normal normal-case",
    weightClass: "font-bold",
    weight: "regular",
    italic: false,
    fontSize: "large",
    fontScale: 1.22,
    letterSpacing: 0.004,
    lineHeight: 1.05,
    shadowStrength: 0.16,
    outlineWidth: 0,
    defaultColor: "#0F172A",
    decoration: { previewBackground: PRESET_LIGHT_BG },
  },
  {
    value: "typewriter-reflection",
    label: "Typewriter Reflection",
    category: "Classic",
    previewSample: "I remember...",
    fontFamily: "Special Elite",
    className:
      "font-[family-name:var(--font-creator-typewriter-reflection)] tracking-[0.02em] normal-case",
    weightClass: "font-normal",
    weight: "regular",
    italic: false,
    fontSize: "medium",
    fontScale: 0.98,
    letterSpacing: 0.02,
    lineHeight: 1.38,
    shadowStrength: 0.06,
    outlineWidth: 0,
    defaultColor: "#334155",
    decoration: { previewBackground: PRESET_LIGHT_BG },
  },
  {
    value: "bold-all-caps",
    label: "Bold All Caps",
    category: "Testimony",
    previewSample: "VICTORY",
    fontFamily: "Bebas Neue",
    className:
      "font-[family-name:var(--font-creator-bold-all-caps)] uppercase tracking-[0.14em]",
    weightClass: "font-bold",
    weight: "bold",
    italic: false,
    fontSize: "hero",
    fontScale: 1.2,
    letterSpacing: 0.14,
    lineHeight: 0.88,
    shadowStrength: 0.68,
    outlineWidth: 0,
    textTransform: "uppercase",
    defaultColor: "#FFFFFF",
    decoration: {
      previewBackground: PRESET_DARK_BG,
      accentLine: { color: "#D4AF37", height: 2, widthPercent: 44, marginTop: 8 },
    },
  },
  {
    value: "elegant-serif",
    label: "Elegant Serif",
    category: "Classic",
    previewSample: "Grace",
    fontFamily: "Playfair Display",
    className:
      "font-[family-name:var(--font-creator-elegant-serif)] tracking-[-0.02em] normal-case",
    weightClass: "font-bold",
    weight: "bold",
    italic: false,
    fontSize: "large",
    fontScale: 1.1,
    letterSpacing: -0.02,
    lineHeight: 1.12,
    shadowStrength: 0.38,
    outlineWidth: 0,
    defaultColor: "#FFFFFF",
    decoration: { previewBackground: PRESET_DARK_BG },
  },
  {
    value: "modern-label",
    label: "Modern Label",
    category: "Modern",
    previewSample: "GOD IS FAITHFUL",
    fontFamily: "Manrope",
    className:
      "font-[family-name:var(--font-creator-modern-label)] uppercase tracking-[0.12em]",
    weightClass: "font-semibold",
    weight: "regular",
    italic: false,
    fontSize: "medium",
    fontScale: 0.96,
    letterSpacing: 0.12,
    lineHeight: 1.2,
    shadowStrength: 0,
    outlineWidth: 0,
    textTransform: "uppercase",
    defaultColor: "#062A57",
    decoration: {
      previewBackground: PRESET_WARM_BG,
      wrapperStyle: {
        backgroundColor: "rgba(255, 255, 255, 0.96)",
        padding: "0.55rem 0.9rem",
        borderRadius: "0.65rem",
        boxShadow: "0 6px 18px rgba(15, 23, 42, 0.12)",
        border: "1px solid rgba(11, 99, 206, 0.12)",
        display: "inline-block",
      },
    },
  },
  {
    value: "soft-script",
    label: "Soft Script",
    category: "Worship",
    previewSample: "Blessed",
    fontFamily: "Great Vibes",
    className:
      "font-[family-name:var(--font-creator-soft-script)] tracking-[0.01em] normal-case",
    weightClass: "font-normal",
    weight: "regular",
    italic: false,
    fontSize: "hero",
    fontScale: 1.24,
    letterSpacing: 0.01,
    lineHeight: 1,
    shadowStrength: 0.28,
    outlineWidth: 0,
    defaultColor: "#7C2D12",
    decoration: { previewBackground: PRESET_PINK_BG },
  },
  {
    value: "grunge-impact",
    label: "Grunge Impact",
    category: "Testimony",
    previewSample: "NOT MY PAST",
    fontFamily: "Oswald",
    className:
      "font-[family-name:var(--font-creator-grunge-impact)] uppercase tracking-[0.08em]",
    weightClass: "font-extrabold",
    weight: "bold",
    italic: false,
    fontSize: "hero",
    fontScale: 1.14,
    letterSpacing: 0.08,
    lineHeight: 0.9,
    shadowStrength: 0.78,
    outlineWidth: 0.45,
    textTransform: "uppercase",
    defaultColor: "#FFFFFF",
    decoration: {
      previewBackground: PRESET_DARK_BG,
      accentLine: { color: "#D4AF37", height: 4, widthPercent: 58, marginTop: 10 },
    },
  },
];

const presetDefinitionMap = Object.fromEntries(
  creatorStudioFontPresets.map((preset) => [preset.value, preset])
) as Record<CreatorStudioFontPreset, CreatorStudioFontPresetDefinition>;

const presetClassMap = Object.fromEntries(
  creatorStudioFontPresets.map((preset) => [preset.value, preset.className])
) as Record<CreatorStudioFontPreset, string>;

export function buildPresetTextShadow(preset: CreatorStudioFontPresetDefinition) {
  if (preset.glowColor) {
    return `0 0 14px ${preset.glowColor}, 0 0 32px ${preset.glowColor}88, 0 2px 10px rgba(0,0,0,0.5)`;
  }

  if (preset.shadowStrength > 0) {
    return `0 2px ${Math.round(preset.shadowStrength * 20)}px rgba(0,0,0,${Math.min(0.85, preset.shadowStrength)})`;
  }

  return undefined;
}

export function getCreatorStudioPresetDecoration(
  preset: CreatorStudioFontPresetDefinition | null | undefined
): CreatorStudioPresetDecoration | undefined {
  return preset?.decoration;
}

export function buildCreatorStudioFontPresetPreviewStyle(
  preset: CreatorStudioFontPresetDefinition
): {
  className: string;
  style: CSSProperties;
  decoration?: CreatorStudioPresetDecoration;
} {
  return {
    className: `${preset.className} ${preset.weightClass} ${
      preset.italic ? "italic" : ""
    }`,
    style: {
      letterSpacing: `${preset.letterSpacing}em`,
      lineHeight: preset.lineHeight,
      textTransform: preset.textTransform,
      color: preset.defaultColor,
      textShadow: buildPresetTextShadow(preset),
      WebkitTextStroke:
        preset.outlineWidth > 0
          ? `${preset.outlineWidth}px rgba(0,0,0,${Math.min(0.75, 0.25 + preset.outlineWidth * 0.15)})`
          : undefined,
    },
    decoration: preset.decoration,
  };
}

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

export function getCreatorStudioFontPresetClassName(
  preset: CreatorStudioFontPreset | string | undefined
) {
  const normalized =
    normalizeCreatorStudioFontPreset(preset) ?? ("clean-modern" as const);

  return presetClassMap[normalized] ?? presetClassMap["clean-modern"];
}

export function getCreatorStudioFontPresetLabel(
  preset: CreatorStudioFontPreset | string | undefined
) {
  const definition = getCreatorStudioFontPresetDefinition(preset);
  return definition?.label ?? "Clean Modern";
}

export { presetClassMap, presetDefinitionMap };
