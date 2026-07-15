import { describe, expect, it } from "vitest";
import type { FeedDisplayItem, FeedVideoResponseDisplay } from "./enrichFeedItems";
import { filterFeedDisplayItems } from "./filterFeedItems";

describe("community feed display filtering", () => {
  const storyItem: FeedDisplayItem = {
    kind: "story",
    dedupeKey: "story:1",
    id: "1",
    user_id: "author-blocked",
    name: "Author",
    location: null,
    story_type: "Testimony",
    story_text: "Hello",
    overlay_text: null,
    overlay_x: null,
    overlay_y: null,
    caption_style: null,
    caption_font: null,
    caption_background: null,
    caption_template: null,
    caption_color: null,
    caption_size: null,
    caption_align: null,
    video_template: null,
    htbf_watermark_enabled: null,
    silhouette_watermark_enabled: null,
    shared_htbf_intro_enabled: null,
    image_url: null,
    signed_image_url: null,
    video_url: null,
    signed_video_url: null,
    thumbnail_url: null,
    signed_thumbnail_url: null,
    status: "approved",
    created_at: "2026-07-14T12:00:00.000Z",
    prayer_status: "active",
    answered_at: null,
    answered_text: null,
    creation_mode: null,
    ai_suggestions: null,
    reaction_counts: {
      amen: 0,
      praise_god: 0,
      encouraged: 0,
      praying: 0,
    },
    user_reactions: [],
  };

  const responseItem: FeedVideoResponseDisplay = {
    kind: "prayer_video_response",
    dedupeKey: "prayer_video_response:1",
    id: "response-1",
    user_id: "responder-ok",
    name: "Responder",
    location: null,
    video_url: "story-videos/x.webm",
    signed_video_url: "https://signed.example/video",
    signed_thumbnail_url: "https://signed.example/poster",
    created_at: "2026-07-14T12:00:00.000Z",
    parentStoryId: "parent-1",
    parentStoryUserId: "parent-author-blocked",
    parentStoryTitle: "Prayer title",
    parentStoryAuthor: "Parent Author",
  };

  it("excludes blocked story authors (defense in depth)", () => {
    const visible = filterFeedDisplayItems(
      [storyItem],
      "all",
      ["author-blocked"]
    );
    expect(visible).toHaveLength(0);
  });

  it("excludes blocked responders and blocked parent authors for responses", () => {
    expect(
      filterFeedDisplayItems([responseItem], "all", ["responder-ok"])
    ).toHaveLength(0);

    expect(
      filterFeedDisplayItems([responseItem], "all", ["parent-author-blocked"])
    ).toHaveLength(0);

    expect(
      filterFeedDisplayItems([responseItem], "all", [])
    ).toHaveLength(1);
  });

  it("does not expose internal originSurface on public display items", () => {
    for (const item of [storyItem, responseItem]) {
      expect(item).not.toHaveProperty("originSurface");
    }

    expect(JSON.stringify(storyItem)).not.toMatch(/originSurface|prayer_connect|profile_upload/i);
    expect(JSON.stringify(responseItem)).not.toMatch(/originSurface|From Prayer|From Profile/i);
  });
});
