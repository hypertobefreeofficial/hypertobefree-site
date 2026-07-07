import {
  Bebas_Neue,
  Caveat,
  Caveat_Brush,
  EB_Garamond,
  Funnel_Display,
  Great_Vibes,
  Inter,
  Manrope,
  Oswald,
  Playfair_Display,
  Special_Elite,
} from "next/font/google";
import type {
  CreatorStudioDesign,
  CreatorStudioLayerStyle,
  CreatorStudioTextLayer,
} from "./creationCenter";

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

export const funnelDisplay = Funnel_Display({
  subsets: ["latin"],
  variable: "--font-funnel-display",
  display: "swap",
  weight: ["600", "700", "800"],
});

export const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-eb-garamond",
  display: "swap",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair-display",
  display: "swap",
  weight: ["600", "700"],
  style: ["normal", "italic"],
});

export const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  variable: "--font-bebas-neue",
  display: "swap",
  weight: "400",
});

export const oswald = Oswald({
  subsets: ["latin"],
  variable: "--font-oswald",
  display: "swap",
  weight: ["500", "600", "700"],
});

export const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
  display: "swap",
  weight: ["500", "600", "700"],
});

export const caveatBrush = Caveat_Brush({
  subsets: ["latin"],
  variable: "--font-caveat-brush",
  display: "swap",
  weight: "400",
});

export const greatVibes = Great_Vibes({
  subsets: ["latin"],
  variable: "--font-great-vibes",
  display: "swap",
  weight: "400",
});

export const specialElite = Special_Elite({
  subsets: ["latin"],
  variable: "--font-special-elite",
  display: "swap",
  weight: "400",
});

export const fontVariables = [
  inter.variable,
  manrope.variable,
  funnelDisplay.variable,
  ebGaramond.variable,
  playfairDisplay.variable,
  bebasNeue.variable,
  oswald.variable,
  caveat.variable,
  caveatBrush.variable,
  greatVibes.variable,
  specialElite.variable,
].join(" ");

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

export type CreatorStudioFontPresetDefinition = {
  value: CreatorStudioFontPreset;
  label: string;
  category: string;
  previewSample: string;
  fontClassName: string;
  weight: string;
  italic?: boolean;
  fontSize?: CreatorStudioLayerStyle["fontSize"];
  fontScale?: number;
  letterSpacing?: number;
  lineHeight?: number;
  shadowStrength?: number;
  outlineWidth?: number;
  textTransform?: CreatorStudioLayerStyle["textTransform"];
  defaultColor?: string;
  glowColor?: string;
  decoration?: {
    previewBackground?: string;
  };
};

