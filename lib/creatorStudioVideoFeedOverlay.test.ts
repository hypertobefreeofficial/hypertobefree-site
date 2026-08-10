import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CreatorStudioDesign } from "./creationCenter";
import { buildCreatorStudioAiSuggestionsPayload } from "./creatorStudioMetadata";
import { readCreatorStudioVideoFeedDesign } from "./creatorStudioStoryNavigation";

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

import CreatorStudioStoryOverlay from "../components/creation-center/CreatorStudioStoryOverlay";

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

describe("Creator Studio Video Feed overlay", () => {
  it("reads Creator Studio design metadata for video feed stories", () => {
    const story = {
      ai_suggestions: buildCreatorStudioAiSuggestionsPayload({
        design,
        prompts: {},
        suggestions: null,
        selectedTemplate: null,
      }),
      creation_mode: "creator-studio",
      signed_video_url: "https://cdn.example/signed-video.mp4",
      video_url: "https://cdn.example/video.mp4",
    };

    expect(readCreatorStudioVideoFeedDesign(story)?.overlayText).toBe(
      "God is good"
    );
  });

  it("renders Creator Studio overlay layers over the video feed player", () => {
    positionedLayerCalls.length = 0;
    watermarkCalls.length = 0;

    const html = renderToStaticMarkup(
      React.createElement(
        "div",
        { className: "relative h-full w-full" },
        React.createElement(CreatorStudioStoryOverlay, {
          design,
          compact: true,
          hideCallToAction: true,
        })
      )
    );

    expect(html).toContain('data-testid="positioned-layers"');
    expect(html).toContain('data-testid="htbf-watermark"');
    expect(positionedLayerCalls).toHaveLength(1);
    expect(watermarkCalls).toHaveLength(1);
  });

  it("keeps overlay layers mounted independently of playback state", () => {
    positionedLayerCalls.length = 0;
    watermarkCalls.length = 0;

    renderToStaticMarkup(
      React.createElement(CreatorStudioStoryOverlay, {
        design,
        compact: true,
        hideCallToAction: true,
      })
    );

    renderToStaticMarkup(
      React.createElement(CreatorStudioStoryOverlay, {
        design,
        compact: true,
        hideCallToAction: true,
      })
    );

    expect(positionedLayerCalls).toHaveLength(2);
    expect(watermarkCalls).toHaveLength(2);
  });
});
