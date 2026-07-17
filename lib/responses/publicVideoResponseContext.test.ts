import { describe, expect, it } from "vitest";
import {
  adminResponseTypeLabel,
  resolveResponseContextFromStory,
  responseContextFromSourceType,
} from "./publicVideoResponseContext";

describe("responseContextFromSourceType", () => {
  it("maps feed submissions to feed_post regardless of parent media", () => {
    expect(responseContextFromSourceType("feed")).toBe("feed_post");
    expect(responseContextFromSourceType("prayer")).toBe("prayer_request");
  });
});

describe("resolveResponseContextFromStory", () => {
  it("still classifies legacy story rows for admin display fallbacks", () => {
    expect(resolveResponseContextFromStory({ story_type: "Prayer Request" })).toBe(
      "prayer_request"
    );
    expect(resolveResponseContextFromStory({ story_type: "Video Testimony" })).toBe(
      "video_post"
    );
    expect(resolveResponseContextFromStory({ story_type: "Testimony" })).toBe(
      "feed_post"
    );
  });
});

describe("adminResponseTypeLabel", () => {
  it("uses feed-specific admin labels", () => {
    expect(adminResponseTypeLabel("feed_post")).toBe("Feed Response");
    expect(adminResponseTypeLabel("prayer_request")).toBe("Prayer Response");
  });
});
