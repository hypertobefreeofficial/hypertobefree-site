import { describe, expect, it } from "vitest";
import type { FeedDisplayItem, FeedStoryDisplay } from "./enrichFeedItems";
import {
  mergeFeedDisplayPages,
  mergeRealtimeHeadRefresh,
  removeFeedItemsByDedupeKeys,
  upsertFeedDisplayItem,
} from "./mergeFeedState";

function storyDisplay(
  id: string,
  createdAt: string,
  userId = "author-1"
): FeedStoryDisplay {
  return {
    kind: "story",
    dedupeKey: `story:${id}`,
    id,
    user_id: userId,
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
    created_at: createdAt,
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
}

describe("community feed merge state", () => {
  it("appends later pages without replacing earlier items", () => {
    const pageOne = [
      storyDisplay("1", "2026-07-18T20:00:00.000Z"),
      storyDisplay("2", "2026-07-18T19:00:00.000Z"),
    ];
    const pageTwo = [
      storyDisplay("3", "2026-07-18T18:00:00.000Z"),
    ];

    const merged = mergeFeedDisplayPages(pageOne, pageTwo);
    expect(merged.map((item) => item.id)).toEqual(["1", "2", "3"]);
  });

  it("deduplicates overlapping pages by dedupeKey", () => {
    const pageOne = [storyDisplay("1", "2026-07-18T20:00:00.000Z")];
    const pageTwo = [
      storyDisplay("1", "2026-07-18T20:00:00.000Z"),
      storyDisplay("2", "2026-07-18T19:00:00.000Z"),
    ];

    const merged = mergeFeedDisplayPages(pageOne, pageTwo);
    expect(merged).toHaveLength(2);
    expect(merged.map((item) => item.id)).toEqual(["1", "2"]);
  });

  it("preserves tail pages during realtime head refresh", () => {
    const loaded = [
      storyDisplay("head-1", "2026-07-18T22:00:00.000Z"),
      storyDisplay("head-2", "2026-07-18T21:00:00.000Z"),
      storyDisplay("tail-1", "2026-07-18T20:00:00.000Z"),
      storyDisplay("tail-2", "2026-07-18T19:00:00.000Z"),
    ];
    const refreshedHead = [
      storyDisplay("head-new", "2026-07-18T23:00:00.000Z"),
      storyDisplay("head-2", "2026-07-18T21:00:00.000Z"),
    ];

    const merged = mergeRealtimeHeadRefresh(loaded, refreshedHead, 2);
    expect(merged.map((item) => item.id)).toEqual([
      "head-new",
      "head-2",
      "tail-1",
      "tail-2",
    ]);
  });

  it("removes ineligible records by dedupe key", () => {
    const items: FeedDisplayItem[] = [
      storyDisplay("1", "2026-07-18T20:00:00.000Z"),
      storyDisplay("2", "2026-07-18T19:00:00.000Z"),
    ];
    const next = removeFeedItemsByDedupeKeys(items, new Set(["story:1"]));
    expect(next.map((item) => item.id)).toEqual(["2"]);
  });

  it("upserts realtime inserts without duplicating existing items", () => {
    const items = [storyDisplay("1", "2026-07-18T20:00:00.000Z")];
    const updated = storyDisplay("1", "2026-07-18T20:00:00.000Z");
    updated.reaction_counts.praying = 3;

    const merged = upsertFeedDisplayItem(items, updated);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.reaction_counts.praying).toBe(3);
  });
});
