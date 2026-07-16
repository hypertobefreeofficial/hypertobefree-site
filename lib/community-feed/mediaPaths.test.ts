import { describe, expect, it } from "vitest";
import {
  getPhotoStoragePath,
  getThumbnailStoragePath,
  getVideoStoragePath,
} from "./mediaPaths";

describe("community feed media path resolution", () => {
  it("resolves story video paths from the story-videos bucket prefix", () => {
    expect(
      getVideoStoragePath("story-videos/user-1/prayer.webm")
    ).toBe("user-1/prayer.webm");
  });

  it("resolves thumbnail paths from the story-thumbnails bucket prefix", () => {
    expect(
      getThumbnailStoragePath("story-thumbnails/user-1/poster.webp")
    ).toBe("user-1/poster.webp");
  });

  it("resolves photo paths from the story-images bucket prefix", () => {
    expect(
      getPhotoStoragePath("story-images/user-1/photo.jpg")
    ).toBe("user-1/photo.jpg");
  });

  it("keeps video and thumbnail bucket resolution separate", () => {
    const rawVideo = "story-videos/user-1/prayer.webm";
    expect(getVideoStoragePath(rawVideo)).toBe("user-1/prayer.webm");
    expect(getThumbnailStoragePath("story-thumbnails/user-1/poster.webp")).toBe(
      "user-1/poster.webp"
    );
    expect(getPhotoStoragePath("story-images/user-1/photo.jpg")).toBe(
      "user-1/photo.jpg"
    );
    expect(getThumbnailStoragePath(rawVideo)).toBe(rawVideo);
  });

  it("never treats raw video_url as a thumbnail image path", () => {
    const rawVideo = "story-videos/user-1/prayer.webm";
    expect(getThumbnailStoragePath(rawVideo)).not.toBe("user-1/prayer.webm");
    expect(getPhotoStoragePath(rawVideo)).toBe(rawVideo);
  });
});
