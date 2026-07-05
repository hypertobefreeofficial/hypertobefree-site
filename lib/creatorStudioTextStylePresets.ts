import type { CreatorStudioLayerStyle } from "./creationCenter";
import {
  creatorStudioFontPresets,
  getCreatorStudioFontPresetDefinition,
  type CreatorStudioFontPreset,
  type CreatorStudioFontPresetDefinition,
} from "./creatorStudioTypography";

export type CreatorStudioTextStylePreset = CreatorStudioFontPresetDefinition;

export const creatorStudioTextStylePresets: CreatorStudioTextStylePreset[] =
  creatorStudioFontPresets;

export function applyCreatorStudioFontPreset(
  fontPreset: CreatorStudioFontPreset
): Partial<CreatorStudioLayerStyle> {
  const preset = getCreatorStudioFontPresetDefinition(fontPreset);
  if (!preset) {
    return { fontPreset };
  }

  return {
    fontPreset: preset.value,
    weight: preset.weight,
    italic: preset.italic,
    fontSize: preset.fontSize,
    fontScale: preset.fontScale,
    letterSpacing: preset.letterSpacing,
    lineHeight: preset.lineHeight,
    shadowStrength: preset.shadowStrength,
    outlineWidth: preset.outlineWidth,
    textTransform: preset.textTransform,
    color: preset.defaultColor,
  };
}

/** @deprecated Use applyCreatorStudioFontPreset */
export function applyCreatorStudioTextStylePreset(
  fontPreset: CreatorStudioFontPreset
) {
  return applyCreatorStudioFontPreset(fontPreset);
}
