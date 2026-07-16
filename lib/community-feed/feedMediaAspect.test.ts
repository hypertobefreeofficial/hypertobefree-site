import { describe, expect, it } from "vitest";
import { getStoryFeedMediaAspect } from "./feedMediaAspect";

describe("getStoryFeedMediaAspect", () => {
  it("uses auto for photo-only posts", () => {
    expect(
      getStoryFeedMediaAspect({
        signed_image_url: "/images/example.webp",
        signed_video_url: null,
        ai_suggestions: null,
      })
    ).toBe("auto");
  });

  it("honors explicit landscape hints for praise videos", () => {
    expect(
      getStoryFeedMediaAspect({
        signed_image_url: null,
        signed_video_url: "https://example.com/video.mp4",
        ai_suggestions: { feedMediaAspect: "landscape" },
      })
    ).toBe("landscape");
  });

  it("defaults videos to portrait when no hint is present", () => {
    expect(
      getStoryFeedMediaAspect({
        signed_image_url: null,
        signed_video_url: "https://example.com/video.mp4",
        ai_suggestions: null,
      })
    ).toBe("portrait");
  });
});
