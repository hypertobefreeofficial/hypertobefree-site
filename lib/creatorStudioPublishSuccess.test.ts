import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CreatorStudioDesign } from "./creationCenter";

const rendererCalls: Array<Record<string, unknown>> = [];

vi.mock("../components/creation-center/CreatorStudioStoryRenderer", () => ({
  default: (props: Record<string, unknown>) => {
    rendererCalls.push(props);
    return React.createElement("div", { "data-testid": "story-renderer" });
  },
}));

import CreatorStudioPublishSuccess from "../components/creation-center/CreatorStudioPublishSuccess";

const design: CreatorStudioDesign = {
  id: "design-1",
  studioPath: "tell-story",
  sourceMode: "upload-photo",
  title: "Testimony",
  overlayText: "God is good",
  caption: "Shared story",
  category: "Testimony",
  topic: "testimony",
  templateId: "none",
  styleMood: "Warm encouragement",
  layoutType: "hero-overlay",
  scriptureSuggestion: "",
  suggestedPostFormat: "HTBF photo post",
  colorPalette: ["#062A57", "#FFFFFF", "#D4AF37"],
  typographyStyle: "Bold HTBF headline",
  designTreatment: "Warm encouragement",
};

describe("CreatorStudioPublishSuccess", () => {
  afterEach(() => {
    rendererCalls.length = 0;
  });

  it("passes photo and video preview URLs through to CreatorStudioStoryRenderer", () => {
    renderToStaticMarkup(
      React.createElement(CreatorStudioPublishSuccess, {
        design,
        photoPreviewUrl: "blob:http://localhost/photo-preview",
        videoPreviewUrl: "blob:http://localhost/video-preview",
        expectsPhoto: true,
        expectsVideo: true,
        wentLiveInstantly: true,
        onViewFeed: () => undefined,
        onCreateAnother: () => undefined,
        onDone: () => undefined,
      })
    );

    expect(rendererCalls).toHaveLength(1);
    expect(rendererCalls[0]).toMatchObject({
      design,
      photoPreviewUrl: "blob:http://localhost/photo-preview",
      videoPreviewUrl: "blob:http://localhost/video-preview",
      expectsPhoto: true,
      expectsVideo: true,
      variant: "publish",
    });
  });
});
