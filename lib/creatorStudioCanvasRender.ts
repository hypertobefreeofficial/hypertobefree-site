import type { CSSProperties } from "react";
import { resolveCreatorStudioLayerMaxWidthStyle } from "./creatorStudioLayerLayout";
import {
  getCreatorStudioLayerCoordinates,
  getCreatorStudioLayerStyle,
  getCreatorStudioLayerTransform,
  type CreatorStudioDesign,
  type CreatorStudioLayerStyle,
  type CreatorStudioTextLayer,
} from "./creationCenter";
import type { CreatorStudioPresetDecoration } from "./creatorStudioFontPresetCatalog";
import { buildPresetTextShadow } from "./creatorStudioFontPresetCatalog";
import {
  clampCreatorStudioFontScale,
  getCreatorStudioFontClassName,
  getCreatorStudioFontPresetDefinition,
  getCreatorStudioPresetDecoration,
  getCreatorStudioPresetWeightClass,
  normalizeCreatorStudioFontPreset,
} from "./creatorStudioTypography";

function isHexColor(value: string | undefined): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function getPaletteColor(
  palette: string[] | undefined,
  index: number,
  fallback: string
) {
  const value = palette?.[index];
  return isHexColor(value) ? value.trim() : fallback;
}

function getBaseFontSizeRem(
  size: CreatorStudioLayerStyle["fontSize"] | undefined,
  compact: boolean
) {
  if (size === "small") return compact ? 1.125 : 1.5;
  if (size === "medium") return compact ? 1.5 : 1.875;
  if (size === "large") return compact ? 2 : 2.75;
  if (size === "hero") return compact ? 2.5 : 3.5;

  return compact ? 1.5 : 2.75;
}

export type CreatorStudioLayerTypography = {
  layerStyle: CreatorStudioLayerStyle;
  fontClassName: string;
  weightClass: string;
  italicClass: string;
  alignClass: string;
  coordinates: { x: number; y: number };
  transform: string;
  inlineStyle: CSSProperties;
  presetDecoration?: CreatorStudioPresetDecoration;
};

export function buildCreatorStudioLayerTypography(
  design: CreatorStudioDesign,
  layer: CreatorStudioTextLayer,
  compact = false,
  options?: { reserveMobileBottom?: boolean }
): CreatorStudioLayerTypography {
  const layerStyle = getCreatorStudioLayerStyle(design, layer);
  return buildCreatorStudioLayerTypographyFromStyle(
    design,
    layerStyle,
    layer,
    compact,
    options
  );
}

export function buildCreatorStudioLayerTypographyFromStyle(
  design: CreatorStudioDesign,
  layerStyle: CreatorStudioLayerStyle,
  layer: CreatorStudioTextLayer,
  compact = false,
  options?: { reserveMobileBottom?: boolean }
): CreatorStudioLayerTypography {
  const fontScale = clampCreatorStudioFontScale(layerStyle.fontScale);
  const fontClassName = getCreatorStudioFontClassName(design, layerStyle, layer);
  const baseFontRem = getBaseFontSizeRem(layerStyle.fontSize, compact);
  const weightClass = getCreatorStudioPresetWeightClass(layerStyle);
  const italicClass = layerStyle.italic ? "italic" : "";
  const alignClass =
    layerStyle.align === "center"
      ? "text-center"
      : layerStyle.align === "right"
        ? "text-right"
        : "text-left";
  const coordinates = getCreatorStudioLayerCoordinates(layerStyle, options);
  const opacity = layerStyle.opacity ?? 1;
  const shadowStrength = layerStyle.shadowStrength ?? 0.35;
  const outlineWidth = layerStyle.outlineWidth ?? 0;
  const presetDefinition = normalizeCreatorStudioFontPreset(layerStyle.fontPreset)
    ? getCreatorStudioFontPresetDefinition(layerStyle.fontPreset)
    : null;
  const effectiveShadowStrength =
    presetDefinition?.shadowStrength ?? shadowStrength;
  const textShadow = presetDefinition?.glowColor
    ? buildPresetTextShadow(presetDefinition)
    : effectiveShadowStrength > 0
      ? `0 2px ${Math.round(effectiveShadowStrength * 20)}px rgba(0,0,0,${Math.min(0.85, effectiveShadowStrength)})`
      : undefined;
  const resolvedMaxWidth = resolveCreatorStudioLayerMaxWidthStyle(layerStyle, {
    reserveMobileBottom: options?.reserveMobileBottom,
    constrainToSafeArea: true,
  });
  const effectiveOutlineWidth = presetDefinition?.outlineWidth ?? outlineWidth;
  const inlineStyle: CSSProperties = {
    color:
      layerStyle.color ||
      presetDefinition?.defaultColor ||
      getPaletteColor(design.colorPalette, 1, "#FFFFFF"),
    textAlign: layerStyle.align,
    opacity,
    fontSize: `${(baseFontRem * fontScale).toFixed(3)}rem`,
    letterSpacing:
      layerStyle.letterSpacing !== undefined
        ? `${layerStyle.letterSpacing}em`
        : presetDefinition
          ? `${presetDefinition.letterSpacing}em`
          : undefined,
    lineHeight: layerStyle.lineHeight ?? presetDefinition?.lineHeight ?? 1.15,
    textTransform: layerStyle.textTransform ?? presetDefinition?.textTransform,
    textShadow,
    WebkitTextStroke:
      effectiveOutlineWidth > 0
        ? `${effectiveOutlineWidth}px rgba(0,0,0,${Math.min(0.75, 0.25 + effectiveOutlineWidth * 0.15)})`
        : undefined,
    ...(resolvedMaxWidth ? { maxWidth: resolvedMaxWidth } : {}),
  };

  return {
    layerStyle,
    fontClassName,
    weightClass,
    italicClass,
    alignClass,
    coordinates,
    transform: getCreatorStudioLayerTransform(
      layerStyle.align,
      coordinates.x,
      layerStyle.rotation ?? 0
    ),
    inlineStyle,
    presetDecoration: getCreatorStudioPresetDecoration(presetDefinition),
  };
}

export function buildCreatorStudioCustomLayerTypography(
  design: CreatorStudioDesign,
  layerStyle: CreatorStudioLayerStyle,
  compact = false,
  options?: { reserveMobileBottom?: boolean }
): CreatorStudioLayerTypography {
  return buildCreatorStudioLayerTypographyFromStyle(
    design,
    layerStyle,
    "overlay",
    compact,
    options
  );
}

export function getCreatorStudioAccentColor(design: CreatorStudioDesign) {
  return getPaletteColor(design.colorPalette, 2, "#D4AF37");
}
