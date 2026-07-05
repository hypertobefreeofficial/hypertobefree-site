import type { CreatorStudioLayerStyle } from "./creationCenter";
import type { CreatorStudioFontPreset } from "./creatorStudioTypography";

export type CreatorStudioTextStylePreset = {
  id: string;
  label: string;
  category: string;
  recommendedUse: string;
  fontPreset: CreatorStudioFontPreset;
  weight: "regular" | "bold";
  italic: boolean;
  fontSize: NonNullable<CreatorStudioLayerStyle["fontSize"]>;
  fontScale: number;
  letterSpacing: number;
  lineHeight: number;
  shadowStrength: number;
  outlineWidth: number;
};

type CategorySeed = {
  category: string;
  recommendedUse: string;
  fontPreset: CreatorStudioFontPreset;
  baseWeight: "regular" | "bold";
  sizeOptions: NonNullable<CreatorStudioLayerStyle["fontSize"]>[];
};

const categorySeeds: CategorySeed[] = [
  {
    category: "Modern",
    recommendedUse: "Clean headlines and contemporary testimony titles",
    fontPreset: "modern-bold",
    baseWeight: "bold",
    sizeOptions: ["hero", "large", "medium"],
  },
  {
    category: "Serif",
    recommendedUse: "Elegant reflective titles and graceful overlays",
    fontPreset: "elegant-serif",
    baseWeight: "regular",
    sizeOptions: ["hero", "large", "medium", "small"],
  },
  {
    category: "Script",
    recommendedUse: "Handwritten journal lines and personal captions",
    fontPreset: "handwritten-accent",
    baseWeight: "regular",
    sizeOptions: ["large", "medium", "small"],
  },
  {
    category: "Worship",
    recommendedUse: "Praise-focused titles and reverent overlays",
    fontPreset: "worshipful",
    baseWeight: "bold",
    sizeOptions: ["hero", "large", "medium"],
  },
  {
    category: "Bold",
    recommendedUse: "Strong declarations and victory statements",
    fontPreset: "modern-bold",
    baseWeight: "bold",
    sizeOptions: ["hero", "large", "medium"],
  },
  {
    category: "Minimal",
    recommendedUse: "Quiet text with little decoration",
    fontPreset: "reflective",
    baseWeight: "regular",
    sizeOptions: ["medium", "small", "large"],
  },
  {
    category: "Cinematic",
    recommendedUse: "Poster-style headlines and dramatic statements",
    fontPreset: "cinematic",
    baseWeight: "bold",
    sizeOptions: ["hero", "large", "medium"],
  },
  {
    category: "Editorial",
    recommendedUse: "Magazine headlines and story-led layouts",
    fontPreset: "editorial",
    baseWeight: "bold",
    sizeOptions: ["hero", "large", "medium"],
  },
  {
    category: "Scripture",
    recommendedUse: "Verse callouts and scripture references",
    fontPreset: "worshipful",
    baseWeight: "regular",
    sizeOptions: ["medium", "small", "large"],
  },
  {
    category: "Joyful",
    recommendedUse: "Celebration, gratitude, and uplifting moments",
    fontPreset: "warm-rounded",
    baseWeight: "bold",
    sizeOptions: ["large", "medium", "hero"],
  },
  {
    category: "Peaceful",
    recommendedUse: "Gentle reflections and calm testimony lines",
    fontPreset: "reflective",
    baseWeight: "regular",
    sizeOptions: ["medium", "small", "large"],
  },
];

