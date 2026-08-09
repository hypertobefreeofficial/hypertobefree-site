import { describe, expect, it } from "vitest";
import {
  resolveCreatorStudioMediaLayerRenderState,
  shouldRenderCreatorStudioGradientFallback,
} from "./creatorStudioMediaLayerState";

describe("resolveCreatorStudioMediaLayerRenderState", () => {
  it("renders photo when a photo preview URL exists", () => {
    expect(
      resolveCreatorStudioMediaLayerRenderState({
        photoPreviewUrl: "blob:http://localhost/photo",
      })
    ).toBe("photo");
  });

  it("renders video when a video preview URL exists", () => {
    expect(
      resolveCreatorStudioMediaLayerRenderState({
        videoPreviewUrl: "blob:http://localhost/video",
      })
    ).toBe("video");
  });

  it("uses loading-photo instead of fallback while persisted photo is resolving", () => {
    expect(
      resolveCreatorStudioMediaLayerRenderState({
        expectsPhoto: true,
        templateId: "scripture-woods",
      })
    ).toBe("loading-photo");
  });

  it("uses loading-video instead of fallback while persisted video is resolving", () => {
    expect(
      resolveCreatorStudioMediaLayerRenderState({
        expectsVideo: true,
        templateId: "none",
      })
    ).toBe("loading-video");
  });

  it("falls back only when no media is expected or available", () => {
    expect(
      resolveCreatorStudioMediaLayerRenderState({
        templateId: "none",
      })
    ).toBe("fallback");
  });

  it("falls back after photo load failure when no other media exists", () => {
    expect(
      resolveCreatorStudioMediaLayerRenderState({
        expectsPhoto: true,
        photoFailed: true,
        templateId: "none",
      })
    ).toBe("fallback");
  });

  it("falls back after video load failure when no other media exists", () => {
    expect(
      resolveCreatorStudioMediaLayerRenderState({
        expectsVideo: true,
        videoFailed: true,
        templateId: "none",
      })
    ).toBe("fallback");
  });

  it("keeps template background for template-only stories", () => {
    expect(
      resolveCreatorStudioMediaLayerRenderState({
        templateId: "scripture-woods",
      })
    ).toBe("template-image");
  });
});

describe("shouldRenderCreatorStudioGradientFallback", () => {
  it("does not render gradient fallback while known photo media is loading", () => {
    expect(
      shouldRenderCreatorStudioGradientFallback({
        expectsPhoto: true,
        templateId: "none",
      })
    ).toBe(false);
  });

  it("does not render gradient fallback while known video media is loading", () => {
    expect(
      shouldRenderCreatorStudioGradientFallback({
        expectsVideo: true,
        templateId: "none",
      })
    ).toBe(false);
  });
});
