export const CREATION_CENTER_V2_ENABLED = true;
export const CREATION_CENTER_IMAGES_ENABLED = true;
export const MAX_FAITH_STREAMS = 5;

const CREATION_CENTER_IMAGE_BASE =
  "/images/backgrounds/public-pack-v1/";

export const creationCenterImages = {
  scriptureWoods: `${CREATION_CENTER_IMAGE_BASE}01-scripture-woods.PNG`,
  psalmPraise: `${CREATION_CENTER_IMAGE_BASE}03-psalm-praise.PNG`,
  lighthouseScripture: `${CREATION_CENTER_IMAGE_BASE}05-lighthouse-scripture.PNG`,
  eagleSoar: `${CREATION_CENTER_IMAGE_BASE}09-eagle-soar.PNG`,
  lakeWorship: `${CREATION_CENTER_IMAGE_BASE}14-lake-worship.PNG`,
  breakingChainsFreedom: `${CREATION_CENTER_IMAGE_BASE}18-breaking-chains-freedom.PNG`,
  valleyPraise: `${CREATION_CENTER_IMAGE_BASE}19-valley-praise.PNG`,
  beStillPrayer: `${CREATION_CENTER_IMAGE_BASE}20-be-still-psalms-prayer.PNG`,
} as const;

export type CreationCenterFormat =
  | "video"
  | "photo"
  | "written-story"
  | "voice-message"
  | "testimony-card"
  | "prayer-card"
  | "encouragement-card";

export type CreationCenterStoryType =
  | "testimony"
  | "prayer"
  | "prophecy"
  | "teaching"
  | "worship"
  | "encouragement"
  | "praise-report"
  | "deliverance-story";

export type FaithStream =
  | "healing"
  | "deliverance"
  | "prayer-warriors"
  | "worship"
  | "teachings"
  | "prophecy"
  | "encouragement"
  | "marriage"
  | "veterans"
  | "missions"
  | "salvation"
  | "freedom"
  | "scripture"
  | "revival";

export type CreationCenterTemplateId =
  | "none"
  | "scripture-woods"
  | "psalm-praise"
  | "lighthouse-scripture"
  | "eagle-freedom"
  | "breaking-chains-deliverance"
  | "be-still-prayer"
  | "lake-worship"
  | "valley-praise";

export type CreationCenterStoryTemplate = {
  id: CreationCenterTemplateId;
  label: string;
  description: string;
  imagePath: string | null;
};

export type CreationCenterPrompt = {
  id: string;
  label: string;
  placeholder: string;
};

export type CreationCenterSuggestion = {
  storyType: string;
  topics: string[];
  faithStreams: FaithStream[];
  titles: string[];
  caption: string;
  scriptureReferences: string[];
  template: string;
  layoutSuggestion: string;
};

export type CreatorStudioDesign = {
  id: string;
  studioPath:
    | "tell-story"
    | "create-design"
    | "scripture-post"
    | "ai-surprise";
  sourceMode:
    | "upload-video"
    | "upload-photo"
    | "build-ai"
    | "start-template";
  title: string;
  overlayText: string;
  caption: string;
  category: string;
  topic: string;
  templateId: CreationCenterTemplateId;
  styleMood: string;
  layoutType:
    | "full-image-poster"
    | "text-over-image-testimony"
    | "split-layout"
    | "quote-card"
    | "prayer-request-card"
    | "praise-report-card"
    | "scripture-card"
    | "photo-collage"
    | "video-photo-mixed"
    | "before-after-testimony"
    | "timeline-story"
    | "magazine-style"
    | "journal-style";
  scriptureSuggestion: string;
  scriptureText?: string;
  suggestedPostFormat: string;
  colorPalette?: string[];
  typographyStyle?: string;
  designTreatment?: string;
  callToAction?: string;
  typographyPairing?: string;
  fontHierarchy?: string;
  backgroundTreatment?: string;
  layoutComposition?: string;
  overlayStyle?: string;
  decorativeElements?: string;
  visualTheme?: string;
  filterRecommendation?: string;
  cropRecommendation?: string;
  generatedImageUrl?: string;
  generatedImagePath?: string;
  generatedImageBucket?: string;
  imageGenerationPrompt?: string;
  alternateTitles?: string[];
  alternateCaptions?: string[];
  hashtags?: string[];
  conceptReason?: string;
  textStyle?: {
    fontSize?: "small" | "medium" | "large" | "hero";
    fontScale?: number;
    weight?: "regular" | "bold";
    italic?: boolean;
    align?: "left" | "center" | "right";
    color?: string;
    position?: "top" | "center" | "bottom";
  };
  layerStyles?: Partial<
    Record<CreatorStudioTextLayer, CreatorStudioLayerStyle>
  >;
};

export type CreatorStudioTextLayer =
  | "title"
  | "overlay"
  | "caption"
  | "scripture"
  | "callToAction";

