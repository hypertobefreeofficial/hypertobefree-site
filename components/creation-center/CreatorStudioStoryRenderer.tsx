"use client";

import type { CSSProperties } from "react";
import {
  getCreationCenterTemplate,
  prepareCreatorStudioForEditing,
  type CreationCenterTemplateId,
  type CreatorStudioDesign,
} from "../../lib/creationCenter";
import CreatorStudioPositionedLayers from "./CreatorStudioPositionedLayers";
import HTBFWatermark from "./HTBFWatermark";

export type CreatorStudioStoryRendererVariant =
  | "preview"
  | "feed"
  | "detail"
  | "publish";

type CreatorStudioStoryRendererProps = {
  design: CreatorStudioDesign;
  photoPreviewUrl?: string | null;
  videoPreviewUrl?: string | null;
  variant?: CreatorStudioStoryRendererVariant;
  compact?: boolean;
};

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

function StoryMediaLayer({
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

function getFrameHeight(
  variant: CreatorStudioStoryRendererVariant,
  compact: boolean
) {
  if (compact) return "min-h-[13.5rem]";
  if (variant === "feed") return "min-h-[22rem] sm:min-h-[26rem]";
  if (variant === "detail") return "min-h-[min(68dvh,42rem)]";
  if (variant === "publish") return "min-h-[min(68dvh,42rem)]";
  return "min-h-[24rem] sm:min-h-[30rem] lg:min-h-[34rem]";
}

export default function CreatorStudioStoryRenderer({
  design,
  photoPreviewUrl,
  videoPreviewUrl,
  variant = "preview",
  compact = false,
}: CreatorStudioStoryRendererProps) {
  const preparedDesign =
    design.layerStyles && Object.keys(design.layerStyles).length > 0
      ? design
      : prepareCreatorStudioForEditing(design);

  if (variant === "feed" || variant === "detail") {
    console.log("[CreatorStudio/pipeline] feed render design JSON", {
      variant,
      selectedDesignId: preparedDesign.id,
      templateId: preparedDesign.templateId,
      layoutType: preparedDesign.layoutType,
      layerStyleCount: Object.keys(preparedDesign.layerStyles ?? {}).length,
      feedRenderDesignJson: preparedDesign,
    });
  }

  if (variant === "preview" || variant === "publish") {
    console.log("[CreatorStudio/pipeline] preview render design JSON", {
      variant,
      selectedDesignId: preparedDesign.id,
      templateId: preparedDesign.templateId,
      layoutType: preparedDesign.layoutType,
      layerStyleCount: Object.keys(preparedDesign.layerStyles ?? {}).length,
      previewRenderDesignJson: preparedDesign,
    });
  }

  const isFeed = variant === "feed";
  const isPublishedView = isFeed || variant === "detail";
  const frameHeight = getFrameHeight(variant, compact);
  const shellStyle: CSSProperties = {
    backgroundColor: getPaletteColor(preparedDesign.colorPalette, 0, "#062a57"),
  };

  return (
    <div
      className={`relative isolate w-full max-w-full min-w-0 overflow-hidden text-white shadow-xl shadow-blue-950/10 ${
        variant === "feed"
          ? "rounded-none ring-0 md:rounded-[0.625rem] md:ring-1 md:ring-blue-100"
          : variant === "detail"
            ? "rounded-[1.5rem] ring-1 ring-blue-100"
            : "rounded-[1.75rem] ring-1 ring-blue-100"
      } ${frameHeight}`}
      style={shellStyle}
    >
      <StoryMediaLayer
        templateId={preparedDesign.templateId}
        photoPreviewUrl={photoPreviewUrl}
        videoPreviewUrl={videoPreviewUrl}
        generatedImageUrl={preparedDesign.generatedImageUrl}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#031d3d]/75 via-[#062a57]/20 to-transparent" />
      <HTBFWatermark />
      <div className="absolute inset-0 z-10">
        <CreatorStudioPositionedLayers
          design={preparedDesign}
          compact={isFeed || compact}
          hideCallToAction={isPublishedView}
        />
      </div>
    </div>
  );
}
