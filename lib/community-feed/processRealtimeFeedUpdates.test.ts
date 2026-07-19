import { describe, expect, it } from "vitest";
import { planRealtimeFeedSync } from "./realtimeFeedSync";
import { patchStoryAnsweredFieldsFromRealtime } from "./processRealtimeFeedUpdates";
import type { FeedStoryDisplay } from "./enrichFeedItems";

describe("processRealtimeFeedUpdates reaction scoping", () => {
  it("plans reaction-only updates without head refresh", () => {
    const plan = planRealtimeFeedSync(
      {
        storyChanges: [],
        responseChanges: [],
        reactionStoryIds: ["story-1"],
      },
      [],
      {
        blockedUserIds: new Set(),
        removedAtFilterAvailable: true,
      }
    );

    expect(plan.needsHeadRefresh).toBe(false);
    expect(plan.reactionStoryIds.has("story-1")).toBe(true);
  });
});

describe("patchStoryAnsweredFieldsFromRealtime", () => {
  it("patches answered fields on loaded story rows without a head refresh", () => {
    const story: FeedStoryDisplay = {
      kind: "story",
      dedupeKey: "story:story-1",
      id: "story-1",
      user_id: "owner-1",
      name: "Owner",
      location: null,
      story_type: "Prayer Request",
      story_text: "Please pray",
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
        praying: 2,
      },
      user_reactions: [],
      approved_video_responses: [],
      video_response_count: 0,
      viewer_pending_response: null,
      response_context: "prayer_request",
    };

    const next = patchStoryAnsweredFieldsFromRealtime([story], [
      {
        eventType: "UPDATE",
        record: {
          id: "story-1",
          prayer_status: "answered",
          answered_at: "2026-07-18T12:00:00.000Z",
          answered_text: "God answered clearly.",
        },
      },
    ]);

    expect(next[0]?.kind).toBe("story");
    if (next[0]?.kind === "story") {
      expect(next[0].prayer_status).toBe("answered");
      expect(next[0].answered_text).toBe("God answered clearly.");
    }
  });
});