export type CreatorStudioLayerPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type CreatorStudioLayerStyle = {
  fontSize?: "small" | "medium" | "large" | "hero";
  fontScale?: number;
  fontPreset?:
    | "modern-bold"
    | "elegant-serif"
    | "warm-rounded"
    | "editorial"
    | "cinematic"
    | "reflective"
    | "worshipful"
    | "handwritten-accent";
  weight?: "regular" | "bold";
  italic?: boolean;
  align?: "left" | "center" | "right";
  color?: string;
  position?: CreatorStudioLayerPosition;
  x?: number;
  y?: number;
  hidden?: boolean;
  opacity?: number;
  letterSpacing?: number;
  lineHeight?: number;
  shadowStrength?: number;
  outlineWidth?: number;
  rotation?: number;
  layerOrder?: number;
};

export const creatorStudioLayerPositionCoordinates: Record<
  CreatorStudioLayerPosition,
  { x: number; y: number }
> = {
  "top-left": { x: 8, y: 12 },
  "top-center": { x: 50, y: 12 },
  "top-right": { x: 92, y: 12 },
  center: { x: 50, y: 46 },
  "bottom-left": { x: 8, y: 82 },
  "bottom-center": { x: 50, y: 82 },
  "bottom-right": { x: 92, y: 82 },
};

export const creatorStudioTextLayers: {
  value: CreatorStudioTextLayer;
  label: string;
  defaultPosition: CreatorStudioLayerPosition;
}[] = [
  { value: "title", label: "Title", defaultPosition: "top-center" },
  { value: "overlay", label: "Subtitle", defaultPosition: "center" },
  { value: "caption", label: "Caption", defaultPosition: "bottom-center" },
  { value: "scripture", label: "Scripture", defaultPosition: "bottom-left" },
  { value: "callToAction", label: "CTA", defaultPosition: "bottom-right" },
];

export const creatorStudioLayerPositions: CreatorStudioLayerPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "center",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

export const CREATOR_STUDIO_CANVAS_SAFE_INSET = {
  top: 10,
  right: 8,
  bottom: 10,
  left: 8,
  bottomMobile: 24,
} as const;

export function getCreatorStudioCanvasSafeInset(reserveMobileBottom = false) {
  return {
    top: CREATOR_STUDIO_CANVAS_SAFE_INSET.top,
    right: CREATOR_STUDIO_CANVAS_SAFE_INSET.right,
    left: CREATOR_STUDIO_CANVAS_SAFE_INSET.left,
    bottom: reserveMobileBottom
      ? CREATOR_STUDIO_CANVAS_SAFE_INSET.bottomMobile
      : CREATOR_STUDIO_CANVAS_SAFE_INSET.bottom,
  };
}

export function clampCreatorStudioLayerCoordinates(
  x: number,
  y: number,
  options?: { reserveMobileBottom?: boolean }
): { x: number; y: number } {
  const inset = getCreatorStudioCanvasSafeInset(options?.reserveMobileBottom);

  return {
    x: Math.min(100 - inset.right, Math.max(inset.left, x)),
    y: Math.min(100 - inset.bottom, Math.max(inset.top, y)),
  };
}

export function getCreatorStudioLayerCoordinates(
  style: CreatorStudioLayerStyle,
  options?: { reserveMobileBottom?: boolean }
): { x: number; y: number } {
  if (typeof style.x === "number" && typeof style.y === "number") {
    return clampCreatorStudioLayerCoordinates(style.x, style.y, options);
  }

  return clampCreatorStudioLayerCoordinates(
    creatorStudioLayerPositionCoordinates[style.position ?? "center"]?.x ??
      creatorStudioLayerPositionCoordinates.center.x,
    creatorStudioLayerPositionCoordinates[style.position ?? "center"]?.y ??
      creatorStudioLayerPositionCoordinates.center.y,
    options
  );
}

export function getCreatorStudioLayerTransform(
  align: CreatorStudioLayerStyle["align"],
  x: number,
  rotation = 0
): string {
  let base: string;

  if (align === "center" || x === 50) {
    base = "translate(-50%, -50%)";
  } else if (align === "right" || x >= 70) {
    base = "translate(-100%, -50%)";
  } else {
    base = "translate(0, -50%)";
  }

  if (rotation !== 0) {
    return `${base} rotate(${rotation}deg)`;
  }

  return base;
}

export function getScriptureDisplayText(design: CreatorStudioDesign): string {
  const reference = design.scriptureSuggestion?.trim() ?? "";
  const body = design.scriptureText?.trim() ?? "";

  if (reference && body) {
    return `${reference}\n${body}`;
  }

  return reference || body;
}

export function parseScriptureEditValue(value: string): {
  scriptureSuggestion: string;
  scriptureText: string;
} {
  const lines = value.split("\n");
  const scriptureSuggestion = lines[0]?.trim() ?? "";
  const scriptureText = lines.slice(1).join("\n").trim();

  return { scriptureSuggestion, scriptureText };
}

export function getCreatorStudioLayerDisplayText(
  design: CreatorStudioDesign,
  layer: CreatorStudioTextLayer
): string {
  switch (layer) {
    case "title":
      return design.title;
    case "overlay":
      return design.overlayText;
    case "caption":
      return design.caption;
    case "scripture":
      return getScriptureDisplayText(design);
    case "callToAction":
      return design.callToAction ?? "";
  }
}

