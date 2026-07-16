import { describe, expect, it } from "vitest";
import { canPersistentlyHideFeedItem } from "./canHideFeedItem";
import type { FeedDisplayItem } from "./enrichFeedItems";

function storyItem(
  overrides: Partial<Extract<FeedDisplayItem, { kind: "story" }>> = {}
): FeedDisplayItem {
  return {
    kind: "story",
    dedupeKey: "story:1",
    id: "1",
    user_id: "author",
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
    ...overrides,
  };
}

describe("canPersistentlyHideFeedItem", () => {
  it("allows hide for prayer stories only", () => {
    expect(
      canPersistentlyHideFeedItem(
        storyItem({ story_type: "Prayer Request", id: "prayer-1" })
      )
    ).toBe(true);

    expect(
      canPersistentlyHideFeedItem(
        storyItem({
          story_type: "Prayer Request",
          prayer_status: "answered",
          id: "answered-1",
        })
      )
    ).toBe(true);
  });

  it("disallows hide for non-prayer stories and video responses", () => {
    expect(canPersistentlyHideFeedItem(storyItem())).toBe(false);
    expect(
      canPersistentlyHideFeedItem({
        kind: "prayer_video_response",
        dedupeKey: "prayer_video_response:1",
        id: "response-1",
        user_id: "responder",
        name: "Responder",
        location: null,
        video_url: "x.webm",
        signed_video_url: "https://signed.example/video",
        signed_thumbnail_url: null,
        created_at: "2026-07-14T12:00:00.000Z",
        parentStoryId: "parent-1",
        parentStoryUserId: "parent",
        parentStoryTitle: "Prayer",
        parentStoryAuthor: "Parent",
      })
    ).toBe(false);
  });
});
