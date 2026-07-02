"use client";

import type { CSSProperties } from "react";
import {
  getCreationCenterTemplate,
  getCreatorStudioLayerDisplayText,
  type CreationCenterTemplateId,
  type CreatorStudioDesign,
  type CreatorStudioTextLayer,
} from "../../lib/creationCenter";
import {
  buildCreatorStudioLayerTypography,
  getCreatorStudioAccentColor,
} from "../../lib/creatorStudioCanvasRender";

type CreatorStudioCanvasLayersProps = {
  design: CreatorStudioDesign;
  photoPreviewUrl?: string | null;
  videoPreviewUrl?: string | null;
  compact?: boolean;
  selectedLayer?: CreatorStudioTextLayer | null;
  onSelectLayer?: (layer: CreatorStudioTextLayer) => void;
  interactive?: boolean;
};

function CanvasBackground({
  templateId,
  photoPreviewUrl,
  videoPreviewUrl,
  generatedImageUrl,
  backgroundColor,
}: {
  templateId: CreationCenterTemplateId;
  photoPreviewUrl?: string | null;
  videoPreviewUrl?: string | null;
  generatedImageUrl?: string | null;
  backgroundColor: string;
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
    <div
      className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#60a5fa,transparent_34%),linear-gradient(135deg,#062a57,#0b63ce_52%,#dbeafe)]"
      style={{ backgroundColor }}
    />
  );
}

export default function CreatorStudioCanvasLayers({
  design,
  photoPreviewUrl,
  videoPreviewUrl,
  compact = false,
  selectedLayer = null,
  onSelectLayer,
  interactive = false,
}: CreatorStudioCanvasLayersProps) {
  const accentColor = getCreatorStudioAccentColor(design);
  const backgroundColor = design.colorPalette?.[0]?.trim() || "#062a57";

  function renderLayer(layer: CreatorStudioTextLayer) {
    const typography = buildCreatorStudioLayerTypography(design, layer, compact);
    const text = getCreatorStudioLayerDisplayText(design, layer);

    if (typography.layerStyle.hidden || !text.trim()) {
      if (layer !== "callToAction" && layer !== "scripture") {
        return null;
      }

      if (!text.trim()) {
        return null;
      }
    }

    const positionStyle: CSSProperties = {
      left: `${typography.coordinates.x}%`,
      top: `${typography.coordinates.y}%`,
      transform: typography.transform,
      maxWidth: "min(88%, 22rem)",
    };

    const textClassName = `whitespace-pre-wrap break-words leading-snug ${typography.weightClass} ${typography.italicClass} ${typography.alignClass} ${typography.styledSizeClass}`;
    const selected = selectedLayer === layer;
    const content =
      layer === "callToAction" ? (
        <span
          className={`inline-flex rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] ${typography.alignClass}`}
          style={{
            ...typography.inlineStyle,
            backgroundColor: accentColor,
            color: "#0B1D3A",
          }}
        >
          {text}
        </span>
      ) : layer === "scripture" ? (
        <div
          style={typography.inlineStyle}
          className={`rounded-2xl bg-black/45 px-3 py-2 backdrop-blur-sm ${textClassName}`}
        >
          {text}
        </div>
      ) : layer === "caption" ? (
        <div
          style={typography.inlineStyle}
          className={`rounded-2xl bg-white/10 px-3 py-2 backdrop-blur-sm ${textClassName}`}
        >
          {text}
        </div>
      ) : (
        <div style={typography.inlineStyle} className={textClassName}>
          {text}
        </div>
      );

    if (interactive && onSelectLayer) {
      return (
        <button
          key={layer}
          type="button"
          onClick={() => onSelectLayer(layer)}
          className={`absolute z-10 rounded-xl px-1 py-0.5 text-left ${
            selected
              ? "ring-2 ring-[#0b63ce] ring-offset-2 ring-offset-[#031d3d]/30"
              : ""
          }`}
          style={positionStyle}
        >
          {content}
        </button>
      );
    }

    return (
      <div key={layer} className="absolute z-10" style={positionStyle}>
        {content}
      </div>
    );
  }

  return (
    <>
      <CanvasBackground
        templateId={design.templateId}
        photoPreviewUrl={photoPreviewUrl}
        videoPreviewUrl={videoPreviewUrl}
        generatedImageUrl={design.generatedImageUrl}
        backgroundColor={backgroundColor}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#031d3d]/75 via-[#062a57]/20 to-transparent" />
      <img
        src="/images/htbf-logo.png"
        alt=""
        className="pointer-events-none absolute right-3 top-3 z-20 h-7 w-auto opacity-80 sm:right-4 sm:top-4 sm:h-8"
      />
      <div className="absolute inset-0 z-10">
        {(
          [
            "title",
            "overlay",
            "caption",
            "scripture",
            "callToAction",
          ] as CreatorStudioTextLayer[]
        ).map((layer) => renderLayer(layer))}
      </div>
    </>
  );
}
