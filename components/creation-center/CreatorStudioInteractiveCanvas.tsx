import type { CSSProperties } from "react";
import {
  getCreatorStudioLayerCoordinates,
  getCreatorStudioLayerStyle,
  getCreatorStudioLayerTransform,
  type CreatorStudioDesign,
  type CreatorStudioLayerStyle,
  type CreatorStudioTextLayer,
} from "./creationCenter";

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

function getStyledSizeClass(
  size: CreatorStudioLayerStyle["fontSize"] | undefined,
  compact: boolean
) {
  if (size === "small") return compact ? "text-lg" : "text-2xl";
  if (size === "medium") return compact ? "text-2xl" : "text-3xl sm:text-4xl";
  if (size === "large")
    return compact ? "text-[2rem]" : "text-[clamp(1.75rem,6vw,4.5rem)]";
  if (size === "hero")
    return compact ? "text-[2.5rem]" : "text-[clamp(2rem,8vw,5.5rem)]";

  return compact ? "text-2xl" : "text-[clamp(1.75rem,6vw,4.5rem)]";
}

function scaleFontSize(base: string, scale = 1) {
  if (scale === 1) return base;

  return base
    .replace(/clamp\(([^)]+)\)/g, (_match, inner: string) => {
      const parts = inner.split(",").map((part: string) => part.trim());

      return `clamp(${parts
        .map((part: string, index: number) =>
          index === 0
            ? part
            : part.replace(
                /([\d.]+)(rem|vw|px)/g,
                (_m, num: string, unit: string) =>
                  `${Math.max(0.75, Number(num) * scale).toFixed(2)}${unit}`
              )
        )
        .join(", ")})`;
    })
    .replace(/text-\[([\d.]+)rem\]/g, (_m, num: string) =>
      `text-[${Math.max(0.75, Number(num) * scale).toFixed(2)}rem]`
    );
}

export function buildCreatorStudioLayerTypography(
  design: CreatorStudioDesign,
  layer: CreatorStudioTextLayer,
  compact = false
) {
  const layerStyle = getCreatorStudioLayerStyle(design, layer);
  const fontScale = layerStyle.fontScale ?? 1;
  const styledSizeClass = scaleFontSize(
    getStyledSizeClass(layerStyle.fontSize, compact),
    fontScale
  );
  const weightClass =
    layerStyle.weight === "regular" ? "font-semibold" : "font-black";
  const italicClass = layerStyle.italic ? "italic" : "";
  const alignClass =
    layerStyle.align === "center"
      ? "text-center"
      : layerStyle.align === "right"
        ? "text-right"
        : "text-left";
  const coordinates = getCreatorStudioLayerCoordinates(layerStyle);
  const inlineStyle: CSSProperties = {
    color:
      layerStyle.color ||
      getPaletteColor(design.colorPalette, 1, "#FFFFFF"),
    textAlign: layerStyle.align,
  };

  return {
    layerStyle,
    styledSizeClass,
    weightClass,
    italicClass,
    alignClass,
    coordinates,
    transform: getCreatorStudioLayerTransform(layerStyle.align, coordinates.x),
    inlineStyle,
  };
}

export function getCreatorStudioAccentColor(design: CreatorStudioDesign) {
  return getPaletteColor(design.colorPalette, 2, "#D4AF37");
}
