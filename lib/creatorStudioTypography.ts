import type { CSSProperties } from "react";
import type {
  CreatorStudioDesign,
  CreatorStudioLayerStyle,
  CreatorStudioTextLayer,
} from "./creationCenter";

export type CreatorStudioFontPreset =
  | "modern-bold"
  | "elegant-serif"
  | "handwritten-journal"
  | "worship-script"
  | "typewriter-testimony"
  | "minimal-uppercase"
  | "cinematic-poster"
  | "magazine-editorial"
  | "neon-glow"
  | "vintage-church"
  | "chalkboard"
  | "brush-stroke"
  | "luxury-gold"
  | "clean-modern-sans"
  | "faith-journal"
  | "newspaper"
  | "storybook"
  | "hero-title"
  | "social-creator"
  | "scripture-card";

export type CreatorStudioFontPresetCategory =
  | "Modern"
  | "Serif"
  | "Script"
  | "Display"
  | "Warm"
  | "Utility";

export const CREATOR_STUDIO_FONT_PRESET_VALUES: CreatorStudioFontPreset[] = [
  "modern-bold",
  "elegant-serif",
  "handwritten-journal",
  "worship-script",
  "typewriter-testimony",
  "minimal-uppercase",
  "cinematic-poster",
  "magazine-editorial",
  "neon-glow",
  "vintage-church",
  "chalkboard",
  "brush-stroke",
  "luxury-gold",
  "clean-modern-sans",
  "faith-journal",
  "newspaper",
  "storybook",
  "hero-title",
  "social-creator",
  "scripture-card",
];

export const CREATOR_STUDIO_FONT_PRESET_CATEGORIES: CreatorStudioFontPresetCategory[] =
  ["Modern", "Serif", "Script", "Display", "Warm", "Utility"];

