import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CreatorStudioDesign } from "./creationCenter";

const autoplayState = {
  isPlaying: false,
  shouldLoad: true,
};

vi.mock("../hooks/useViewportVideoAutoplay", () => ({
  FEED_PREVIEW_VIDEO_ATTR: "data-freedom-feed-preview-video",
  useViewportVideoAutoplay: () => ({
    frameRef: { current: null },
    videoRef: { current: null },
    shouldLoad: autoplayState.shouldLoad,
    isPlaying: autoplayState.isPlaying,
    setIsPlaying: vi.fn(),
  }),
}));

const positionedLayerCalls: unknown[] = [];
const watermarkCalls: unknown[] = [];

vi.mock("../components/creation-center/CreatorStudioPositionedLayers", () => ({
  default: (props: unknown) => {
    positionedLayerCalls.push(props);
    return React.createElement("div", { "data-testid": "positioned-layers" });
  },
}));

vi.mock("../components/creation-center/HTBFWatermark", () => ({
  default: () => {
    watermarkCalls.push(true);
    return React.createElement("div", { "data-testid": "htbf-watermark" });
  },
}));

import CreatorStudioStoryRenderer from "../components/creation-center/CreatorStudioStoryRenderer";

const design: CreatorStudioDesign = {
  id: "design-1",
  studioPath: "tell-story",
  sourceMode: "upload-video",
  title: "Testimony",
  overlayText: "God is good",
  caption: "Shared story",
  category: "Testimony",
  topic: "testimony",
  templateId: "none",
  styleMood: "Warm encouragement",
  layoutType: "hero-overlay",
  scriptureSuggestion: "",
  suggestedPostFormat: "HTBF video post",
  colorPalette: ["#062A57", "#FFFFFF", "#D4AF37"],
  typographyStyle: "Bold HTBF headline",
  designTreatment: "Warm encouragement",
  layerStyles: {
    title: {
      x: 10,
      y: 10,
      width: 80,
      align: "left",
      color: "#FFFFFF",
      fontSize: 24,
      fontWeight: "bold",
      hidden: false,
      order: 1,
    },
  },
};

describe("CreatorStudioStoryRenderer video composition", () => {
  afterEach(() => {
    autoplayState.isPlaying = false;
    autoplayState.shouldLoad = true;
    positionedLayerCalls.length = 0;
    watermarkCalls.length = 0;
  });

  it("renders feed video with autoplay-capable inline configuration", () => {
    const html = renderToStaticMarkup(
      React.createElement(CreatorStudioStoryRenderer, {
        design,
        videoPreviewUrl: "https://cdn.example/video.mp4",
        videoPosterUrl: "https://cdn.example/poster.jpg",
        expectsVideo: true,
        variant: "feed",
      })
    );

    expect(html).toContain('src="https://cdn.example/video.mp4"');
    expect(html).toContain('poster="https://cdn.example/poster.jpg"');
    expect(html).toContain('data-freedom-feed-preview-video="true"');
    expect(html).toMatch(/playsinline/i);
    expect(html).toMatch(/muted/);
    expect(html).toMatch(/loop/);
    expect(html).toMatch(/autoplay/i);
    expect(positionedLayerCalls).toHaveLength(1);
    expect(watermarkCalls).toHaveLength(1);
  });

  it("keeps text and watermark mounted regardless of playback state", () => {
    autoplayState.isPlaying = true;

    renderToStaticMarkup(
      React.createElement(CreatorStudioStoryRenderer, {
        design,
        videoPreviewUrl: "https://cdn.example/video.mp4",
        expectsVideo: true,
        variant: "feed",
      })
    );

    expect(positionedLayerCalls).toHaveLength(1);
    expect(watermarkCalls).toHaveLength(1);
  });

  it("does not render gradient fallback when video is expected but still resolving", () => {
    autoplayState.shouldLoad = false;

    const html = renderToStaticMarkup(
      React.createElement(CreatorStudioStoryRenderer, {
        design,
        videoPreviewUrl: null,
        videoPosterUrl: "https://cdn.example/poster.jpg",
        expectsVideo: true,
        variant: "feed",
      })
    );

    expect(html).not.toContain("#60a5fa");
    expect(html).toContain('src="https://cdn.example/poster.jpg"');
    expect(positionedLayerCalls).toHaveLength(1);
  });

  it("leaves photo posts unchanged", () => {
    const html = renderToStaticMarkup(
      React.createElement(CreatorStudioStoryRenderer, {
        design,
        photoPreviewUrl: "https://cdn.example/photo.jpg",
        expectsPhoto: true,
        variant: "feed",
      })
    );

    expect(html).toContain('<img');
    expect(html).toContain('src="https://cdn.example/photo.jpg"');
    expect(html).not.toContain("<video");
  });

  it("still renders template-only stories with the gradient fallback", () => {
    const html = renderToStaticMarkup(
      React.createElement(CreatorStudioStoryRenderer, {
        design: {
          ...design,
          sourceMode: "build-ai",
        },
        expectsPhoto: false,
        expectsVideo: false,
        variant: "feed",
      })
    );

    expect(html).toContain("#60a5fa");
    expect(positionedLayerCalls).toHaveLength(1);
  });
});
