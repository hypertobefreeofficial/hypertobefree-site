import {
  getCreationCenterTemplate,
  prepareCreatorStudioForEditing,
  type CreationCenterTemplateId,
  type CreatorStudioDesign,
  type CreatorStudioLayerStyle,
  type CreatorStudioLayoutType,
  type CreatorStudioTextLayer,
} from "./creationCenter";
import { normalizeCreatorStudioFontPreset } from "./creatorStudioTypography";
import { resolveCreatorStudioDesignForRender } from "./creatorStudioRenderPipeline";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown, limit = 8) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

const layoutTypes: CreatorStudioLayoutType[] = [
  "full-image-poster",
  "text-over-image-testimony",
  "split-layout",
  "quote-card",
  "prayer-request-card",
  "praise-report-card",
  "scripture-card",
  "photo-collage",
  "video-photo-mixed",
  "before-after-testimony",
  "timeline-story",
  "magazine-style",
  "journal-style",
];

function readLayoutType(value: unknown): CreatorStudioLayoutType {
  return typeof value === "string" &&
    layoutTypes.includes(value as CreatorStudioLayoutType)
    ? (value as CreatorStudioLayoutType)
    : "text-over-image-testimony";
}

function readTemplateId(value: unknown): CreationCenterTemplateId {
  if (typeof value !== "string") return "none";

  const trimmed = value.trim();
  if (trimmed === "none") return "none";

  const template = getCreationCenterTemplate(trimmed as CreationCenterTemplateId);

  if (template?.id) {
    return template.id;
  }

  return "none";
}

const creatorStudioTextLayerKeys: CreatorStudioTextLayer[] = [
  "title",
  "overlay",
  "caption",
  "scripture",
  "callToAction",
];

function readNumber(value: unknown, fallback?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readLayerStyle(value: unknown): CreatorStudioLayerStyle | null {
  if (!isRecord(value)) return null;

  const fontSize = readString(value.fontSize);
  const weight = readString(value.weight);
  const align = readString(value.align);
  const position = readString(value.position);
  const color = readString(value.color);
  const fontPreset = readString(value.fontPreset);

  return {
    fontSize:
      fontSize === "small" ||
      fontSize === "medium" ||
      fontSize === "large" ||
      fontSize === "hero"
        ? fontSize
        : undefined,
    fontScale: readNumber(value.fontScale),
    fontPreset: getCreatorStudioFontPresetDefinition(fontPreset),
    weight: weight === "regular" || weight === "bold" ? weight : undefined,
    italic: typeof value.italic === "boolean" ? value.italic : undefined,
    align:
      align === "left" || align === "center" || align === "right"
        ? align
        : undefined,
    color: isHexColor(color) ? color : undefined,
    position:
      position === "top-left" ||
      position === "top-center" ||
      position === "top-right" ||
      position === "center" ||
      position === "bottom-left" ||
      position === "bottom-center" ||
      position === "bottom-right"
        ? position
        : undefined,
    x: readNumber(value.x),
    y: readNumber(value.y),
    hidden: typeof value.hidden === "boolean" ? value.hidden : undefined,
    opacity: readNumber(value.opacity),
    letterSpacing: readNumber(value.letterSpacing),
    lineHeight: readNumber(value.lineHeight),
    shadowStrength: readNumber(value.shadowStrength),
    outlineWidth: readNumber(value.outlineWidth),
    rotation: readNumber(value.rotation),
    layerOrder: readNumber(value.layerOrder),
    maxWidth: readNumber(value.maxWidth),
    width: readNumber(value.width),
    textTransform:
      readString(value.textTransform) === "uppercase" ||
      readString(value.textTransform) === "lowercase" ||
      readString(value.textTransform) === "capitalize" ||
      readString(value.textTransform) === "none"
        ? (readString(value.textTransform) as CreatorStudioLayerStyle["textTransform"])
        : undefined,
  };
}

function readCustomTextLayers(value: unknown) {
  if (!Array.isArray(value)) return undefined;

  const layers = value
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const id = readString(entry.id);
      const text = readString(entry.text);
      const style = readLayerStyle(entry.style);
      if (!id || !style) return null;
      return { id, text, style };
    })
    .filter(Boolean);

  return layers.length > 0 ? layers : undefined;
}

function readStickerLayers(value: unknown) {
  if (!Array.isArray(value)) return undefined;

  const layers = value
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const id = readString(entry.id);
      const emoji = readString(entry.emoji);
      const label = readString(entry.label);
      const x = readNumber(entry.x);
      const y = readNumber(entry.y);
      if (!id || !emoji || x === undefined || y === undefined) return null;

      return {
        id,
        emoji,
        label: label || emoji,
        x,
        y,
        scale: readNumber(entry.scale),
        rotation: readNumber(entry.rotation),
        opacity: readNumber(entry.opacity),
        layerOrder: readNumber(entry.layerOrder),
      };
    })
    .filter(Boolean);

  return layers.length > 0 ? layers : undefined;
}

