import { describe, expect, it } from "vitest";
import { classifyFeedStory } from "../../components/community-feed/classifyFeedStory";
import type { FeedStoryDisplay } from "./enrichFeedItems";

function baseStory(
  overrides: Partial<FeedStoryDisplay>
): FeedStoryDisplay {
  return {
    kind: "story",
    id: "story-1",
    dedupeKey: "story:story-1",
    user_id: "user-1",
    name: "Test User",
    location: "Austin, Texas",
    story_type: "Testimony",
    story_text: "Sample",
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
    video_url: null,
    thumbnail_url: null,
    status: "approved",
    created_at: "2026-07-14T12:00:00.000Z",
    prayer_status: "active",
    answered_at: null,
    answered_text: null,
    creation_mode: "guided",
    ai_suggestions: null,
    signed_image_url: null,
    signed_video_url: null,
    signed_thumbnail_url: null,
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

describe("classifyFeedStory", () => {
  it("classifies answered prayers", () => {
    expect(
      classifyFeedStory(
        baseStory({
          story_type: "Prayer Request",
          prayer_status: "answered",
        })
      )
    ).toBe("prayer-answered");
  });

  it("classifies active prayer requests", () => {
    expect(
      classifyFeedStory(
        baseStory({
          story_type: "Prayer Request",
          prayer_status: "active",
        })
      )
    ).toBe("prayer-active");
  });

  it("classifies praise posts", () => {
    expect(
      classifyFeedStory(
        baseStory({
          story_type: "Praise Report",
        })
      )
    ).toBe("praise");
  });
});