export function buildCreatorStudioLayerDisplayTextUpdate(
  layer: CreatorStudioTextLayer,
  value: string
): Partial<CreatorStudioDesign> {
  if (layer === "scripture") {
    return parseScriptureEditValue(value);
  }

  return buildCreatorStudioLayerTextUpdate(layer, value);
}

export function shouldUseCreatorStudioCanvasLayout(
  design: CreatorStudioDesign | null | undefined
): boolean {
  if (!design) return false;

  return Boolean(
    design.layerStyles && Object.keys(design.layerStyles).length > 0
  );
}

export function ensureCreatorStudioCanvasLayers(
  design: CreatorStudioDesign
): CreatorStudioDesign {
  if (design.layerStyles && Object.keys(design.layerStyles).length > 0) {
    return design;
  }

  return {
    ...design,
    layerStyles: buildConceptLayerStyles(design),
  };
}

export function prepareCreatorStudioForEditing(
  design: CreatorStudioDesign
): CreatorStudioDesign {
  return ensureCreatorStudioCanvasLayers(design);
}

export function getConceptPersonalityLabel(design: CreatorStudioDesign) {
  return (
    design.visualTheme?.trim() ||
    design.typographyStyle?.trim() ||
    creatorStudioLayoutOptions.find((option) => option.value === design.layoutType)
      ?.label ||
    "Creative direction"
  );
}

function paletteColor(design: CreatorStudioDesign, index: number, fallback: string) {
  const value = design.colorPalette?.[index];
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim())
    ? value.trim()
    : fallback;
}

function layerStyleFromPosition(
  position: CreatorStudioLayerPosition,
  overrides: Partial<CreatorStudioLayerStyle> = {}
): CreatorStudioLayerStyle {
  const { x, y } = creatorStudioLayerPositionCoordinates[position];

  return { x, y, ...overrides };
}

function defaultFontPresetForLayer(
  design: CreatorStudioDesign,
  layer: CreatorStudioTextLayer
): NonNullable<CreatorStudioLayerStyle["fontPreset"]> {
  const hint =
    `${design.typographyPairing ?? ""} ${design.typographyStyle ?? ""} ${design.visualTheme ?? ""}`.toLowerCase();

  if (design.layoutType === "magazine-style") {
    if (layer === "title") return "editorial";
    if (layer === "overlay") return "reflective";
    if (layer === "scripture") return "worshipful";
  }
  if (design.layoutType === "full-image-poster") {
    if (layer === "title") return "cinematic";
    if (layer === "caption") return "modern-bold";
  }
  if (design.layoutType === "quote-card") {
    if (layer === "title") return "elegant-serif";
    if (layer === "scripture") return "worshipful";
    return "reflective";
  }
  if (design.layoutType === "praise-report-card") {
    if (layer === "title") return "worshipful";
    if (layer === "overlay") return "modern-bold";
  }
  if (design.layoutType === "journal-style") {
    if (layer === "title") return "handwritten-accent";
    if (layer === "overlay" || layer === "caption") return "reflective";
  }
  if (design.layoutType === "scripture-card") {
    if (layer === "scripture" || layer === "title") return "worshipful";
    return "reflective";
  }
  if (design.layoutType === "split-layout" && layer === "title") {
    return "editorial";
  }
  if (design.layoutType === "prayer-request-card") {
    return "reflective";
  }
  if (design.layoutType === "timeline-story") {
    if (layer === "caption") return "warm-rounded";
    if (layer === "title") return "editorial";
  }
  if (design.layoutType === "before-after-testimony" && layer === "title") {
    return "cinematic";
  }
  if (layer === "scripture") return "worshipful";
  if (
    hint.includes("handwritten") ||
    hint.includes("journal") ||
    design.layoutType === "journal-style"
  ) {
    return layer === "title" ? "handwritten-accent" : "reflective";
  }
  if (hint.includes("worship") || hint.includes("praise")) return "worshipful";
  if (hint.includes("cinematic") || hint.includes("documentary")) {
    return "cinematic";
  }
  if (hint.includes("editorial") || hint.includes("magazine")) {
    return "editorial";
  }
  if (
    hint.includes("minimal") ||
    hint.includes("peaceful") ||
    hint.includes("reflect")
  ) {
    return "reflective";
  }
  if (hint.includes("serif") || hint.includes("elegant")) {
    return "elegant-serif";
  }

  return "modern-bold";
}

function withFontPreset(
  design: CreatorStudioDesign,
  layer: CreatorStudioTextLayer,
  style: CreatorStudioLayerStyle
): CreatorStudioLayerStyle {
  if (style.hidden) return style;

  return {
    fontPreset: defaultFontPresetForLayer(design, layer),
    ...style,
  };
}

