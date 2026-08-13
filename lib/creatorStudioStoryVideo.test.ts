import { describe, expect, it } from "vitest";
import { shouldRenderCreatorStudioGradientFallback } from "./creatorStudioMediaLayerState";
import {
  getCreatorStudioStoryVideoElementProps,
  shouldAutoplayCreatorStudioStoryVideo,
  shouldShowCreatorStudioVideoPoster,
  shouldUseCreatorStudioFeedVideoAutoplay,
} from "./creatorStudioStoryVideo";

describe("creatorStudioStoryVideo", () => {
  it("enables feed autoplay integration for feed and detail variants", () => {
    expect(shouldUseCreatorStudioFeedVideoAutoplay("feed")).toBe(true);
    expect(shouldUseCreatorStudioFeedVideoAutoplay("detail")).toBe(true);
    expect(shouldUseCreatorStudioFeedVideoAutoplay("preview")).toBe(false);
  });

  it("renders autoplay-capable muted inline video props for Creator Studio feed videos", () => {
    expect(getCreatorStudioStoryVideoElementProps("feed")).toEqual({
      autoPlay: true,
      muted: true,
      loop: true,
      playsInline: true,
      controls: false,
      preload: "metadata",
      useFeedPreviewAutoplay: true,
    });
  });

  it("autoplays publish previews without using the feed observer path", () => {
    expect(shouldAutoplayCreatorStudioStoryVideo("publish")).toBe(true);
    expect(getCreatorStudioStoryVideoElementProps("publish")).toMatchObject({
      autoPlay: true,
      useFeedPreviewAutoplay: false,
    });
  });

  it("keeps poster visible until the video is ready or playing", () => {
    expect(
      shouldShowCreatorStudioVideoPoster({
        videoPosterUrl: "https://cdn.example/poster.jpg",
        videoReady: false,
        isPlaying: false,
      })
    ).toBe(true);

    expect(
      shouldShowCreatorStudioVideoPoster({
        videoPosterUrl: "https://cdn.example/poster.jpg",
        videoReady: true,
        isPlaying: false,
      })
    ).toBe(false);
  });

  it("does not choose gradient fallback when video is expected but still loading", () => {
    expect(
      shouldRenderCreatorStudioGradientFallback({
        expectsVideo: true,
        templateId: "none",
      })
    ).toBe(false);
  });
});