export const creatorStudioFontPresets: CreatorStudioFontPresetDefinition[] = [
  {
    value: "modern-bold",
    label: "Modern Bold",
    category: "Bold",
    previewSample: "God is moving",
    fontClassName: "font-heading",
    weight: "font-extrabold",
    fontSize: "large",
    fontScale: 1,
    letterSpacing: 0.01,
    lineHeight: 1.05,
    shadowStrength: 0.45,
    defaultColor: "#FFFFFF",
  },
  {
    value: "elegant-serif",
    label: "Elegant Serif",
    category: "Serif",
    previewSample: "Grace found me",
    fontClassName: "font-serif",
    weight: "font-semibold",
    fontSize: "large",
    fontScale: 0.96,
    letterSpacing: 0.01,
    lineHeight: 1.12,
    shadowStrength: 0.28,
    defaultColor: "#FFF7ED",
  },
  {
    value: "handwritten-journal",
    label: "Handwritten Journal",
    category: "Handwritten",
    previewSample: "Still held by Him",
    fontClassName: "font-caveat",
    weight: "font-bold",
    fontSize: "large",
    fontScale: 1.08,
    letterSpacing: 0,
    lineHeight: 1.04,
    shadowStrength: 0.25,
    defaultColor: "#FFFFFF",
  },
  {
    value: "worship-script",
    label: "Worship Script",
    category: "Script",
    previewSample: "Thank You Jesus",
    fontClassName: "font-great-vibes",
    weight: "font-normal",
    fontSize: "hero",
    fontScale: 1,
    letterSpacing: 0,
    lineHeight: 1.02,
    shadowStrength: 0.35,
    defaultColor: "#FFF1F2",
  },
  {
    value: "typewriter-testimony",
    label: "Typewriter Testimony",
    category: "Vintage",
    previewSample: "My testimony",
    fontClassName: "font-special-elite",
    weight: "font-normal",
    fontSize: "medium",
    fontScale: 0.95,
    letterSpacing: 0.02,
    lineHeight: 1.25,
    shadowStrength: 0.2,
    defaultColor: "#F8FAFC",
  },
  {
    value: "minimal-uppercase",
    label: "Minimal Uppercase",
    category: "Clean",
    previewSample: "PEACE BE STILL",
    fontClassName: "font-sans",
    weight: "font-bold",
    fontSize: "medium",
    fontScale: 0.9,
    letterSpacing: 0.14,
    lineHeight: 1.2,
    shadowStrength: 0.22,
    textTransform: "uppercase",
    defaultColor: "#FFFFFF",
  },
  {
    value: "cinematic-poster",
    label: "Cinematic Poster",
    category: "Poster",
    previewSample: "BREAKTHROUGH",
    fontClassName: "font-bebas",
    weight: "font-normal",
    fontSize: "hero",
    fontScale: 1,
    letterSpacing: 0.08,
    lineHeight: 0.95,
    shadowStrength: 0.55,
    textTransform: "uppercase",
    defaultColor: "#FFFFFF",
  },
  {
    value: "magazine-editorial",
    label: "Magazine Editorial",
    category: "Editorial",
    previewSample: "A new chapter",
    fontClassName: "font-playfair",
    weight: "font-bold",
    italic: true,
    fontSize: "large",
    fontScale: 0.95,
    letterSpacing: -0.02,
    lineHeight: 1.08,
    shadowStrength: 0.3,
    defaultColor: "#FFFFFF",
  },
  {
    value: "neon-glow",
    label: "Neon Glow",
    category: "Glow",
    previewSample: "Hope is alive",
    fontClassName: "font-heading",
    weight: "font-extrabold",
    fontSize: "large",
    fontScale: 1,
    letterSpacing: 0.03,
    lineHeight: 1.05,
    shadowStrength: 0.8,
    glowColor: "#69B7FF",
    defaultColor: "#E0F2FE",
  },
  {
    value: "vintage-church",
    label: "Vintage Church",
    category: "Vintage",
    previewSample: "Amazing Grace",
    fontClassName: "font-serif",
    weight: "font-bold",
    fontSize: "large",
    fontScale: 0.98,
    letterSpacing: 0.04,
    lineHeight: 1.15,
    shadowStrength: 0.32,
    defaultColor: "#FEF3C7",
  },
  {
    value: "chalkboard",
    label: "Chalkboard",
    category: "Handwritten",
    previewSample: "Pray with me",
    fontClassName: "font-caveat-brush",
    weight: "font-normal",
    fontSize: "large",
    fontScale: 1.02,
    letterSpacing: 0.01,
    lineHeight: 1.1,
    shadowStrength: 0.25,
    defaultColor: "#F8FAFC",
  },
  {
    value: "brush-stroke",
    label: "Brush Stroke",
    category: "Handwritten",
    previewSample: "Set Free",
    fontClassName: "font-caveat-brush",
    weight: "font-normal",
    fontSize: "hero",
    fontScale: 1.05,
    letterSpacing: 0.01,
    lineHeight: 0.95,
    shadowStrength: 0.45,
    defaultColor: "#FFFFFF",
  },
  {
    value: "luxury-gold",
    label: "Luxury Gold",
    category: "Premium",
    previewSample: "Kingdom purpose",
    fontClassName: "font-playfair",
    weight: "font-bold",
    fontSize: "large",
    fontScale: 0.98,
    letterSpacing: 0.04,
    lineHeight: 1.1,
    shadowStrength: 0.45,
    defaultColor: "#F8D77A",
  },
  {
    value: "clean-modern-sans",
    label: "Clean Modern Sans",
    category: "Clean",
    previewSample: "God is faithful",
    fontClassName: "font-sans",
    weight: "font-semibold",
    fontSize: "medium",
    fontScale: 0.9,
    letterSpacing: 0,
    lineHeight: 1.25,
    shadowStrength: 0.2,
    defaultColor: "#FFFFFF",
  },
  {
    value: "faith-journal",
    label: "Faith Journal",
    category: "Journal",
    previewSample: "Today I prayed",
    fontClassName: "font-caveat",
    weight: "font-semibold",
    fontSize: "medium",
    fontScale: 1.05,
    letterSpacing: 0,
    lineHeight: 1.15,
    shadowStrength: 0.18,
    defaultColor: "#FFFFFF",
  },
  {
    value: "newspaper",
    label: "Newspaper",
    category: "Editorial",
    previewSample: "Good news",
    fontClassName: "font-serif",
    weight: "font-bold",
    fontSize: "medium",
    fontScale: 0.95,
    letterSpacing: 0.02,
    lineHeight: 1.12,
    shadowStrength: 0.18,
    defaultColor: "#F8FAFC",
  },
  {
    value: "storybook",
    label: "Storybook",
    category: "Serif",
    previewSample: "Once lost, now found",
    fontClassName: "font-serif",
    weight: "font-semibold",
    fontSize: "large",
    fontScale: 0.95,
    letterSpacing: 0.01,
    lineHeight: 1.18,
    shadowStrength: 0.25,
    defaultColor: "#FFF7ED",
  },
  {
    value: "hero-title",
    label: "Hero Title",
    category: "Bold",
    previewSample: "VICTORY",
    fontClassName: "font-oswald",
    weight: "font-bold",
    fontSize: "hero",
    fontScale: 1,
    letterSpacing: 0.06,
    lineHeight: 0.98,
    shadowStrength: 0.5,
    textTransform: "uppercase",
    defaultColor: "#FFFFFF",
  },
  {
    value: "social-creator",
    label: "Social Creator",
    category: "Social",
    previewSample: "Share the hope",
    fontClassName: "font-manrope",
    weight: "font-extrabold",
    fontSize: "large",
    fontScale: 0.92,
    letterSpacing: -0.01,
    lineHeight: 1.05,
    shadowStrength: 0.35,
    defaultColor: "#FFFFFF",
  },
  {
    value: "scripture-card",
    label: "Scripture Card",
    category: "Scripture",
    previewSample: "Galatians 5:1",
    fontClassName: "font-serif",
    weight: "font-semibold",
    italic: true,
    fontSize: "medium",
    fontScale: 0.95,
    letterSpacing: 0.04,
    lineHeight: 1.2,
    shadowStrength: 0.25,
    defaultColor: "#FFFFFF",
  },
];