function buildConceptLayerStyles(
  design: CreatorStudioDesign
): NonNullable<CreatorStudioDesign["layerStyles"]> {
  const textColor = design.textStyle?.color ?? paletteColor(design, 1, "#FFFFFF");
  const accentColor = paletteColor(design, 2, "#D4AF37");
  const baseScale = design.textStyle?.fontScale ?? 1;
  const layout = design.layoutType;

  const personalities: Partial<
    Record<CreatorStudioLayoutType, Partial<Record<CreatorStudioTextLayer, CreatorStudioLayerStyle>>>
  > = {
    "magazine-style": {
      title: layerStyleFromPosition("top-left", {
        fontSize: "hero",
        fontScale: baseScale * 1.08,
        weight: "bold",
        align: "left",
        color: textColor,
        shadowStrength: 0.45,
        y: 34,
        layerOrder: 4,
      }),
      overlay: layerStyleFromPosition("center", {
        fontSize: "medium",
        weight: "regular",
        italic: true,
        align: "left",
        color: textColor,
        x: 12,
        y: 52,
        lineHeight: 1.35,
        layerOrder: 3,
      }),
      caption: layerStyleFromPosition("bottom-left", {
        fontSize: "small",
        weight: "regular",
        align: "left",
        color: textColor,
        opacity: 0.92,
        y: 76,
        layerOrder: 2,
      }),
      scripture: layerStyleFromPosition("bottom-left", {
        fontSize: "small",
        weight: "bold",
        align: "left",
        color: accentColor,
        letterSpacing: 0.08,
        y: 88,
        layerOrder: 1,
      }),
      callToAction: { hidden: true },
    },
    "full-image-poster": {
      title: layerStyleFromPosition("bottom-left", {
        fontSize: "hero",
        fontScale: baseScale * 1.12,
        weight: "bold",
        align: "left",
        color: textColor,
        shadowStrength: 0.55,
        y: 62,
        layerOrder: 4,
      }),
      overlay: { hidden: true },
      caption: layerStyleFromPosition("bottom-left", {
        fontSize: "medium",
        weight: "regular",
        align: "left",
        color: textColor,
        opacity: 0.95,
        y: 78,
        lineHeight: 1.35,
        layerOrder: 3,
      }),
      scripture: layerStyleFromPosition("bottom-right", {
        fontSize: "small",
        weight: "bold",
        align: "right",
        color: accentColor,
        y: 90,
        layerOrder: 2,
      }),
      callToAction: { hidden: true },
    },
    "quote-card": {
      title: layerStyleFromPosition("center", {
        fontSize: "large",
        fontScale: baseScale * 0.98,
        weight: "regular",
        italic: true,
        align: "center",
        color: textColor,
        lineHeight: 1.45,
        letterSpacing: 0.02,
        shadowStrength: 0.2,
        layerOrder: 3,
      }),
      overlay: { hidden: true },
      caption: { hidden: true },
      scripture: layerStyleFromPosition("bottom-center", {
        fontSize: "small",
        weight: "bold",
        align: "center",
        color: accentColor,
        letterSpacing: 0.1,
        y: 78,
        layerOrder: 2,
      }),
      callToAction: { hidden: true },
    },
    "praise-report-card": {
      title: layerStyleFromPosition("top-center", {
        fontSize: "hero",
        fontScale: baseScale * 1.05,
        weight: "bold",
        align: "center",
        color: accentColor,
        shadowStrength: 0.4,
        y: 28,
        layerOrder: 4,
      }),
      overlay: layerStyleFromPosition("center", {
        fontSize: "medium",
        weight: "bold",
        align: "center",
        color: textColor,
        y: 48,
        layerOrder: 3,
      }),
      caption: layerStyleFromPosition("bottom-center", {
        fontSize: "small",
        weight: "regular",
        align: "center",
        color: textColor,
        y: 72,
        layerOrder: 2,
      }),
      scripture: { hidden: true },
      callToAction: { hidden: true },
    },
    "journal-style": {
      title: layerStyleFromPosition("center", {
        fontSize: "large",
        fontScale: baseScale,
        weight: "bold",
        align: "left",
        color: "#062A57",
        x: 14,
        y: 38,
        lineHeight: 1.15,
        layerOrder: 4,
      }),
      overlay: layerStyleFromPosition("center", {
        fontSize: "medium",
        weight: "regular",
        align: "left",
        color: "#334155",
        x: 14,
        y: 52,
        lineHeight: 1.5,
        layerOrder: 3,
      }),
      caption: layerStyleFromPosition("center", {
        fontSize: "small",
        weight: "regular",
        align: "left",
        color: "#475569",
        x: 14,
        y: 68,
        lineHeight: 1.55,
        layerOrder: 2,
      }),
      scripture: layerStyleFromPosition("bottom-left", {
        fontSize: "small",
        weight: "bold",
        align: "left",
        color: "#0B63CE",
        x: 14,
        y: 84,
        layerOrder: 1,
      }),
      callToAction: { hidden: true },
    },
    "scripture-card": {
      title: { hidden: true },
      overlay: { hidden: true },
      caption: { hidden: true },
      scripture: layerStyleFromPosition("center", {
        fontSize: "hero",
        fontScale: baseScale * 1.05,
        weight: "bold",
        align: "center",
        color: textColor,
        lineHeight: 1.35,
        letterSpacing: 0.03,
        shadowStrength: 0.35,
        layerOrder: 3,
      }),
      callToAction: layerStyleFromPosition("bottom-center", {
        fontSize: "small",
        weight: "regular",
        italic: true,
        align: "center",
        color: accentColor,
        y: 82,
        opacity: 0.9,
        layerOrder: 1,
      }),
    },
    "split-layout": {
      title: layerStyleFromPosition("top-left", {
        fontSize: "hero",
        fontScale: baseScale * 1.02,
        weight: "bold",
        align: "left",
        color: textColor,
        x: 10,
        y: 22,
        shadowStrength: 0.4,
        layerOrder: 4,
      }),
      overlay: layerStyleFromPosition("center", {
        fontSize: "medium",
        weight: "regular",
        align: "left",
        color: textColor,
        x: 10,
        y: 48,
        lineHeight: 1.45,
        layerOrder: 3,
      }),
      caption: layerStyleFromPosition("bottom-left", {
        fontSize: "small",
        weight: "regular",
        align: "left",
        color: textColor,
        opacity: 0.88,
        x: 10,
        y: 78,
        layerOrder: 2,
      }),
      scripture: layerStyleFromPosition("bottom-left", {
        fontSize: "small",
        weight: "bold",
        align: "left",
        color: accentColor,
        x: 10,
        y: 90,
        layerOrder: 1,
      }),
      callToAction: { hidden: true },
    },
    "prayer-request-card": {
      title: layerStyleFromPosition("center", {
        fontSize: "large",
        fontScale: baseScale * 0.92,
        weight: "regular",
        italic: true,
        align: "center",
        color: textColor,
        lineHeight: 1.55,
        y: 42,
        layerOrder: 3,
      }),
      overlay: { hidden: true },
      caption: layerStyleFromPosition("bottom-center", {
        fontSize: "small",
        weight: "regular",
        align: "center",
        color: textColor,
        opacity: 0.85,
        y: 72,
        layerOrder: 2,
      }),
      scripture: layerStyleFromPosition("bottom-center", {
        fontSize: "small",
        weight: "bold",
        align: "center",
        color: accentColor,
        y: 86,
        layerOrder: 1,
      }),
      callToAction: { hidden: true },
    },
    "timeline-story": {
      title: layerStyleFromPosition("top-left", {
        fontSize: "large",
        weight: "bold",
        align: "left",
        color: textColor,
        x: 10,
        y: 16,
        layerOrder: 4,
      }),
      overlay: { hidden: true },
      caption: layerStyleFromPosition("center", {
        fontSize: "medium",
        weight: "regular",
        align: "left",
        color: textColor,
        x: 12,
        y: 50,
        lineHeight: 1.5,
        layerOrder: 3,
      }),
      scripture: layerStyleFromPosition("bottom-left", {
        fontSize: "small",
        weight: "bold",
        align: "left",
        color: accentColor,
        x: 10,
        y: 88,
        layerOrder: 1,
      }),
      callToAction: { hidden: true },
    },
    "before-after-testimony": {
      title: layerStyleFromPosition("center", {
        fontSize: "hero",
        fontScale: baseScale * 1.1,
        weight: "bold",
        align: "center",
        color: textColor,
        shadowStrength: 0.45,
        y: 44,
        layerOrder: 4,
      }),
      overlay: { hidden: true },
      caption: { hidden: true },
      scripture: layerStyleFromPosition("bottom-center", {
        fontSize: "small",
        weight: "bold",
        align: "center",
        color: accentColor,
        y: 82,
        layerOrder: 1,
      }),
      callToAction: { hidden: true },
    },
    "photo-collage": {
      title: layerStyleFromPosition("bottom-center", {
        fontSize: "medium",
        weight: "bold",
        align: "center",
        color: textColor,
        y: 84,
        shadowStrength: 0.35,
        layerOrder: 2,
      }),
      overlay: { hidden: true },
      caption: { hidden: true },
      scripture: { hidden: true },
      callToAction: { hidden: true },
    },
    "video-photo-mixed": {
      title: layerStyleFromPosition("bottom-left", {
        fontSize: "large",
        fontScale: baseScale * 1.05,
        weight: "bold",
        align: "left",
        color: textColor,
        y: 70,
        shadowStrength: 0.5,
        layerOrder: 3,
      }),
      overlay: { hidden: true },
      caption: layerStyleFromPosition("bottom-left", {
        fontSize: "small",
        weight: "regular",
        align: "left",
        color: textColor,
        opacity: 0.9,
        y: 84,
        layerOrder: 2,
      }),
      scripture: { hidden: true },
      callToAction: { hidden: true },
    },
    "text-over-image-testimony": {
      title: layerStyleFromPosition("top-center", {
        fontSize: "large",
        fontScale: baseScale,
        weight: "bold",
        align: "center",
        color: textColor,
        shadowStrength: 0.35,
        y: 18,
        layerOrder: 4,
      }),
      overlay: layerStyleFromPosition("center", {
        fontSize: "medium",
        weight: "regular",
        align: "center",
        color: textColor,
        lineHeight: 1.35,
        layerOrder: 3,
      }),
      caption: layerStyleFromPosition("bottom-center", {
        fontSize: "small",
        weight: "regular",
        align: "center",
        color: textColor,
        opacity: 0.9,
        y: 78,
        layerOrder: 2,
      }),
      scripture: layerStyleFromPosition("bottom-left", {
        fontSize: "small",
        weight: "bold",
        align: "left",
        color: accentColor,
        y: 90,
        layerOrder: 1,
      }),
      callToAction: { hidden: true },
    },
  };

  const personality =
    personalities[layout] ?? personalities["text-over-image-testimony"];

  return Object.fromEntries(
    creatorStudioTextLayers.map((entry) => {
      const fallback = layerStyleFromPosition(entry.defaultPosition, {
        fontSize: design.textStyle?.fontSize ?? "large",
        fontScale: baseScale,
        weight: design.textStyle?.weight ?? "bold",
        italic: design.textStyle?.italic ?? false,
        align: design.textStyle?.align ?? "left",
        color: textColor,
      });

      return [
        entry.value,
        withFontPreset(
          design,
          entry.value,
          personality?.[entry.value] ?? fallback
        ),
      ];
    })
  ) as NonNullable<CreatorStudioDesign["layerStyles"]>;
}

