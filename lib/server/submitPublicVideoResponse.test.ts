import { describe, expect, it } from "vitest";
import {
  classifySourceForPublicVideoResponse,
  inferPublicVideoSourceType,
} from "./submitPublicVideoResponse";

describe("inferPublicVideoSourceType", () => {
  it("classifies prayer requests as prayer", () => {
    expect(
      inferPublicVideoSourceType({ story_type: "Prayer Request" })
    ).toBe("prayer");
  });

  it("classifies ordinary feed stories as feed", () => {
    expect(inferPublicVideoSourceType({ story_type: "Testimony" })).toBe("feed");
    expect(inferPublicVideoSourceType({ story_type: "Praise Report" })).toBe(
      "feed"
    );
  });
});

describe("classifySourceForPublicVideoResponse", () => {
  const baseStory = {
    id: "story-1",
    user_id: "owner-1",
    story_type: "Testimony",
    story_text: "Fixture",
    status: "approved",
    prayer_status: null,
    topics: [],
  };

  it("returns 404 when the source post does not exist", () => {
    const result = classifySourceForPublicVideoResponse({
      source: null,
      sourceType: "feed",
    });
    expect(result?.code).toBe("source_not_found");
    expect(result?.status).toBe(404);
  });

  it("returns 400 when feed is requested for a prayer story", () => {
    const result = classifySourceForPublicVideoResponse({
      source: { ...baseStory, story_type: "Prayer Request" },
      sourceType: "feed",
    });
    expect(result?.code).toBe("source_type_mismatch");
    expect(result?.status).toBe(400);
  });

  it("returns 400 when prayer is requested for a feed story", () => {
    const result = classifySourceForPublicVideoResponse({
      source: baseStory,
      sourceType: "prayer",
    });
    expect(result?.code).toBe("source_type_mismatch");
    expect(result?.status).toBe(400);
  });

  it("returns 400 when the source is not approved", () => {
    const result = classifySourceForPublicVideoResponse({
      source: { ...baseStory, status: "pending" },
      sourceType: "feed",
    });
    expect(result?.code).toBe("source_unapproved");
    expect(result?.status).toBe(400);
  });

  it("accepts approved feed stories for feed responses", () => {
    const result = classifySourceForPublicVideoResponse({
      source: baseStory,
      sourceType: "feed",
    });
    expect(result).toBeNull();
  });
});
