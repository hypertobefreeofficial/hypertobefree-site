import { beforeEach, describe, expect, it } from "vitest";
import {
  resolveCreatorStudioFeedMediaUrls,
  shouldRenderCreatorStudioGradientFallback,
} from "./creatorStudioFeedMedia";
import {
  clearCreatorStudioSessionPreview,
  getCreatorStudioSessionPreview,
  resetCreatorStudioSessionPreviewStoreForTests,
  storeCreatorStudioSessionPreview,
} from "./creatorStudioSessionPreview";

describe("resolveCreatorStudioFeedMediaUrls", () => {
  beforeEach(() => {
    resetCreatorStudioSessionPreviewStoreForTests();
  });
  it("uses signed image and video URLs for Creator Studio feed rendering", () => {
    expect(
      resolveCreatorStudioFeedMediaUrls({
        image_url: "user-1/photo.jpg",
        signed_image_url: "https://cdn.example/signed-photo.jpg",
        video_url: "https://cdn.example/video.mp4",
        signed_video_url: "https://cdn.example/signed-video.mp4",
      })
    ).toEqual({
      photoPreviewUrl: "https://cdn.example/signed-photo.jpg",
      videoPreviewUrl: "https://cdn.example/signed-video.mp4",
      videoPosterUrl: null,
      hasPersistedPhoto: true,
      hasPersistedVideo: true,
      expectsPhoto: true,
      expectsVideo: true,
    });
  });

  it("uses session preview URLs while signed media is still resolving", () => {
    storeCreatorStudioSessionPreview("story-123", {
      photoUrl: "blob:http://localhost/photo",
      videoUrl: null,
    });

    expect(
      resolveCreatorStudioFeedMediaUrls({
        id: "story-123",
        image_url: "user-1/photo.jpg",
        signed_image_url: null,
      })
    ).toMatchObject({
      photoPreviewUrl: "blob:http://localhost/photo",
      expectsPhoto: true,
    });

    clearCreatorStudioSessionPreview("story-123");
  });

  it("falls back to persisted video_url when signed video is unavailable", () => {
    expect(
      resolveCreatorStudioFeedMediaUrls({
        video_url: "https://cdn.example/public-video.mp4",
        signed_video_url: null,
      }).videoPreviewUrl
    ).toBe("https://cdn.example/public-video.mp4");
  });
});

describe("shouldRenderCreatorStudioGradientFallback", () => {
  it("does not use the gradient fallback when a signed photo URL exists", () => {
    expect(
      shouldRenderCreatorStudioGradientFallback({
        photoPreviewUrl: "https://cdn.example/signed-photo.jpg",
        templateId: "scripture-woods",
      })
    ).toBe(false);
  });

  it("does not use the gradient fallback when a signed video URL exists", () => {
    expect(
      shouldRenderCreatorStudioGradientFallback({
        videoPreviewUrl: "https://cdn.example/signed-video.mp4",
        templateId: "none",
      })
    ).toBe(false);
  });

  it("does not use the gradient fallback while persisted photo media is expected", () => {
    expect(
      shouldRenderCreatorStudioGradientFallback({
        expectsPhoto: true,
        templateId: "none",
      })
    ).toBe(false);
  });

  it("does not use the gradient fallback while persisted video media is expected", () => {
    expect(
      shouldRenderCreatorStudioGradientFallback({
        expectsVideo: true,
        templateId: "none",
      })
    ).toBe(false);
  });

  it("uses the gradient fallback only when no renderable media exists", () => {
    expect(
      shouldRenderCreatorStudioGradientFallback({
        photoPreviewUrl: null,
        videoPreviewUrl: null,
        generatedImageUrl: null,
        templateId: "none",
      })
    ).toBe(true);
  });

  it("keeps template-only Creator Studio stories on their template background", () => {
    expect(
      shouldRenderCreatorStudioGradientFallback({
        templateId: "scripture-woods",
      })
    ).toBe(false);
  });
});

describe("creator studio session preview", () => {
  beforeEach(() => {
    resetCreatorStudioSessionPreviewStoreForTests();
  });

  it("stores and clears confirmation preview URLs for the same session", () => {
    storeCreatorStudioSessionPreview("story-999", {
      photoUrl: "blob:http://localhost/confirmation-photo",
      videoUrl: null,
    });

    expect(getCreatorStudioSessionPreview("story-999")).toEqual({
      photoUrl: "blob:http://localhost/confirmation-photo",
      videoUrl: null,
    });

    clearCreatorStudioSessionPreview("story-999");
    expect(getCreatorStudioSessionPreview("story-999")).toBeNull();
  });
});