export function getCreatorStudioLayerStyle(
  design: CreatorStudioDesign,
  layer: CreatorStudioTextLayer
): CreatorStudioLayerStyle {
  const layerDefault = creatorStudioTextLayers.find(
    (entry) => entry.value === layer
  );

  return {
    fontSize: design.textStyle?.fontSize ?? "large",
    fontScale: design.textStyle?.fontScale ?? 1,
    weight: design.textStyle?.weight ?? "bold",
    italic: design.textStyle?.italic ?? false,
    align: design.textStyle?.align ?? "left",
    color: design.textStyle?.color ?? "#FFFFFF",
    position: layerDefault?.defaultPosition ?? "center",
    ...design.layerStyles?.[layer],
  };
}

export function getCreatorStudioLayerText(
  design: CreatorStudioDesign,
  layer: CreatorStudioTextLayer
): string {
  switch (layer) {
    case "title":
      return design.title;
    case "overlay":
      return design.overlayText;
    case "caption":
      return design.caption;
    case "scripture":
      return design.scriptureSuggestion ?? "";
    case "callToAction":
      return design.callToAction ?? "";
  }
}

export function buildCreatorStudioLayerTextUpdate(
  layer: CreatorStudioTextLayer,
  value: string
): Partial<CreatorStudioDesign> {
  switch (layer) {
    case "title":
      return { title: value };
    case "overlay":
      return { overlayText: value };
    case "caption":
      return { caption: value };
    case "scripture":
      return { scriptureSuggestion: value };
    case "callToAction":
      return { callToAction: value };
  }
}

