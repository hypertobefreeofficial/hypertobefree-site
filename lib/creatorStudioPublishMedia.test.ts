import { describe, expect, it } from "vitest";
import { resolveCreatorStudioPublishMedia } from "./creatorStudioPublishMedia";

function mockFile(name: string, type: string) {
  return new File(["media"], name, { type });
}

describe("resolveCreatorStudioPublishMedia", () => {
  it("uploads photo media when a photo file exists even if design sourceMode is build-ai", () => {
    expect(
      resolveCreatorStudioPublishMedia({
        photoFile: mockFile("story.jpg", "image/jpeg"),
        videoFile: null,
        designSourceMode: "build-ai",
      })
    ).toEqual({
      hasPhoto: true,
      hasVideo: false,
      effectiveMediaMode: "photo",
      isMediaPost: true,
      contentType: "photo",
      sourceMode: "upload-photo",
    });
  });

  it("uploads video media when a video file exists even if design sourceMode is start-template", () => {
    expect(
      resolveCreatorStudioPublishMedia({
        photoFile: null,
        videoFile: mockFile("story.mp4", "video/mp4"),
        designSourceMode: "start-template",
      })
    ).toEqual({
      hasPhoto: false,
      hasVideo: true,
      effectiveMediaMode: "video",
      isMediaPost: true,
      contentType: "video",
      sourceMode: "upload-video",
    });
  });

  it("prefers video when both files are present", () => {
    expect(
      resolveCreatorStudioPublishMedia({
        photoFile: mockFile("story.jpg", "image/jpeg"),
        videoFile: mockFile("story.mp4", "video/mp4"),
        designSourceMode: "upload-photo",
      }).effectiveMediaMode
    ).toBe("video");
  });

  it("keeps text-only Creator Studio posts when no media files are attached", () => {
    expect(
      resolveCreatorStudioPublishMedia({
        photoFile: null,
        videoFile: null,
        designSourceMode: "build-ai",
      })
    ).toEqual({
      hasPhoto: false,
      hasVideo: false,
      effectiveMediaMode: "text",
      isMediaPost: false,
      contentType: "testimony-card",
      sourceMode: "build-ai",
    });
  });
});
