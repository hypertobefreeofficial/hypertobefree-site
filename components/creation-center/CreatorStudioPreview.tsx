"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  getCreationCenterTemplate,
  getCreatorStudioLayerStyle,
  type CreationCenterTemplateId,
  type CreatorStudioDesign,
  type CreatorStudioLayerPosition,
  type CreatorStudioLayoutType,
  type CreatorStudioTextLayer,
} from "../../lib/creationCenter";
import HTBFWatermark from "./HTBFWatermark";

type CreatorStudioPreviewVariant =
  | "preview"
  | "feed"
  | "detail"
  | "publish";

type CreatorStudioPreviewVariant =
  | "preview"
  | "feed"
  | "detail"
  | "publish";

type CreatorStudioPreviewProps = {
  design?: CreatorStudioDesign | null;
  layoutType?: CreatorStudioLayoutType;
  title?: string;
  overlayText?: string;
  caption?: string;
  category?: string;
  topic?: string;
  mood?: string;
  templateId?: CreationCenterTemplateId;
  videoPreviewUrl?: string | null;
  photoPreviewUrl?: string | null;
  compact?: boolean;
  gallery?: boolean;
  canvas?: boolean;
  variant?: CreatorStudioPreviewVariant;
  selectedTextLayer?: CreatorStudioTextLayer | null;
  onSelectTextLayer?: (layer: CreatorStudioTextLayer) => void;
  interactive?: boolean;
};