export function clampCreatorStudioFontScale(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return 1;
  return Math.min(Math.max(value, 0.45), 2.5);
}

export function getCreatorStudioFontPresetDefinition(
  value: CreatorStudioFontPreset | string | undefined
) {
  return creatorStudioFontPresets.find((preset) => preset.value === value) ?? null;
}

export function getCreatorStudioFontPresetLabel(
  value: CreatorStudioFontPreset | string | undefined
) {
  return getCreatorStudioFontPresetDefinition(value)?.label ?? "Custom";
}

export function getCreatorStudioFontClassName(
  _design: CreatorStudioDesign,
  layerStyle: CreatorStudioLayerStyle,
  _layer: CreatorStudioTextLayer
) {
  const preset = getCreatorStudioFontPresetDefinition(layerStyle.fontPreset);
  return preset?.fontClassName ?? "font-heading";
}

export function buildCreatorStudioFontPresetPreviewStyle(
  preset: CreatorStudioFontPresetDefinition
) {
  return {
    className: `${preset.fontClassName} ${preset.weight} ${
      preset.italic ? "italic" : ""
    }`,
    style: {
      color: preset.defaultColor ?? "#FFFFFF",
      letterSpacing:
        preset.letterSpacing !== undefined ? `${preset.letterSpacing}em` : undefined,
      lineHeight: preset.lineHeight,
      textTransform: preset.textTransform,
      textShadow: preset.glowColor
        ? `0 0 18px ${preset.glowColor}`
        : preset.shadowStrength
          ? `0 2px ${Math.round(preset.shadowStrength * 20)}px rgba(0,0,0,0.55)`
          : undefined,
    } as CSSProperties,
    decoration: preset.decoration,
  };
}