export function buildCreatorStudioLayerStyleUpdate(
  design: CreatorStudioDesign,
  layer: CreatorStudioTextLayer,
  updates: Partial<CreatorStudioLayerStyle>
): Partial<CreatorStudioDesign> {
  return {
    layerStyles: {
      ...design.layerStyles,
      [layer]: {
        ...getCreatorStudioLayerStyle(design, layer),
        ...updates,
      },
    },
  };
}

export type CreatorStudioTool =
  | "templates"
  | "ai"
  | "filters"
  | "text"
  | "fonts"
  | "colors"
  | "scripture"
  | "layout"
  | "publish";

export const creatorStudioTopCarousel: {
  value: CreatorStudioTool;
  label: string;
}[] = [
  { value: "templates", label: "Templates" },
  { value: "ai", label: "AI" },
  { value: "filters", label: "Filters" },
  { value: "text", label: "Text" },
  { value: "scripture", label: "Scripture" },
  { value: "layout", label: "Layouts" },
];

export const creatorStudioBottomToolbar: {
  value: CreatorStudioTool;
  label: string;
}[] = [
  { value: "text", label: "Text" },
  { value: "fonts", label: "Fonts" },
  { value: "colors", label: "Colors" },
  { value: "ai", label: "AI" },
  { value: "scripture", label: "Scripture" },
  { value: "filters", label: "Filters" },
  { value: "layout", label: "Layout" },
  { value: "publish", label: "Publish" },
];

export const creatorStudioQuickActions = [
  "More Like This",
  "Surprise Me",
  "Change Style",
  "Rewrite Text",
  "Different Scripture",
  "New Background",
] as const;

export type CreatorStudioPath = CreatorStudioDesign["studioPath"];
export type CreatorStudioSourceMode = CreatorStudioDesign["sourceMode"];
export type CreatorStudioLayoutType = CreatorStudioDesign["layoutType"];
export type CreatorStudioImageAction =
  | "AI Background"
  | "New Background"
  | "Generate Visual Design";

export type CreatorStudioImageRequest = {
  action: CreatorStudioImageAction;
  prompt: string;
  design: CreatorStudioDesign;
};

export type CreatorStudioImageResult = {
  imageUrl: string;
  imagePath: string;
  bucket: string;
  prompt: string;
};

export type CreatorStudioRequestOptions = {
  studioPath: CreatorStudioPath;
  sourceMode: CreatorStudioSourceMode;
  selectedTemplateId: CreationCenterTemplateId;
  category: string;
  topic: string;
  mood: string;
  layoutType: CreatorStudioLayoutType;
};