const variantProfiles = [
  { suffix: "Classic", fontScale: 1, letterSpacing: 0, lineHeight: 1.12, shadowStrength: 0.3, outlineWidth: 0, italic: false, weightShift: 0 },
  { suffix: "Soft", fontScale: 0.92, letterSpacing: 0.015, lineHeight: 1.2, shadowStrength: 0.18, outlineWidth: 0, italic: false, weightShift: 0 },
  { suffix: "Tight", fontScale: 1.06, letterSpacing: -0.02, lineHeight: 1.05, shadowStrength: 0.38, outlineWidth: 0, italic: false, weightShift: 0 },
  { suffix: "Wide", fontScale: 0.98, letterSpacing: 0.04, lineHeight: 1.18, shadowStrength: 0.22, outlineWidth: 0, italic: false, weightShift: 0 },
  { suffix: "Italic", fontScale: 1, letterSpacing: 0.01, lineHeight: 1.16, shadowStrength: 0.2, outlineWidth: 0, italic: true, weightShift: 0 },
  { suffix: "Hero", fontScale: 1.14, letterSpacing: -0.015, lineHeight: 1.04, shadowStrength: 0.48, outlineWidth: 0, italic: false, weightShift: 1 },
  { suffix: "Caption", fontScale: 0.88, letterSpacing: 0.008, lineHeight: 1.28, shadowStrength: 0.12, outlineWidth: 0, italic: false, weightShift: -1 },
  { suffix: "Glow", fontScale: 1.02, letterSpacing: 0.005, lineHeight: 1.1, shadowStrength: 0.55, outlineWidth: 0, italic: false, weightShift: 0 },
  { suffix: "Outline", fontScale: 1.04, letterSpacing: 0.01, lineHeight: 1.08, shadowStrength: 0.35, outlineWidth: 0.45, italic: false, weightShift: 0 },
  { suffix: "Whisper", fontScale: 0.86, letterSpacing: 0.03, lineHeight: 1.3, shadowStrength: 0.08, outlineWidth: 0, italic: true, weightShift: -1 },
] as const;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function resolveWeight(
  base: "regular" | "bold",
  shift: number
): "regular" | "bold" {
  if (shift > 0) return "bold";
  if (shift < 0) return "regular";
  return base;
}

export const creatorStudioTextStylePresets: CreatorStudioTextStylePreset[] =
  categorySeeds.flatMap((seed, categoryIndex) =>
    variantProfiles.map((profile, variantIndex) => {
      const fontSize =
        seed.sizeOptions[variantIndex % seed.sizeOptions.length] ?? "medium";

      return {
        id: `${slugify(seed.category)}-${variantIndex + 1}`,
        label: `${seed.category} ${profile.suffix}`,
        category: seed.category,
        recommendedUse: `${seed.recommendedUse} · ${profile.suffix} treatment`,
        fontPreset: seed.fontPreset,
        weight: resolveWeight(seed.baseWeight, profile.weightShift),
        italic: profile.italic,
        fontSize,
        fontScale: Number(
          (profile.fontScale + categoryIndex * 0.004).toFixed(3)
        ),
        letterSpacing: Number(
          (profile.letterSpacing + variantIndex * 0.001).toFixed(3)
        ),
        lineHeight: profile.lineHeight,
        shadowStrength: Number(
          Math.min(0.85, profile.shadowStrength + variantIndex * 0.01).toFixed(2)
        ),
        outlineWidth: profile.outlineWidth,
      };
    })
  );

export const creatorStudioTextStylePresetCategories = categorySeeds.map(
  (seed) => seed.category
);

const presetMap = Object.fromEntries(
  creatorStudioTextStylePresets.map((preset) => [preset.id, preset])
) as Record<string, CreatorStudioTextStylePreset>;

export function getCreatorStudioTextStylePreset(id: string | undefined) {
  if (!id) return null;
  return presetMap[id] ?? null;
}

export function applyCreatorStudioTextStylePreset(
  presetId: string
): Partial<CreatorStudioLayerStyle> {
  const preset = getCreatorStudioTextStylePreset(presetId);
  if (!preset) return {};

  return {
    stylePresetId: preset.id,
    fontPreset: preset.fontPreset,
    weight: preset.weight,
    italic: preset.italic,
    fontSize: preset.fontSize,
    fontScale: preset.fontScale,
    letterSpacing: preset.letterSpacing,
    lineHeight: preset.lineHeight,
    shadowStrength: preset.shadowStrength,
    outlineWidth: preset.outlineWidth,
  };
}
