import type { CreatorStudioLayerStyle } from "./creationCenter";
import {
  buildCreatorStudioFontPresetPreviewStyle,
  creatorStudioFontPresets,
  getCreatorStudioFontPresetDefinition,
  getCreatorStudioFontPresetLabel,
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
): Partial<CreatorStudioLayerStyle> {
  return applyCreatorStudioFontPreset(fontPreset);
}

export function groupCreatorStudioFontPresetsByCategory(): {
  category: string;
  presets: CreatorStudioTextStylePreset[];
}[] {
  return [
    {
      category: "Text styles",
      presets: creatorStudioTextStylePresets,
    },
  ];
}

export {
  buildCreatorStudioFontPresetPreviewStyle,
  getCreatorStudioFontPresetDefinition,
  getCreatorStudioFontPresetLabel,
};