export const creatorStudioPathOptions: {
  value: CreatorStudioPath;
  title: string;
  description: string;
}[] = [
  {
    value: "tell-story",
    title: "Tell My Story",
    description: "Shape a testimony, prayer, or praise moment from your words.",
  },
  {
    value: "create-design",
    title: "Create a Design",
    description: "Build a polished HTBF graphic from a prompt or media.",
  },
  {
    value: "scripture-post",
    title: "Scripture Post",
    description: "Create a faith-centered reflection with reference-only guidance.",
  },
  {
    value: "ai-surprise",
    title: "AI Surprise Me",
    description: "Let HTBF create several directions from your idea.",
  },
];

export const creatorStudioCategoryOptions = [
  "Testimony",
  "Prayer Request",
  "Praise Report",
  "Deliverance",
  "Healing",
  "Worship",
  "Teaching",
  "Prophecy",
  "Encouragement",
  "Bible Study",
  "Devotional",
  "Other",
];

export const creatorStudioMoodOptions = [
  "Hopeful and bright",
  "Bold testimony",
  "Calm and prayerful",
  "Worshipful",
  "Devotional",
  "Breakthrough",
  "Warm encouragement",
  "Clean and minimal",
  "Premium cinematic",
];

export const creatorStudioLayoutOptions: {
  value: CreatorStudioDesign["layoutType"];
  label: string;
}[] = [
  { value: "full-image-poster", label: "Full image poster" },
  {
    value: "text-over-image-testimony",
    label: "Text-over-image testimony",
  },
  { value: "split-layout", label: "Split layout" },
  { value: "quote-card", label: "Quote card" },
  { value: "prayer-request-card", label: "Prayer request card" },
  { value: "praise-report-card", label: "Praise report card" },
  { value: "scripture-card", label: "Scripture card" },
  { value: "photo-collage", label: "Photo collage" },
  {
    value: "video-photo-mixed",
    label: "Video + photo mixed",
  },
  {
    value: "before-after-testimony",
    label: "Before/after testimony",
  },
  { value: "timeline-story", label: "Timeline story" },
  { value: "magazine-style", label: "Magazine style" },
  { value: "journal-style", label: "Journal style" },
];

export const creationCenterFormats: {
  value: CreationCenterFormat;
  label: string;
  description: string;
  available: boolean;
}[] = [
  {
    value: "written-story",
    label: "Write",
    description: "Tell the story in your own words.",
    available: true,
  },
  {
    value: "photo",
    label: "Photo",
    description: "Add a photo and share what it means.",
    available: true,
  },
  {
    value: "video",
    label: "Video",
    description: "Use the current HTBF video creator.",
    available: true,
  },
  {
    value: "testimony-card",
    label: "Testimony Card",
    description: "Shape a concise testimony post.",
    available: true,
  },
  {
    value: "prayer-card",
    label: "Prayer Card",
    description: "Share a prayer need with care.",
    available: true,
  },
  {
    value: "encouragement-card",
    label: "Encouragement Card",
    description: "Offer hope to someone who needs it.",
    available: true,
  },
  {
    value: "voice-message",
    label: "Voice Message",
    description: "Voice creation is being prepared.",
    available: false,
  },
];

export const creationCenterStoryTypes: {
  value: CreationCenterStoryType;
  label: string;
}[] = [
  { value: "testimony", label: "Testimony" },
  { value: "praise-report", label: "Praise Report" },
  { value: "prayer", label: "Prayer Request" },
  { value: "deliverance-story", label: "Deliverance" },
  { value: "prophecy", label: "Prophecy" },
  { value: "teaching", label: "Teaching" },
  { value: "worship", label: "Worship Moment" },
  { value: "encouragement", label: "Encouragement" },
];

export const creationCenterStoryTemplates: CreationCenterStoryTemplate[] = [
  {
    id: "none",
    label: "No Template",
    description: "Keep the clean HTBF blue style.",
    imagePath: null,
  },
  {
    id: "scripture-woods",
    label: "Scripture Woods",
    description: "A quiet, reflective scripture setting.",
    imagePath: creationCenterImages.scriptureWoods,
  },
  {
    id: "psalm-praise",
    label: "Psalm Praise",
    description: "A joyful background for praise and worship.",
    imagePath: creationCenterImages.psalmPraise,
  },
  {
    id: "lighthouse-scripture",
    label: "Lighthouse Scripture",
    description: "Guidance, hope, and steady direction.",
    imagePath: creationCenterImages.lighthouseScripture,
  },
  {
    id: "eagle-freedom",
    label: "Eagle Freedom",
    description: "A bold setting for freedom and breakthrough.",
    imagePath: creationCenterImages.eagleSoar,
  },
  {
    id: "breaking-chains-deliverance",
    label: "Breaking Chains",
    description: "A testimony background centered on deliverance.",
    imagePath: creationCenterImages.breakingChainsFreedom,
  },
  {
    id: "be-still-prayer",
    label: "Be Still Prayer",
    description: "A calm setting for prayer and reflection.",
    imagePath: creationCenterImages.beStillPrayer,
  },
  {
    id: "lake-worship",
    label: "Lake Worship",
    description: "A peaceful worship-centered background.",
    imagePath: creationCenterImages.lakeWorship,
  },
  {
    id: "valley-praise",
    label: "Valley Praise",
    description: "Hope and praise through every season.",
    imagePath: creationCenterImages.valleyPraise,
  },
];