function readLayerStyles(
  value: unknown
): CreatorStudioDesign["layerStyles"] | undefined {
  if (!isRecord(value)) return undefined;

  const layerStyles = Object.fromEntries(
    creatorStudioTextLayerKeys
      .map((layer) => {
        const style = readLayerStyle(value[layer]);
        return style ? [layer, style] : null;
      })
      .filter(
        (
          entry
        ): entry is [CreatorStudioTextLayer, CreatorStudioLayerStyle] =>
          Boolean(entry)
      )
  ) as CreatorStudioDesign["layerStyles"];

  return layerStyles && Object.keys(layerStyles).length > 0
    ? layerStyles
    : undefined;
}

function readTextStyle(
  value: unknown
): NonNullable<CreatorStudioDesign["textStyle"]> {
  const style = isRecord(value) ? value : {};
  const fontSize = readString(style.fontSize);
  const weight = readString(style.weight);
  const align = readString(style.align);
  const position = readString(style.position);
  const color = readString(style.color);
  const fontScaleRaw = style.fontScale;
  const fontScale =
    typeof fontScaleRaw === "number" && Number.isFinite(fontScaleRaw)
      ? Math.min(2.2, Math.max(0.55, fontScaleRaw))
      : undefined;

  return {
    fontSize:
      fontSize === "small" ||
      fontSize === "medium" ||
      fontSize === "large" ||
      fontSize === "hero"
        ? fontSize
        : "large",
    weight: weight === "regular" || weight === "bold" ? weight : "bold",
    italic: typeof style.italic === "boolean" ? style.italic : false,
    align:
      align === "left" || align === "center" || align === "right"
        ? align
        : "left",
    color: isHexColor(color) ? color : "#FFFFFF",
    position:
      position === "top" || position === "center" || position === "bottom"
        ? position
        : "bottom",
    fontScale,
  };
}

export function parseAiSuggestionsRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return isRecord(value) ? value : null;
}

export function serializeCreatorStudioDesignForStorage(
  design: CreatorStudioDesign
): CreatorStudioDesign {
  const prepared =
    design.layerStyles && Object.keys(design.layerStyles).length > 0
      ? design
      : prepareCreatorStudioForEditing(design);

  return JSON.parse(JSON.stringify(prepared)) as CreatorStudioDesign;
}

export function freezeCreatorStudioDesignForPublish(
  design: CreatorStudioDesign,
  selectedDesignId?: string | null
): CreatorStudioDesign {
  const frozen = serializeCreatorStudioDesignForStorage(design);

  return {
    ...frozen,
    id: selectedDesignId?.trim() || frozen.id,
  };
}

export function buildCreatorStudioAiSuggestionsPayload(options: {
  design: CreatorStudioDesign;
  prompts?: Record<string, string>;
  suggestions?: unknown;
  selectedTemplate?: unknown;
}) {
  const creatorStudioDesign = serializeCreatorStudioDesignForStorage(
    options.design
  );

  return {
    prompts: options.prompts ?? {},
    suggestions: options.suggestions ?? null,
    creatorStudioDesign,
    selectedTemplate: options.selectedTemplate ?? null,
    creation_mode: "creator-studio",
  };
}

export function readCreatorStudioDesignRecord(
  value: unknown
): CreatorStudioDesign | null {
  if (!isRecord(value)) return null;

  const title = readString(value.title);
  const overlayText =
    readString(value.overlayText) || readString(value.overlay_text) || title;
  const caption =
    readString(value.caption) || overlayText || title;

  if (!title && !overlayText && !caption) return null;

  const palette = readStringArray(value.colorPalette, 5).filter(isHexColor);

  return {
    id: readString(value.id) || "creator-studio-feed",
    studioPath:
      value.studioPath === "create-design" ||
      value.studioPath === "scripture-post" ||
      value.studioPath === "ai-surprise"
        ? value.studioPath
        : "tell-story",
    sourceMode:
      value.sourceMode === "upload-video" ||
      value.sourceMode === "upload-photo" ||
      value.sourceMode === "start-template"
        ? value.sourceMode
        : "build-ai",
    title: title || overlayText || "God Is Moving",
    overlayText: overlayText || title,
    caption,
    category: readString(value.category) || "Testimony",
    topic: readString(value.topic) || readString(value.category) || "Hope",
    templateId: readTemplateId(value.templateId ?? value.template),
    styleMood: readString(value.styleMood) || readString(value.style_mood) || "Hopeful",
    layoutType: readLayoutType(value.layoutType ?? value.layout_type),
    scriptureSuggestion:
      readString(value.scriptureSuggestion) ||
      readString(value.scripture_suggestion),
    suggestedPostFormat:
      readString(value.suggestedPostFormat) ||
      readString(value.suggested_post_format) ||
      "HTBF design post",
    colorPalette: palette.length > 0 ? palette : ["#062A57", "#FFFFFF", "#D4AF37"],
    typographyStyle:
      readString(value.typographyStyle) || readString(value.typography_style),
    designTreatment:
      readString(value.designTreatment) || readString(value.design_treatment),
    callToAction:
      readString(value.callToAction) || readString(value.call_to_action),
    typographyPairing:
      readString(value.typographyPairing) ||
      readString(value.typography_pairing),
    fontHierarchy:
      readString(value.fontHierarchy) || readString(value.font_hierarchy),
    backgroundTreatment:
      readString(value.backgroundTreatment) ||
      readString(value.background_treatment),
    layoutComposition:
      readString(value.layoutComposition) ||
      readString(value.layout_composition),
    overlayStyle:
      readString(value.overlayStyle) || readString(value.overlay_style),
    decorativeElements:
      readString(value.decorativeElements) ||
      readString(value.decorative_elements),
    visualTheme:
      readString(value.visualTheme) || readString(value.visual_theme),
    filterRecommendation:
      readString(value.filterRecommendation) ||
      readString(value.filter_recommendation),
    cropRecommendation:
      readString(value.cropRecommendation) ||
      readString(value.crop_recommendation),
    generatedImageUrl:
      readString(value.generatedImageUrl) ||
      readString(value.generated_image_url),
    generatedImagePath:
      readString(value.generatedImagePath) ||
      readString(value.generated_image_path),
    generatedImageBucket:
      readString(value.generatedImageBucket) ||
      readString(value.generated_image_bucket),
    imageGenerationPrompt:
      readString(value.imageGenerationPrompt) ||
      readString(value.image_generation_prompt),
    alternateTitles: readStringArray(value.alternateTitles, 4),
    alternateCaptions: readStringArray(value.alternateCaptions, 4),
    hashtags: readStringArray(value.hashtags, 8),
    conceptReason:
      readString(value.conceptReason) || readString(value.concept_reason),
    textStyle: readTextStyle(value.textStyle ?? value.text_style),
    scriptureText: readString(value.scriptureText) || readString(value.scripture_text),
    layerStyles: readLayerStyles(value.layerStyles ?? value.layer_styles),
    customTextLayers: readCustomTextLayers(
      value.customTextLayers ?? value.custom_text_layers
    ),
    stickerLayers: readStickerLayers(value.stickerLayers ?? value.sticker_layers),
  };
}

