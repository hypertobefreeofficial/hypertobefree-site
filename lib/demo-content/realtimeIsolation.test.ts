import { describe, expect, it } from "vitest";
import {
  parseReactionRealtimePayload,
  parseResponseRealtimePayload,
  parseStoryRealtimePayload,
  shouldIgnoreGenuinePublicRealtimePayload,
} from "../community-feed/realtimePayload";
import {
  collectRemovalKeysForStoryChange,
  isStoryRecordPubliclyIneligible,
  planRealtimeFeedSync,
  storyIsPresentInLoadedFeed,
} from "../community-feed/realtimeFeedSync";
import { patchStoryAnsweredFieldsFromRealtime } from "../community-feed/processRealtimeFeedUpdates";
import { storyDedupeKey } from "../community-feed/provenance";
import type { FeedStoryDisplay } from "../community-feed/enrichFeedItems";

const context = {
  blockedUserIds: new Set<string>(),
  removedAtFilterAvailable: true,
  demoIsolationActive: true,
};

function storyItem(id: string): FeedStoryDisplay {
  return {
    kind: "story",
    dedupeKey: storyDedupeKey(id),
    id,
    user_id: "author-1",
    name: "Author",
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
    created_at: "2026-07-18T20:00:00.000Z",
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

describe("demo realtime isolation", () => {
  it("detects demo flags in realtime payloads", () => {
    expect(
      parseStoryRealtimePayload({
        eventType: "INSERT",
        new: { id: "s1", is_demo: true },
      }).isDemo
    ).toBe(true);
    expect(
      parseResponseRealtimePayload({
        eventType: "INSERT",
        new: { id: "r1", is_demo: true },
      }).isDemo
    ).toBe(true);
    expect(
      parseReactionRealtimePayload({
        new: { story_id: "s1", is_demo: true },
      }).isDemo
    ).toBe(true);
  });

  it("marks demo story realtime records ineligible for genuine feed state", () => {
    expect(
      isStoryRecordPubliclyIneligible(
        { id: "s1", status: "approved", is_demo: true },
        context
      )
    ).toBe(true);
  });

  it("allows genuine story realtime records through eligibility checks", () => {
    expect(
      isStoryRecordPubliclyIneligible(
        { id: "s1", status: "approved", is_demo: false },
        context
      )
    ).toBe(false);
  });

  it("allows partial UPDATE payloads without is_demo through ingress", () => {
    expect(
      shouldIgnoreGenuinePublicRealtimePayload(
        { id: "s1", status: "approved", prayer_status: "answered" },
        true,
        { eventType: "UPDATE" }
      )
    ).toBe(false);
  });

  it("rejects uncertain INSERT payloads when schema isolation is active", () => {
    expect(
      shouldIgnoreGenuinePublicRealtimePayload(
        { id: "s1", status: "approved" },
        true,
        { eventType: "INSERT" }
      )
    ).toBe(true);
  });

  it("ignores partial UPDATE events for stories not already in loaded feed", () => {
    const loaded = [storyItem("known-story")];
    expect(storyIsPresentInLoadedFeed("unknown-story", loaded)).toBe(false);

    const result = collectRemovalKeysForStoryChange(
      {
        eventType: "UPDATE",
        record: {
          id: "unknown-story",
          prayer_status: "answered",
          answered_text: "God did it",
        },
      },
      loaded,
      context
    );

    expect(result.removalKeys.size).toBe(0);
    expect(result.uncertainStoryIds.size).toBe(0);
    expect(result.needsHeadRefresh).toBe(false);
  });

  it("removes loaded stories when an explicit demo UPDATE arrives", () => {
    const loaded = [storyItem("known-story")];
    const result = collectRemovalKeysForStoryChange(
      {
        eventType: "UPDATE",
        record: {
          id: "known-story",
          status: "approved",
          is_demo: true,
        },
      },
      loaded,
      context
    );

    expect(result.removalKeys.has(storyDedupeKey("known-story"))).toBe(true);
  });

  it("patches God Did It fields for known genuine partial UPDATE events", () => {
    const loaded = [storyItem("known-story")];
    const next = patchStoryAnsweredFieldsFromRealtime(loaded, [
      {
        eventType: "UPDATE",
        record: {
          id: "known-story",
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

  it("does not patch answered fields for explicit demo UPDATE events", () => {
    const loaded = [storyItem("known-story")];
    const next = patchStoryAnsweredFieldsFromRealtime(loaded, [
      {
        eventType: "UPDATE",
        record: {
          id: "known-story",
          is_demo: true,
          prayer_status: "answered",
          answered_text: "Should not apply",
        },
      },
    ]);

    expect(next[0]?.kind).toBe("story");
    if (next[0]?.kind === "story") {
      expect(next[0].prayer_status).toBe("active");
      expect(next[0].answered_text).toBeNull();
    }
  });

  it("does not request head refresh for unknown partial UPDATE events", () => {
    const plan = planRealtimeFeedSync(
      {
        storyChanges: [
          {
            eventType: "UPDATE",
            record: {
              id: "unknown-story",
              prayer_status: "answered",
            },
          },
        ],
        responseChanges: [],
        reactionStoryIds: [],
      },
      [storyItem("known-story")],
      context
    );

    expect(plan.needsHeadRefresh).toBe(false);
    expect(plan.uncertainStoryIds.size).toBe(0);
  });
});
