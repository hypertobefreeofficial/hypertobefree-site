import { describe, expect, it } from "vitest";
import { buildVideoResponseSharePayload } from "./shareVideoResponse";
import type { FeedVideoResponseDisplay } from "./enrichFeedItems";

const responseItem: FeedVideoResponseDisplay = {
  kind: "prayer_video_response",
  dedupeKey: "prayer_video_response:response-1",
  id: "response-1",
  user_id: "responder",
  name: "Responder",
  location: null,
  video_url: "story-videos/x.webm",
  signed_video_url: "https://signed.example/video",
  signed_thumbnail_url: "https://signed.example/poster",
  created_at: "2026-07-14T12:00:00.000Z",
  parentStoryId: "parent-story-1",
  parentStoryUserId: "parent-author",
  parentStoryTitle: "Please pray for healing",
  parentStoryAuthor: "Hannah",
};

describe("buildVideoResponseSharePayload", () => {
  it("uses the canonical parent prayer route without signed media URLs", () => {
    const payload = buildVideoResponseSharePayload(
      responseItem,
      "https://example.com"
    );

    expect(payload.url).toBe(
      "https://example.com/prayer?story=parent-story-1"
    );
    expect(payload.url).not.toMatch(/signed\.example/);
    expect(payload.text).toMatch(/Hannah/);
    expect(payload.text).toMatch(/healing/i);
  });

  it("falls back to the prayer landing page when parent context is missing", () => {
    const payload = buildVideoResponseSharePayload(
      { ...responseItem, parentStoryId: "" },
      "https://example.com"
    );

    expect(payload.url).toBe("https://example.com/prayer");
  });
});