export function readCreatorStudioDesignFromSuggestions(
  value: unknown
): CreatorStudioDesign | null {
  const metadata = parseAiSuggestionsRecord(value);
  if (!metadata) return null;

  return readCreatorStudioDesignRecord(metadata.creatorStudioDesign);
}

export function readCreationModeFromSuggestions(value: unknown) {
  const metadata = parseAiSuggestionsRecord(value);

  return (
    readString(metadata?.creation_mode) || readString(metadata?.creationMode)
  );
}

export function isCreatorStudioFeedPost({
  aiSuggestions,
  creationMode,
}: {
  aiSuggestions: unknown;
  creationMode?: string | null;
  hasVideoMedia?: boolean;
  hasImageMedia?: boolean;
}) {
  const design = readCreatorStudioDesignFromSuggestions(aiSuggestions);
  if (!design) return false;

  const mode =
    readString(creationMode) ||
    readCreationModeFromSuggestions(aiSuggestions);

  return mode === "creator-studio" || Boolean(design.layerStyles);
}

export function readStoredCreatorStudioDesignFromStory(story: {
  ai_suggestions: unknown;
  creation_mode?: string | null;
}) {
  const design = readCreatorStudioDesignFromSuggestions(story.ai_suggestions);

  if (
    !design ||
    !isCreatorStudioFeedPost({
      aiSuggestions: story.ai_suggestions,
      creationMode: story.creation_mode,
    })
  ) {
    return null;
  }

  if (design.layerStyles && Object.keys(design.layerStyles).length > 0) {
    return design;
  }

  return resolveCreatorStudioDesignForRender(design);
}

export function verifyCreatorStudioDesignPersisted(
  aiSuggestions: unknown,
  expectedDesign: CreatorStudioDesign
) {
  const stored = readCreatorStudioDesignFromSuggestions(aiSuggestions);

  if (!stored) {
    throw new Error(
      "Creator Studio design JSON was not saved with this post. The published story cannot render overlay layers."
    );
  }

  if (!stored.layerStyles || Object.keys(stored.layerStyles).length === 0) {
    throw new Error(
      "Creator Studio layerStyles were not saved with this post."
    );
  }

  console.log("[CreatorStudio/pipeline] verified persisted design", {
    selectedDesignId: stored.id,
    savedDesignJson: stored,
    title: stored.title,
    overlayText: stored.overlayText,
    caption: stored.caption,
    templateId: stored.templateId,
    layoutType: stored.layoutType,
    layerStyles: stored.layerStyles,
    layerFontPresets: Object.fromEntries(
      Object.entries(stored.layerStyles ?? {}).map(([layer, style]) => [
        layer,
        style.fontPreset ?? null,
      ])
    ),
    textStyle: stored.textStyle,
    expectedLayerCount: Object.keys(expectedDesign.layerStyles ?? {}).length,
    storedLayerCount: Object.keys(stored.layerStyles ?? {}).length,
  });

  return stored;
}

export function resolveCreatorStudioBackgroundUrl(
  design: CreatorStudioDesign
): string | null {
  if (design.generatedImageUrl) {
    return design.generatedImageUrl;
  }

  const template = getCreationCenterTemplate(design.templateId);

  return template?.imagePath ?? null;
}
