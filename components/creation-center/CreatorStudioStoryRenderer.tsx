"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  getCreationCenterTemplate,
  prepareCreatorStudioForEditing,
  type CreationCenterTemplateId,
  type CreatorStudioDesign,
} from "../../lib/creationCenter";
import { resolveCreatorStudioMediaLayerRenderState } from "../../lib/creatorStudioMediaLayerState";
import {
  getCreatorStudioStoryVideoElementProps,
  shouldShowCreatorStudioVideoPoster,
  type CreatorStudioStoryRendererVariant,
} from "../../lib/creatorStudioStoryVideo";
import {
  FEED_PREVIEW_VIDEO_ATTR,
  useViewportVideoAutoplay,
} from "../../hooks/useViewportVideoAutoplay";
import CreatorStudioPositionedLayers from "./CreatorStudioPositionedLayers";
import HTBFWatermark from "./HTBFWatermark";

export type { CreatorStudioStoryRendererVariant };

type CreatorStudioStoryRendererProps = {
  design: CreatorStudioDesign;
  photoPreviewUrl?: string | null;
  videoPreviewUrl?: string | null;
  videoPosterUrl?: string | null;
  expectsPhoto?: boolean;
  expectsVideo?: boolean;
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

function MediaLoadingSurface() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 bg-[linear-gradient(180deg,#0f2744_0%,#091a31_100%)]"
    />
  );
}

function StoryVideoMedia({
  videoPreviewUrl,
  videoPosterUrl,
  variant,
  onVideoFailed,
}: {
  videoPreviewUrl: string;
  videoPosterUrl?: string | null;
  variant: CreatorStudioStoryRendererVariant;
  onVideoFailed?: () => void;
}) {
  const videoProps = getCreatorStudioStoryVideoElementProps(variant);
  const [videoReady, setVideoReady] = useState(false);

  const { frameRef, videoRef, shouldLoad, isPlaying } = useViewportVideoAutoplay({
    videoUrl: videoPreviewUrl,
    enabled: Boolean(videoPreviewUrl) && videoProps.useFeedPreviewAutoplay,
  });

  useEffect(() => {
    setVideoReady(false);
  }, [videoPreviewUrl, videoPosterUrl]);

  const canRenderVideo = videoProps.useFeedPreviewAutoplay
    ? shouldLoad
    : true;
  const showPoster = shouldShowCreatorStudioVideoPoster({
    videoPosterUrl,
    videoReady,
    isPlaying,
  });
  const showLoading =
    !videoReady && !showPoster && !isPlaying;

  function configureVideoElement(video: HTMLVideoElement) {
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    if (videoProps.autoPlay && !videoProps.useFeedPreviewAutoplay) {
      void video.play().catch(() => {
        // Publish/preview surfaces may still require a tap on some devices.
      });
    }
  }

  return (
    <div
      ref={videoProps.useFeedPreviewAutoplay ? frameRef : undefined}
      className="absolute inset-0 z-0"
    >
      {showLoading ? <MediaLoadingSurface /> : null}
      {showPoster ? (
        <img
          src={videoPosterUrl ?? undefined}
          alt=""
          className="absolute inset-0 z-[1] h-full w-full object-cover"
        />
      ) : null}
      {canRenderVideo ? (
        <video
          ref={videoRef}
          src={videoPreviewUrl}
          poster={videoPosterUrl ?? undefined}
          autoPlay={videoProps.autoPlay}
          muted={videoProps.muted}
          loop={videoProps.loop}
          playsInline={videoProps.playsInline}
          controls={videoProps.controls}
          preload={videoProps.preload}
          {...(videoProps.useFeedPreviewAutoplay
            ? { [FEED_PREVIEW_VIDEO_ATTR]: "true" }
            : {})}
          onLoadedMetadata={(event) => {
            configureVideoElement(event.currentTarget);
            setVideoReady(true);
          }}
          onLoadedData={() => setVideoReady(true)}
          onPlay={() => setVideoReady(true)}
          onError={() => onVideoFailed?.()}
          className={`pointer-events-none absolute inset-0 z-[2] h-full w-full object-cover transition-opacity duration-150 ${
            videoReady || isPlaying ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : null}
    </div>
  );
}

function StoryMediaLayer({
  templateId,
  photoPreviewUrl,
  videoPreviewUrl,
  videoPosterUrl,
  generatedImageUrl,
  expectsPhoto = false,
  expectsVideo = false,
  variant = "preview",
}: {
  templateId: CreationCenterTemplateId;
  photoPreviewUrl?: string | null;
  videoPreviewUrl?: string | null;
  videoPosterUrl?: string | null;
  generatedImageUrl?: string | null;
  expectsPhoto?: boolean;
  expectsVideo?: boolean;
  variant?: CreatorStudioStoryRendererVariant;
}) {
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    setPhotoLoaded(false);
    setPhotoFailed(false);
  }, [photoPreviewUrl]);

  useEffect(() => {
    setVideoFailed(false);
  }, [videoPreviewUrl, videoPosterUrl]);

  const renderState = resolveCreatorStudioMediaLayerRenderState({
    photoPreviewUrl,
    videoPreviewUrl,
    generatedImageUrl,
    templateId,
    expectsPhoto,
    expectsVideo,
    photoFailed,
    videoFailed,
  });

  const showPhotoLoading =
    renderState === "photo" && !photoLoaded && !photoFailed;

  if (renderState === "loading-photo") {
    return <MediaLoadingSurface />;
  }

  if (renderState === "loading-video") {
    if (videoPosterUrl) {
      return (
        <img
          src={videoPosterUrl}
          alt=""
          className="absolute inset-0 z-0 h-full w-full object-cover"
        />
      );
    }

    return <MediaLoadingSurface />;
  }

  if (renderState === "photo") {
    return (
      <>
        {showPhotoLoading ? <MediaLoadingSurface /> : null}
        <img
          src={photoPreviewUrl ?? undefined}
          alt=""
          onLoad={() => setPhotoLoaded(true)}
          onError={() => setPhotoFailed(true)}
          className={`absolute inset-0 z-0 h-full w-full object-cover transition-opacity duration-150 ${
            photoLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
      </>
    );
  }

  if (renderState === "video" && videoPreviewUrl) {
    return (
      <StoryVideoMedia
        videoPreviewUrl={videoPreviewUrl}
        videoPosterUrl={videoPosterUrl}
        variant={variant}
        onVideoFailed={() => setVideoFailed(true)}
      />
    );
  }

  if (renderState === "generated-image" && generatedImageUrl) {
    return (
      <img
        src={generatedImageUrl}
        alt=""
        loading="lazy"
        className="absolute inset-0 z-0 h-full w-full object-cover"
      />
    );
  }

  if (renderState === "template-image") {
    const template = getCreationCenterTemplate(templateId);
    if (template?.imagePath) {
      return (
        <img
          src={template.imagePath}
          alt=""
          loading="lazy"
          className="absolute inset-0 z-0 h-full w-full object-cover"
        />
      );
    }
  }

  return (
    <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_left,#60a5fa,transparent_34%),linear-gradient(135deg,#062a57,#0b63ce_52%,#dbeafe)]" />
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
  videoPosterUrl,
  expectsPhoto = false,
  expectsVideo = false,
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
        videoPosterUrl={videoPosterUrl}
        generatedImageUrl={preparedDesign.generatedImageUrl}
        expectsPhoto={expectsPhoto}
        expectsVideo={expectsVideo}
        variant={variant}
      />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-[#031d3d]/75 via-[#062a57]/20 to-transparent" />
      <div className="pointer-events-none absolute inset-0 z-[2]">
        <HTBFWatermark />
      </div>
      <div className="pointer-events-none absolute inset-0 z-[3]">
        <CreatorStudioPositionedLayers
          design={preparedDesign}
          compact={isFeed || compact}
          hideCallToAction={isPublishedView}
        />
      </div>
    </div>
  );
}
