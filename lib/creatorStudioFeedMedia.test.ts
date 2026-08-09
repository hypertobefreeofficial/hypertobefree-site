import { describe, expect, it } from "vitest";
import {
  resolveCreatorStudioFeedMediaUrls,
  shouldRenderCreatorStudioGradientFallback,
} from "./creatorStudioFeedMedia";

describe("resolveCreatorStudioFeedMediaUrls", () => {
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
      hasPersistedPhoto: true,
      hasPersistedVideo: true,
    });
  });

  it("falls back to persisted video_url when signed video is unavailable", () => {
    expect(
      resolveCreatorStudioFeedMediaUrls({
        video_url: "https://cdn.example/public-video.mp4",
        signed_video_url: null,
      }).videoPreviewUrl
    ).toBe("https://cdn.example/public-video.mp4");
  });

  it("reports persisted media from storage paths after reload", () => {
    const resolved = resolveCreatorStudioFeedMediaUrls({
      image_url: "user-1/photo.jpg",
      signed_image_url: "https://cdn.example/signed-photo.jpg",
      video_url: null,
      signed_video_url: null,
    });

    expect(resolved.hasPersistedPhoto).toBe(true);
    expect(resolved.photoPreviewUrl).toBe("https://cdn.example/signed-photo.jpg");
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