export const faithStreamOptions: { value: FaithStream; label: string }[] = [
  { value: "healing", label: "Healing" },
  { value: "deliverance", label: "Deliverance" },
  { value: "prayer-warriors", label: "Prayer Warriors" },
  { value: "worship", label: "Worship" },
  { value: "teachings", label: "Teachings" },
  { value: "prophecy", label: "Prophecy" },
  { value: "encouragement", label: "Encouragement" },
  { value: "marriage", label: "Marriage" },
  { value: "veterans", label: "Veterans" },
  { value: "missions", label: "Missions" },
  { value: "salvation", label: "Salvation" },
  { value: "freedom", label: "Freedom" },
  { value: "scripture", label: "Scripture" },
  { value: "revival", label: "Revival" },
];

export const FAITH_STREAM_VALUES = faithStreamOptions.map(
  (option) => option.value
) as FaithStream[];

export const creationCenterPrompts: Record<
  CreationCenterStoryType,
  CreationCenterPrompt[]
> = {
  testimony: [
    {
      id: "before",
      label: "What was life like before?",
      placeholder: "Share only what feels helpful...",
    },
    {
      id: "god-did",
      label: "What did God do?",
      placeholder: "Describe the moment, process, or breakthrough...",
    },
    {
      id: "changed",
      label: "What changed?",
      placeholder: "What is different now?",
    },
    {
      id: "encouragement",
      label: "What would you say to someone walking through this?",
      placeholder: "Leave them with hope...",
    },
  ],
  prayer: [
    {
      id: "request",
      label: "What are you praying for?",
      placeholder: "Share the prayer need...",
    },
    {
      id: "who",
      label: "Who is this prayer for?",
      placeholder: "You can keep names private...",
    },
    {
      id: "breakthrough",
      label: "What breakthrough are you believing for?",
      placeholder: "Share what you are asking God to do...",
    },
  ],
  prophecy: [
    {
      id: "word",
      label: "What word or encouragement are you sharing?",
      placeholder: "Write what was placed on your heart...",
    },
    {
      id: "audience",
      label: "Who is this meant to encourage?",
      placeholder: "Describe the people or situation...",
    },
    {
      id: "context",
      label: "What discernment or context should accompany it?",
      placeholder: "Add humble, helpful context...",
    },
  ],
  teaching: [
    {
      id: "topic",
      label: "What are you teaching or reflecting on?",
      placeholder: "Name the central idea...",
    },
    {
      id: "takeaway",
      label: "What is the main takeaway?",
      placeholder: "What should someone remember?",
    },
    {
      id: "reference",
      label: "What scripture reference supports it?",
      placeholder: "Add references rather than full passages...",
    },
  ],
  worship: [
    {
      id: "moment",
      label: "What worship moment are you sharing?",
      placeholder: "Describe what happened...",
    },
    {
      id: "heart",
      label: "What did God place on your heart?",
      placeholder: "Share the reflection...",
    },
    {
      id: "reflection",
      label: "What should others pause and reflect on?",
      placeholder: "Invite the community into the moment...",
    },
  ],
  encouragement: [
    {
      id: "message",
      label: "What encouragement are you sharing?",
      placeholder: "Write the heart of the message...",
    },
    {
      id: "for-who",
      label: "Who needs to hear this?",
      placeholder: "Think about the person reading it...",
    },
    {
      id: "hope",
      label: "What hope should they hold onto?",
      placeholder: "Leave them with something steady...",
    },
  ],
  "praise-report": [
    {
      id: "praise",
      label: "What are you praising God for?",
      placeholder: "Share the good news...",
    },
    {
      id: "moment",
      label: "What happened?",
      placeholder: "Tell the moment simply...",
    },
    {
      id: "thanks",
      label: "What do you want to thank Him for?",
      placeholder: "Name what is on your heart...",
    },
  ],
  "deliverance-story": [
    {
      id: "bondage",
      label: "What did God bring you out of?",
      placeholder: "Share with the level of detail that feels right...",
    },
    {
      id: "freedom",
      label: "How did freedom come?",
      placeholder: "Describe the journey or breakthrough...",
    },
    {
      id: "now",
      label: "What is different now?",
      placeholder: "Share the change...",
    },
    {
      id: "hope",
      label: "What hope would you give someone else?",
      placeholder: "Speak to someone still waiting...",
    },
  ],
};

export function getCreationCenterFormat(
  value: CreationCenterFormat
) {
  return creationCenterFormats.find((option) => option.value === value);
}

export function isFaithStream(value: unknown): value is FaithStream {
  return (
    typeof value === "string" &&
    FAITH_STREAM_VALUES.includes(value as FaithStream)
  );
}

export function sanitizeFaithStreams(
  values: unknown,
  limit = MAX_FAITH_STREAMS
): FaithStream[] {
  if (!Array.isArray(values)) return [];

  return Array.from(new Set(values.filter(isFaithStream))).slice(0, limit);
}

export function getCreationCenterTemplate(
  templateId: CreationCenterTemplateId
) {
  return creationCenterStoryTemplates.find(
    (template) => template.id === templateId
  );
}