const LEGACY_FONT_PRESET_MAP: Record<string, CreatorStudioFontPreset> = {
  "aptos-clean": "clean-modern-sans",
  "classic-serif": "elegant-serif",
  "script-elegant": "worship-script",
  handwritten: "handwritten-journal",
  "worship-serif": "worship-script",
  "scripture-classic": "scripture-card",
  cinematic: "cinematic-poster",
  minimal: "minimal-uppercase",
  editorial: "magazine-editorial",
  "soft-rounded": "social-creator",
  "strong-impact": "hero-title",
  peaceful: "faith-journal",
  joyful: "storybook",
  "caption-clean": "clean-modern-sans",
  reflective: "faith-journal",
  worshipful: "worship-script",
  "handwritten-accent": "handwritten-journal",
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
  textTransform?: NonNullable<CreatorStudioLayerStyle["textTransform"]>;
  defaultColor?: string;
  glowColor?: string;
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
    textTransform: "uppercase",
  },
  {
    value: "elegant-serif",
    label: "Elegant Serif",
    category: "Serif",
    previewSample: "Grace",
    fontFamily: "Libre Baskerville",
    className:
      "font-[family-name:var(--font-creator-elegant-serif)] tracking-[0.02em] normal-case",
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
    value: "handwritten-journal",
    label: "Handwritten Journal",
    category: "Script",
    previewSample: "My Story",
    fontFamily: "Caveat",
    className:
      "font-[family-name:var(--font-creator-handwritten-journal)] tracking-normal normal-case",
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
    value: "worship-script",
    label: "Worship Script",
    category: "Script",
    previewSample: "Blessed",
    fontFamily: "Great Vibes",
    className:
      "font-[family-name:var(--font-creator-worship-script)] tracking-normal normal-case",
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
    value: "typewriter-testimony",
    label: "Typewriter Testimony",
    category: "Utility",
    previewSample: "I remember...",
    fontFamily: "Courier Prime",
    className:
      "font-[family-name:var(--font-creator-typewriter-testimony)] tracking-normal normal-case",
    weight: "regular",
    italic: false,
    fontSize: "medium",
    fontScale: 0.96,
    letterSpacing: 0.01,
    lineHeight: 1.35,
    shadowStrength: 0.08,
    outlineWidth: 0,
  },
  {
    value: "minimal-uppercase",
    label: "Minimal Uppercase",
    category: "Modern",
    previewSample: "still",
    fontFamily: "Helvetica Neue",
    className:
      "font-[family-name:var(--font-creator-minimal-uppercase)] tracking-[0.14em] uppercase",
    weight: "regular",
    italic: false,
    fontSize: "medium",
    fontScale: 0.9,
    letterSpacing: 0.14,
    lineHeight: 1.45,
    shadowStrength: 0,
    outlineWidth: 0,
    textTransform: "uppercase",
  },
  {
    value: "cinematic-poster",
    label: "Cinematic Poster",
    category: "Display",
    previewSample: "BREAKTHROUGH",
    fontFamily: "Bebas Neue",
    className:
      "font-[family-name:var(--font-creator-cinematic-poster)] uppercase tracking-[0.22em]",
    weight: "bold",
    italic: false,
    fontSize: "hero",
    fontScale: 1.2,
    letterSpacing: 0.22,
    lineHeight: 0.9,
    shadowStrength: 0.78,
    outlineWidth: 0,
    textTransform: "uppercase",
  },
  {
    value: "magazine-editorial",
    label: "Magazine Editorial",
    category: "Display",
    previewSample: "Revival",
    fontFamily: "Playfair Display",
    className:
      "font-[family-name:var(--font-creator-magazine-editorial)] tracking-[-0.04em] normal-case",
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
    value: "neon-glow",
    label: "Neon Glow",
    category: "Display",
    previewSample: "HOPE",
    fontFamily: "Montserrat",
    className:
      "font-[family-name:var(--font-creator-neon-glow)] uppercase tracking-[0.08em]",
    weight: "bold",
    italic: false,
    fontSize: "large",
    fontScale: 1.08,
    letterSpacing: 0.08,
    lineHeight: 1.05,
    shadowStrength: 0.95,
    outlineWidth: 0,
    textTransform: "uppercase",
    defaultColor: "#7DF9FF",
    glowColor: "#00E5FF",
  },
  {
    value: "vintage-church",
    label: "Vintage Church",
    category: "Serif",
    previewSample: "Sanctuary",
    fontFamily: "Cinzel",
    className:
      "font-[family-name:var(--font-creator-vintage-church)] tracking-[0.12em] uppercase",
    weight: "bold",
    italic: false,
    fontSize: "large",
    fontScale: 1.02,
    letterSpacing: 0.12,
    lineHeight: 1.08,
    shadowStrength: 0.38,
    outlineWidth: 0,
    textTransform: "uppercase",
  },
  {
    value: "chalkboard",
    label: "Chalkboard",
    category: "Warm",
    previewSample: "Lesson",
    fontFamily: "Patrick Hand",
    className:
      "font-[family-name:var(--font-creator-chalkboard)] tracking-normal normal-case",
    weight: "regular",
    italic: false,
    fontSize: "large",
    fontScale: 1.06,
    letterSpacing: 0.01,
    lineHeight: 1.2,
    shadowStrength: 0.12,
    outlineWidth: 0,
    defaultColor: "#F8FAFC",
  },
  {
    value: "brush-stroke",
    label: "Brush Stroke",
    category: "Script",
    previewSample: "Alive!",
    fontFamily: "Permanent Marker",
    className:
      "font-[family-name:var(--font-creator-brush-stroke)] tracking-normal normal-case",
    weight: "bold",
    italic: false,
    fontSize: "large",
    fontScale: 1.1,
    letterSpacing: 0,
    lineHeight: 1.05,
    shadowStrength: 0.42,
    outlineWidth: 0.35,
  },
  {
    value: "luxury-gold",
    label: "Luxury Gold",
    category: "Serif",
    previewSample: "Glory",
    fontFamily: "Cormorant Garamond",
    className:
      "font-[family-name:var(--font-creator-luxury-gold)] tracking-[0.08em] uppercase",
    weight: "bold",
    italic: false,
    fontSize: "hero",
    fontScale: 1.12,
    letterSpacing: 0.08,
    lineHeight: 1.02,
    shadowStrength: 0.5,
    outlineWidth: 0,
    textTransform: "uppercase",
    defaultColor: "#D4AF37",
  },
  {
    value: "clean-modern-sans",
    label: "Clean Modern Sans",
    category: "Modern",
    previewSample: "Clear",
    fontFamily: "Source Sans 3",
    className:
      "font-[family-name:var(--font-creator-clean-modern-sans)] tracking-[0.01em] normal-case",
    weight: "regular",
    italic: false,
    fontSize: "medium",
    fontScale: 0.94,
    letterSpacing: 0.01,
    lineHeight: 1.32,
    shadowStrength: 0,
    outlineWidth: 0,
  },
  {
    value: "faith-journal",
    label: "Faith Journal",
    category: "Serif",
    previewSample: "Rest",
    fontFamily: "Lora",
    className:
      "font-[family-name:var(--font-creator-faith-journal)] tracking-[0.03em] normal-case italic",
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
    value: "newspaper",
    label: "Newspaper",
    category: "Utility",
    previewSample: "Headline",
    fontFamily: "Roboto Slab",
    className:
      "font-[family-name:var(--font-creator-newspaper)] tracking-[-0.02em] normal-case",
    weight: "bold",
    italic: false,
    fontSize: "medium",
    fontScale: 1.04,
    letterSpacing: -0.02,
    lineHeight: 1.18,
    shadowStrength: 0.16,
    outlineWidth: 0,
  },
  {
    value: "storybook",
    label: "Storybook",
    category: "Warm",
    previewSample: "Celebrate!",
    fontFamily: "Fredoka",
    className:
      "font-[family-name:var(--font-creator-storybook)] tracking-[0.02em] normal-case",
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
    value: "hero-title",
    label: "Hero Title",
    category: "Display",
    previewSample: "VICTORY",
    fontFamily: "Oswald",
    className:
      "font-[family-name:var(--font-creator-hero-title)] uppercase tracking-[0.1em]",
    weight: "bold",
    italic: false,
    fontSize: "hero",
    fontScale: 1.24,
    letterSpacing: 0.1,
    lineHeight: 0.88,
    shadowStrength: 0.62,
    outlineWidth: 0.65,
    textTransform: "uppercase",
  },
  {
    value: "social-creator",
    label: "Social Creator",
    category: "Modern",
    previewSample: "Share",
    fontFamily: "Quicksand",
    className:
      "font-[family-name:var(--font-creator-social-creator)] tracking-[0.03em] normal-case",
    weight: "bold",
    italic: false,
    fontSize: "large",
    fontScale: 1.1,
    letterSpacing: 0.03,
    lineHeight: 1.2,
    shadowStrength: 0.22,
    outlineWidth: 0,
    defaultColor: "#FDE68A",
  },
  {
    value: "scripture-card",
    label: "Scripture Card",
    category: "Utility",
    previewSample: "Psalm 23",
    fontFamily: "EB Garamond",
    className:
      "font-[family-name:var(--font-creator-scripture-card)] tracking-[0.06em] normal-case italic",
    weight: "regular",
    italic: true,
    fontSize: "medium",
    fontScale: 1.04,
    letterSpacing: 0.06,
    lineHeight: 1.5,
    shadowStrength: 0.24,
    outlineWidth: 0,
    defaultColor: "#F8FAFC",
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

function buildPresetTextShadow(preset: CreatorStudioFontPresetDefinition) {
  if (preset.glowColor) {
    return `0 0 12px ${preset.glowColor}, 0 0 28px ${preset.glowColor}88, 0 2px 8px rgba(0,0,0,0.45)`;
  }

  if (preset.shadowStrength > 0) {
    return `0 2px ${Math.round(preset.shadowStrength * 18)}px rgba(0,0,0,${Math.min(0.85, preset.shadowStrength)})`;
  }

  return undefined;
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
      textTransform: preset.textTransform,
      color: preset.defaultColor,
      textShadow: buildPresetTextShadow(preset),
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
    return "handwritten-journal";
  }
  if (
    hint.includes("worship") ||
    hint.includes("praise") ||
    hint.includes("celebration")
  ) {
    return "worship-script";
  }
  if (
    hint.includes("cinematic") ||
    hint.includes("poster") ||
    hint.includes("documentary")
  ) {
    return "cinematic-poster";
  }
  if (
    hint.includes("editorial") ||
    hint.includes("magazine") ||
    hint.includes("timeline")
  ) {
    return "magazine-editorial";
  }
  if (
    hint.includes("minimal") ||
    hint.includes("peaceful") ||
    hint.includes("devotional") ||
    hint.includes("reflect")
  ) {
    return "faith-journal";
  }
  if (
    hint.includes("serif") ||
    hint.includes("elegant") ||
    hint.includes("quote")
  ) {
    return "elegant-serif";
  }
  if (hint.includes("warm") || hint.includes("friendly") || hint.includes("social")) {
    return "social-creator";
  }
  if (hint.includes("caption")) {
    return "clean-modern-sans";
  }
  if (hint.includes("neon")) {
    return "neon-glow";
  }
  if (hint.includes("typewriter")) {
    return "typewriter-testimony";
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
      if (layer === "title") return "magazine-editorial";
      if (layer === "overlay") return "minimal-uppercase";
      if (layer === "scripture") return "scripture-card";
      return base;
    case "full-image-poster":
      if (layer === "title") return "cinematic-poster";
      if (layer === "caption") return "clean-modern-sans";
      return base;
    case "quote-card":
      if (layer === "title") return "elegant-serif";
      if (layer === "scripture") return "scripture-card";
      return "faith-journal";
    case "praise-report-card":
      if (layer === "title") return "worship-script";
      if (layer === "overlay") return "modern-bold";
      return base;
    case "journal-style":
      if (layer === "title") return "handwritten-journal";
      if (layer === "overlay" || layer === "caption") return "faith-journal";
      return base;
    case "scripture-card":
      if (layer === "scripture" || layer === "title") return "scripture-card";
      return "faith-journal";
    case "split-layout":
      if (layer === "title") return "magazine-editorial";
      return "modern-bold";
    case "prayer-request-card":
      return "faith-journal";
    case "timeline-story":
      if (layer === "caption") return "clean-modern-sans";
      if (layer === "title") return "magazine-editorial";
      return base;
    case "before-after-testimony":
      if (layer === "title") return "hero-title";
      return "modern-bold";
    default:
      if (layer === "scripture") return "scripture-card";
      if (layer === "caption") return "clean-modern-sans";
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

export function applyCreatorStudioFontPresetStyles(
  preset: CreatorStudioFontPresetDefinition,
  layerStyle: CreatorStudioLayerStyle
): Partial<CreatorStudioLayerStyle> {
  return {
    fontPreset: preset.value,
    fontSize: preset.fontSize,
    fontScale: preset.fontScale,
    weight: preset.weight,
    italic: preset.italic,
    letterSpacing: preset.letterSpacing,
    lineHeight: preset.lineHeight,
    shadowStrength: preset.shadowStrength,
    outlineWidth: preset.outlineWidth,
    textTransform: preset.textTransform,
    color: layerStyle.color ?? preset.defaultColor,
  };
}