function cleanText(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

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

function MediaLayer({
  templateId,
  photoPreviewUrl,
  videoPreviewUrl,
  generatedImageUrl,
}: {
  templateId: CreationCenterTemplateId;
  photoPreviewUrl?: string | null;
  videoPreviewUrl?: string | null;
  generatedImageUrl?: string | null;
}) {
  const template = getCreationCenterTemplate(templateId);

  if (photoPreviewUrl) {
    return (
      <img
        src={photoPreviewUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }

  if (videoPreviewUrl) {
    return (
      <video
        src={videoPreviewUrl}
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }

  if (generatedImageUrl) {
    return (
      <img
        src={generatedImageUrl}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }

  if (template?.imagePath) {
    return (
      <img
        src={template.imagePath}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }

  return (
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#60a5fa,transparent_34%),linear-gradient(135deg,#062a57,#0b63ce_52%,#dbeafe)]" />
  );
}


function PlaceholderTile({ label }: { label: string }) {
  return (
    <div className="flex min-h-[5rem] items-center justify-center rounded-2xl bg-white/15 px-3 text-center text-[10px] font-black uppercase tracking-[0.12em] text-white/80 ring-1 ring-white/20">
      {label}
    </div>
  );
}

function getStyledSizeClass(
  size: NonNullable<CreatorStudioDesign["textStyle"]>["fontSize"] | undefined,
  gallery: boolean
) {
  if (size === "small") return gallery ? "text-lg" : "text-2xl";
  if (size === "medium") return gallery ? "text-2xl" : "text-3xl sm:text-5xl";
  if (size === "large") return gallery ? "text-[2.6rem]" : "text-[clamp(2rem,7vw,5rem)]";
  if (size === "hero") return gallery ? "text-[3rem]" : "text-[clamp(2.5rem,9vw,6rem)]";

  return "";
}

function getPositionClass(
  position:
    | NonNullable<CreatorStudioDesign["textStyle"]>["position"]
    | undefined
) {
  if (position === "top") return "justify-start";
  if (position === "center") return "justify-center";

  return "justify-end";
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
            : part.replace(/([\d.]+)(rem|vw|px)/g, (_m, num: string, unit: string) =>
                `${Math.max(0.75, Number(num) * scale).toFixed(2)}${unit}`
              )
        )
        .join(", ")})`;
    })
    .replace(/text-\[([\d.]+)rem\]/g, (_m, num: string) =>
      `text-[${Math.max(0.75, Number(num) * scale).toFixed(2)}rem]`
    );
}

function getLayerPositionClass(position: CreatorStudioLayerPosition | undefined) {
  switch (position) {
    case "top-left":
      return "left-4 top-4 max-w-[88%]";
    case "top-center":
      return "left-1/2 top-4 max-w-[88%] -translate-x-1/2";
    case "top-right":
      return "right-4 top-4 max-w-[88%]";
    case "center":
      return "left-1/2 top-1/2 max-w-[88%] -translate-x-1/2 -translate-y-1/2";
    case "bottom-left":
      return "left-4 bottom-4 max-w-[88%]";
    case "bottom-center":
      return "left-1/2 bottom-4 max-w-[88%] -translate-x-1/2";
    case "bottom-right":
      return "right-4 bottom-4 max-w-[88%]";
    default:
      return "left-4 top-4 max-w-[88%]";
  }
}

function buildLayerTypography(
  design: CreatorStudioDesign,
  layer: CreatorStudioTextLayer,
  gallery: boolean,
  isFeed: boolean
) {
  const layerStyle = getCreatorStudioLayerStyle(design, layer);
  const fontScale = layerStyle.fontScale ?? 1;
  const styledSizeClass = scaleFontSize(
    getStyledSizeClass(layerStyle.fontSize, gallery || isFeed),
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

  return {
    layerStyle,
    styledSizeClass,
    weightClass,
    italicClass,
    alignClass,
    inlineStyle: {
      color:
        layerStyle.color ||
        getPaletteColor(design.colorPalette, 1, "#FFFFFF"),
      textAlign: layerStyle.align,
    } as CSSProperties,
  };
}

function SelectableLayer({
  layer,
  selectedTextLayer,
  interactive,
  onSelectTextLayer,
  className = "",
  children,
}: {
  layer: CreatorStudioTextLayer;
  selectedTextLayer?: CreatorStudioTextLayer | null;
  interactive?: boolean;
  onSelectTextLayer?: (layer: CreatorStudioTextLayer) => void;
  className?: string;
  children: ReactNode;
}) {
  const selected = selectedTextLayer === layer;

  if (!interactive || !onSelectTextLayer) {
    return <div className={className}>{children}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onSelectTextLayer(layer)}
      className={`rounded-xl text-left transition ${className} ${
        selected
          ? "ring-2 ring-[#0b63ce] ring-offset-2 ring-offset-[#031d3d]/40"
          : "hover:ring-1 hover:ring-white/50"
      }`}
    >
      {selected && (
        <span className="mb-1 inline-flex rounded bg-[#0b63ce] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-white">
          {layer === "callToAction" ? "CTA" : layer}
        </span>
      )}
      {children}
    </button>
  );
}

export default function CreatorStudioPreview({
  design,
  layoutType,
  title,
  overlayText,
  caption,
  category,
  topic,
  mood,
  templateId,
  videoPreviewUrl,
  photoPreviewUrl,
  compact = false,
  gallery = false,
  canvas = false,
  variant = "preview",
  selectedTextLayer = null,
  onSelectTextLayer,
  interactive = false,
}: CreatorStudioPreviewProps) {
  const activeLayout =
    design?.layoutType ?? layoutType ?? "text-over-image-testimony";
  const activeTemplateId =
    design?.templateId ?? templateId ?? "scripture-woods";
  const activeGeneratedImageUrl = design?.generatedImageUrl ?? null;
  const activeTitle = cleanText(design?.title ?? title, "God Is Moving");
  const activeOverlay = cleanText(
    design?.overlayText ?? overlayText,
    activeTitle
  );
  const activeCaption = cleanText(
    design?.caption ?? caption,
    "Tell the story of what God is doing."
  );
  const activeScripture = cleanText(design?.scriptureSuggestion, "");
  const activeCallToAction = cleanText(design?.callToAction, "");
  const activeTextStyle = design?.textStyle ?? {};
  const fontScale = activeTextStyle.fontScale ?? 1;
  const activeBackgroundColor = getPaletteColor(
    design?.colorPalette,
    0,
    "#062a57"
  );
  const activeAccentColor = getPaletteColor(design?.colorPalette, 2, "#D4AF37");
  const isFeed = variant === "feed";
  const isPublish = variant === "publish" || variant === "detail";
  const frameHeight = gallery
    ? "aspect-[9/16] min-h-0"
    : isFeed
      ? "min-h-[22rem] sm:min-h-[26rem]"
      : canvas
        ? "min-h-[min(72dvh,44rem)] sm:min-h-[40rem] lg:min-h-[44rem]"
        : compact
          ? "min-h-[13.5rem]"
          : isPublish
            ? "min-h-[min(68dvh,42rem)]"
            : "min-h-[24rem] sm:min-h-[30rem] lg:min-h-[34rem]";

  const baseShell =
    "relative isolate w-full max-w-full min-w-0 overflow-hidden rounded-[1.75rem] text-white shadow-xl shadow-blue-950/10 ring-1 ring-blue-100";
  const innerPadding = gallery ? "p-4" : compact ? "p-4" : "p-5 sm:p-8";
  const contentFrame = gallery ? "h-full" : frameHeight;
  const smallTitleClass = gallery
    ? "text-xl"
    : "text-2xl font-black leading-none sm:text-3xl";
  const heroTitleClass = gallery
    ? "text-[2.35rem]"
    : "text-[clamp(2rem,9vw,4.5rem)]";
  const magazineTitleClass = gallery
    ? "text-[2.65rem]"
    : "text-[clamp(1.9rem,9vw,5rem)]";
  const splitTitleClass = gallery
    ? "text-2xl"
    : "text-[clamp(1.35rem,6vw,4rem)]";
  const bodyTextClass = gallery
    ? "text-xs leading-5"
    : "text-sm leading-6 sm:text-base";
  const styledTitleSizeClass = scaleFontSize(
    getStyledSizeClass(activeTextStyle.fontSize, gallery || isFeed),
    fontScale
  );
  const textWeightClass =
    activeTextStyle.weight === "regular" ? "font-semibold" : "font-black";
  const textItalicClass = activeTextStyle.italic ? "italic" : "";
  const textAlignClass =
    activeTextStyle.align === "center"
      ? "text-center"
      : activeTextStyle.align === "right"
        ? "text-right"
        : "text-left";
  const textPositionClass = getPositionClass(activeTextStyle.position);
  const styledTitleStyle: CSSProperties = {
    color:
      activeTextStyle.color ||
      getPaletteColor(design?.colorPalette, 1, "#FFFFFF"),
    textAlign: activeTextStyle.align,
  };
  const shellStyle: CSSProperties = {
    backgroundColor: activeBackgroundColor,
  };
  const accentStyle: CSSProperties = {
    backgroundColor: activeAccentColor,
  };

  if (activeLayout === "split-layout") {
    return (
      <div className={`${baseShell} ${frameHeight}`} style={shellStyle}>
        <div className="absolute inset-0 grid grid-cols-2">
          <div className="relative overflow-hidden">
            <MediaLayer
              templateId={activeTemplateId}
              photoPreviewUrl={photoPreviewUrl}
              videoPreviewUrl={videoPreviewUrl}
              generatedImageUrl={activeGeneratedImageUrl}
            />
          </div>
          <div className="bg-gradient-to-br from-[#031d3d] via-[#062a57] to-[#0b63ce]" />
        </div>
        <div className="absolute inset-0 bg-black/10" />
        <HTBFWatermark />
        <div className={`relative z-10 ml-auto flex ${contentFrame} w-1/2 min-w-0 flex-col justify-center ${innerPadding}`}>
          <h4
            style={styledTitleStyle}
            className={`mt-3 max-w-full break-words leading-none ${textWeightClass} ${textItalicClass} ${textAlignClass} ${styledTitleSizeClass || splitTitleClass}`}
          >
            {activeTitle}
          </h4>
          <p className={`mt-4 max-w-full break-words font-semibold text-blue-50 ${bodyTextClass}`}>
            {activeCaption}
          </p>
        </div>
      </div>
    );
  }

  if (activeLayout === "photo-collage") {
    return (
      <div className={`${baseShell} ${frameHeight} ${innerPadding}`} style={shellStyle}>
        <MediaLayer
          templateId={activeTemplateId}
          photoPreviewUrl={photoPreviewUrl}
          videoPreviewUrl={videoPreviewUrl}
          generatedImageUrl={activeGeneratedImageUrl}
        />
        <div className="absolute inset-0 bg-[#031d3d]/55" />
        <HTBFWatermark />
        <div className="relative z-10 grid h-full gap-3">
          <div>
            <h4
              style={styledTitleStyle}
              className={`mt-2 max-w-full break-words leading-none ${textWeightClass} ${textItalicClass} ${textAlignClass} ${styledTitleSizeClass || smallTitleClass}`}
            >
              {activeTitle}
            </h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <PlaceholderTile label="Photo 1" />
            <PlaceholderTile label="Photo 2" />
            <PlaceholderTile label="Photo 3" />
            <PlaceholderTile label="Photo 4" />
          </div>
          <p className={`font-semibold text-blue-50 ${bodyTextClass}`}>
            {activeCaption}
          </p>
        </div>
      </div>
    );
  }

  if (activeLayout === "video-photo-mixed") {
    return (
      <div className={`${baseShell} ${frameHeight} ${innerPadding}`} style={shellStyle}>
        <MediaLayer
          templateId={activeTemplateId}
          photoPreviewUrl={photoPreviewUrl}
          generatedImageUrl={activeGeneratedImageUrl}
        />
        <div className="absolute inset-0 bg-[#031d3d]/60" />
        <HTBFWatermark />
        <div className="relative z-10 flex h-full flex-col justify-between gap-4">
          <div>
            <h4
              style={styledTitleStyle}
              className={`mt-2 max-w-full break-words leading-none ${textWeightClass} ${textItalicClass} ${textAlignClass} ${styledTitleSizeClass || smallTitleClass}`}
            >
              {activeTitle}
            </h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1.35fr_0.85fr]">
            <div className="relative min-h-[11rem] overflow-hidden rounded-3xl bg-black ring-1 ring-white/20">
              {videoPreviewUrl ? (
                <video
                  src={videoPreviewUrl}
                  muted
                  playsInline
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <PlaceholderTile label="Video area" />
              )}
            </div>
            <div className="relative min-h-[11rem] overflow-hidden rounded-3xl bg-white/10 ring-1 ring-white/20">
              {photoPreviewUrl ? (
                <img
                  src={photoPreviewUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <PlaceholderTile label="Photo area" />
              )}
            </div>
          </div>
          <p className={`font-semibold text-blue-50 ${bodyTextClass}`}>
            {activeCaption}
          </p>
        </div>
      </div>
    );
  }

  if (activeLayout === "before-after-testimony") {
    return (
      <div className={`${baseShell} ${frameHeight} ${innerPadding}`} style={shellStyle}>
        <MediaLayer
          templateId={activeTemplateId}
          photoPreviewUrl={photoPreviewUrl}
          videoPreviewUrl={videoPreviewUrl}
          generatedImageUrl={activeGeneratedImageUrl}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#031d3d]/90 via-[#062a57]/45 to-[#0b63ce]/20" />
        <HTBFWatermark />
        <div className="relative z-10 flex h-full flex-col justify-between gap-4">
          <h4
            style={styledTitleStyle}
            className={`max-w-full break-words leading-none ${textWeightClass} ${textItalicClass} ${textAlignClass} ${styledTitleSizeClass || smallTitleClass}`}
          >
            {activeTitle}
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl bg-white/12 p-4 ring-1 ring-white/20">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-100">
                Before
              </p>
              <p className={`mt-3 font-semibold text-blue-50 ${bodyTextClass}`}>
                What life felt like before the breakthrough.
              </p>
            </div>
            <div className="rounded-3xl bg-white/18 p-4 ring-1 ring-white/25">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-100">
                After
              </p>
              <p className={`mt-3 font-semibold text-blue-50 ${bodyTextClass}`}>
                {activeOverlay}
              </p>
            </div>
          </div>
          <p className={`font-semibold text-blue-50 ${bodyTextClass}`}>
            {activeCaption}
          </p>
        </div>
      </div>
    );
  }

  if (activeLayout === "timeline-story") {
    return (
      <div className={`${baseShell} ${frameHeight} ${innerPadding}`} style={shellStyle}>
        <MediaLayer
          templateId={activeTemplateId}
          photoPreviewUrl={photoPreviewUrl}
          videoPreviewUrl={videoPreviewUrl}
          generatedImageUrl={activeGeneratedImageUrl}
        />
        <div className="absolute inset-0 bg-[#031d3d]/70" />
        <HTBFWatermark />
        <div className="relative z-10 flex h-full flex-col justify-between">
          <div>
            <h4
              style={styledTitleStyle}
              className={`max-w-full break-words leading-none ${textWeightClass} ${textItalicClass} ${textAlignClass} ${styledTitleSizeClass || smallTitleClass}`}
            >
              {activeTitle}
            </h4>
          </div>
          <div className="space-y-3">
            {["Before", "What God did", "Now"].map((label, index) => (
              <div key={label} className="flex gap-3">
                <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-[#0b63ce]">
                  {index + 1}
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-blue-100">
                    {label}
                  </p>
                  <p className={`mt-1 font-semibold text-blue-50 ${bodyTextClass}`}>
                    {index === 1 ? activeOverlay : activeCaption}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (activeLayout === "magazine-style") {
    return (
      <div className={`${baseShell} ${frameHeight}`} style={shellStyle}>
        <MediaLayer
          templateId={activeTemplateId}
          photoPreviewUrl={photoPreviewUrl}
          videoPreviewUrl={videoPreviewUrl}
          generatedImageUrl={activeGeneratedImageUrl}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#031d3d]/90 via-[#062a57]/35 to-transparent" />
        <HTBFWatermark />
        <div className={`relative z-10 grid ${contentFrame} grid-rows-[1fr_auto] ${innerPadding}`}>
          <div className="flex flex-col justify-center">
            <h4
              style={styledTitleStyle}
              className={`max-w-full break-words leading-[0.9] ${textWeightClass} ${textItalicClass} ${textAlignClass} ${styledTitleSizeClass || magazineTitleClass}`}
            >
              {activeTitle}
            </h4>
          </div>
          <p className={`max-w-lg font-semibold text-blue-50 ${bodyTextClass}`}>
            {activeCaption}
          </p>
        </div>
      </div>
    );
  }

  if (activeLayout === "journal-style") {
    return (
      <div className={`${baseShell} ${frameHeight} bg-blue-50 ${innerPadding}`} style={shellStyle}>
        <MediaLayer
          templateId={activeTemplateId}
          photoPreviewUrl={photoPreviewUrl}
          videoPreviewUrl={videoPreviewUrl}
          generatedImageUrl={activeGeneratedImageUrl}
        />
        <div className="absolute inset-0 bg-white/78" />
        <HTBFWatermark />
        <div className="relative z-10 flex h-full flex-col justify-center rounded-[1.5rem] border border-[#0b63ce]/15 bg-white/80 p-5 text-[#062a57] shadow-lg shadow-blue-950/10">
          <h4
            style={styledTitleStyle}
            className={`max-w-full break-words leading-none ${textWeightClass} ${textItalicClass} ${textAlignClass} ${styledTitleSizeClass || (gallery ? "text-2xl" : "text-3xl sm:text-4xl")}`}
          >
            {activeTitle}
          </h4>
          <p className={`mt-5 whitespace-pre-wrap font-semibold ${gallery ? "text-xs leading-5" : "text-base leading-7"}`}>
            {activeCaption}
          </p>
        </div>
      </div>
    );
  }

  const isQuote =
    activeLayout === "quote-card" ||
    activeLayout === "scripture-card" ||
    activeLayout === "prayer-request-card" ||
    activeLayout === "praise-report-card";

  return (
    <div className={`${baseShell} ${frameHeight} ${innerPadding}`} style={shellStyle}>
      <MediaLayer
        templateId={activeTemplateId}
        photoPreviewUrl={photoPreviewUrl}
        videoPreviewUrl={videoPreviewUrl}
        generatedImageUrl={activeGeneratedImageUrl}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#031d3d]/88 via-[#062a57]/35 to-transparent" />
      <HTBFWatermark />
      <div className={`relative z-10 flex h-full flex-col ${textPositionClass}`}>
        <div className={isQuote ? "mx-auto max-w-xl text-center" : "max-w-xl"}>
          <SelectableLayer
            layer="title"
            selectedTextLayer={selectedTextLayer}
            interactive={interactive}
            onSelectTextLayer={onSelectTextLayer}
            className="block w-full px-1 py-1"
          >
            <h4
              style={styledTitleStyle}
              className={`whitespace-pre-wrap break-words leading-none drop-shadow-sm ${textWeightClass} ${textItalicClass} ${textAlignClass} ${styledTitleSizeClass || heroTitleClass}`}
            >
              {activeLayout === "full-image-poster" ? activeTitle : activeOverlay}
            </h4>
          </SelectableLayer>
          {activeLayout !== "full-image-poster" && activeTitle !== activeOverlay && (
            <SelectableLayer
              layer="overlay"
              selectedTextLayer={selectedTextLayer}
              interactive={interactive}
              onSelectTextLayer={onSelectTextLayer}
              className="mt-3 block w-full px-1 py-1"
            >
              <p className={`font-black text-blue-50 ${bodyTextClass}`}>
                {activeTitle}
              </p>
            </SelectableLayer>
          )}
          <SelectableLayer
            layer="caption"
            selectedTextLayer={selectedTextLayer}
            interactive={interactive}
            onSelectTextLayer={onSelectTextLayer}
            className="mt-4 block w-full px-1 py-1"
          >
            <p className={`whitespace-pre-wrap break-words font-semibold text-blue-50 ${bodyTextClass}`}>
              {activeCaption}
            </p>
          </SelectableLayer>
          {activeScripture && (
            <SelectableLayer
              layer="scripture"
              selectedTextLayer={selectedTextLayer}
              interactive={interactive}
              onSelectTextLayer={onSelectTextLayer}
              className="mt-4 block w-full px-1 py-1"
            >
              <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-100">
                {activeScripture}
              </p>
            </SelectableLayer>
          )}
          {activeCallToAction && (
            <SelectableLayer
              layer="callToAction"
              selectedTextLayer={selectedTextLayer}
              interactive={interactive}
              onSelectTextLayer={onSelectTextLayer}
              className="mt-4 inline-block px-1 py-1"
            >
              <span
                className="inline-flex rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-[#0B1D3A]"
                style={accentStyle}
              >
                {activeCallToAction}
              </span>
            </SelectableLayer>
          )}
        </div>
      </div>
    </div>
  );
}
