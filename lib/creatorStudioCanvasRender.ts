import type { CSSProperties } from "react";
import {
  getCreatorStudioLayerCoordinates,
  getCreatorStudioLayerStyle,
  getCreatorStudioLayerTransform,
  type CreatorStudioDesign,
  type CreatorStudioLayerStyle,
  type CreatorStudioTextLayer,
} from "./creationCenter";
import {
  clampCreatorStudioFontScale,
  getCreatorStudioFontClassName,
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
};

export function buildCreatorStudioLayerTypography(
  design: CreatorStudioDesign,
  layer: CreatorStudioTextLayer,
  compact = false,
  options?: { reserveMobileBottom?: boolean }
): CreatorStudioLayerTypography {
  const layerStyle = getCreatorStudioLayerStyle(design, layer);
  const fontScale = clampCreatorStudioFontScale(layerStyle.fontScale);
  const fontClassName = getCreatorStudioFontClassName(design, layerStyle, layer);
  const baseFontRem = getBaseFontSizeRem(layerStyle.fontSize, compact);
  const weightClass =
    layerStyle.weight === "regular" ? "font-semibold" : "font-black";
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
  const inlineStyle: CSSProperties = {
    color:
      layerStyle.color ||
      getPaletteColor(design.colorPalette, 1, "#FFFFFF"),
    textAlign: layerStyle.align,
    opacity,
    fontSize: `${(baseFontRem * fontScale).toFixed(3)}rem`,
    letterSpacing:
      layerStyle.letterSpacing !== undefined
        ? `${layerStyle.letterSpacing}em`
        : undefined,
    lineHeight: layerStyle.lineHeight ?? 1.15,
    textShadow:
      shadowStrength > 0
        ? `0 2px ${Math.round(shadowStrength * 18)}px rgba(0,0,0,${Math.min(0.85, shadowStrength)})`
        : undefined,
    WebkitTextStroke:
      outlineWidth > 0
        ? `${outlineWidth}px rgba(0,0,0,${Math.min(0.75, 0.25 + outlineWidth * 0.15)})`
        : undefined,
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
  };
}

export function getCreatorStudioAccentColor(design: CreatorStudioDesign) {
  return getPaletteColor(design.colorPalette, 2, "#D4AF37");
}
