import type {
  CreatorStudioDesign,
  CreatorStudioLayerStyle,
  CreatorStudioTextLayer,
} from "./creationCenter";
import {
  buildCreatorStudioFontPresetPreviewStyle,
  creatorStudioFontPresets,
  CREATOR_STUDIO_FONT_PRESET_CATEGORIES,
  CREATOR_STUDIO_FONT_PRESET_VALUES,
  getCreatorStudioFontPresetClassName,
  getCreatorStudioFontPresetDefinition,
  getCreatorStudioFontPresetLabel,
  getCreatorStudioPresetDecoration,
  groupCreatorStudioFontPresetsByCategory,
  normalizeCreatorStudioFontPreset,
  presetClassMap,
  type CreatorStudioFontPreset,
  type CreatorStudioFontPresetCategory,
  type CreatorStudioFontPresetDefinition,
  type CreatorStudioPresetDecoration,
} from "./creatorStudioFontPresetCatalog";

export {
  buildCreatorStudioFontPresetPreviewStyle,
  creatorStudioFontPresets,
  CREATOR_STUDIO_FONT_PRESET_CATEGORIES,
  CREATOR_STUDIO_FONT_PRESET_VALUES,
  getCreatorStudioFontPresetClassName,
  getCreatorStudioFontPresetDefinition,
  getCreatorStudioFontPresetLabel,
  getCreatorStudioPresetDecoration,
  groupCreatorStudioFontPresetsByCategory,
  normalizeCreatorStudioFontPreset,
  presetClassMap,
  type CreatorStudioFontPreset,
  type CreatorStudioFontPresetCategory,
  type CreatorStudioFontPresetDefinition,
  type CreatorStudioPresetDecoration,
};

export const CREATOR_STUDIO_FONT_SCALE_MIN = 0.55;
export const CREATOR_STUDIO_FONT_SCALE_MAX = 2.2;

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
    return "handwritten-faith";
  }
  if (
    hint.includes("worship") ||
    hint.includes("praise") ||
    hint.includes("celebration")
  ) {
    return "worship-praise";
  }
  if (
    hint.includes("cinematic") ||
    hint.includes("poster") ||
    hint.includes("documentary")
  ) {
    return "bold-all-caps";
  }
  if (
    hint.includes("editorial") ||
    hint.includes("magazine") ||
    hint.includes("timeline")
  ) {
    return "elegant-serif";
  }
  if (
    hint.includes("minimal") ||
    hint.includes("peaceful") ||
    hint.includes("devotional") ||
    hint.includes("reflect")
  ) {
    return "soft-encouragement";
  }
  if (
    hint.includes("serif") ||
    hint.includes("elegant") ||
    hint.includes("quote")
  ) {
    return "elegant-serif";
  }
  if (hint.includes("warm") || hint.includes("friendly") || hint.includes("social")) {
    return "modern-label";
  }
  if (hint.includes("caption")) {
    return "minimal-caption";
  }
  if (hint.includes("neon") || hint.includes("glow")) {
    return "breakthrough-glow";
  }
  if (hint.includes("typewriter")) {
    return "typewriter-reflection";
  }

  return "bold-testimony";
}

export function getDefaultLayerFontPreset(
  design: CreatorStudioDesign,
  layer: CreatorStudioTextLayer
): CreatorStudioFontPreset {
  const base = inferFontPresetFromDesign(design);

  switch (design.layoutType) {
    case "magazine-style":
      if (layer === "title") return "elegant-serif";
      if (layer === "overlay") return "minimal-caption";
      if (layer === "scripture") return "elegant-scripture";
      return base;
    case "full-image-poster":
      if (layer === "title") return "bold-all-caps";
      if (layer === "caption") return "clean-modern";
      return base;
    case "quote-card":
      if (layer === "title") return "elegant-serif";
      if (layer === "scripture") return "elegant-scripture";
      return "soft-encouragement";
    case "praise-report-card":
      if (layer === "title") return "soft-script";
      if (layer === "overlay") return "bold-testimony";
      return base;
    case "journal-style":
      if (layer === "title") return "handwritten-faith";
      if (layer === "overlay" || layer === "caption") return "soft-encouragement";
      return base;
    case "scripture-card":
      if (layer === "scripture" || layer === "title") return "prayer-card";
      return "soft-encouragement";
    case "split-layout":
      if (layer === "title") return "elegant-serif";
      return "bold-testimony";
    case "prayer-request-card":
      return "prayer-card";
    case "timeline-story":
      if (layer === "caption") return "minimal-caption";
      if (layer === "title") return "elegant-serif";
      return base;
    case "before-after-testimony":
      if (layer === "title") return "grunge-impact";
      return "bold-testimony";
    default:
      if (layer === "scripture") return "elegant-scripture";
      if (layer === "caption") return "minimal-caption";
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

  return presetClassMap[preset] ?? presetClassMap["clean-modern"];
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

export function getCreatorStudioPresetWeightClass(
  layerStyle: CreatorStudioLayerStyle
) {
  const preset = getCreatorStudioFontPresetDefinition(layerStyle.fontPreset);
  if (preset?.weightClass) {
    return preset.weightClass;
  }

  return layerStyle.weight === "regular" ? "font-normal" : "font-extrabold";
}
