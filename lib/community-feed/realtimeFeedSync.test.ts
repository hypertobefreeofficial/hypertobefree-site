import { describe, expect, it } from "vitest";
import type { FeedDisplayItem, FeedStoryDisplay } from "./enrichFeedItems";
import {
  applyRemovalKeysToLoadedFeed,
  collectChildResponseDedupeKeys,
  collectRemovalKeysForStoryChange,
  mergeLoadedPagesAfterRealtime,
  planRealtimeFeedSync,
} from "./realtimeFeedSync";
import { storyDedupeKey, videoResponseDedupeKey } from "./provenance";

const sharedTime = "2026-07-18T20:00:00.000Z";

function storyItem(
  id: string,
  createdAt = sharedTime,
  status = "approved"
): FeedStoryDisplay {
  return {
    kind: "story",
    dedupeKey: storyDedupeKey(id),
    id,
    user_id: "author-1",
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
    status,
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

function responseItem(
  id: string,
  parentStoryId: string,
  createdAt = sharedTime
): FeedDisplayItem {
  return {
    kind: "prayer_video_response",
    dedupeKey: videoResponseDedupeKey(id),
    id,
    user_id: "responder-1",
    name: "Responder",
    location: null,
    video_url: "story-videos/x.webm",
    signed_video_url: "https://signed.example/video",
    signed_thumbnail_url: "https://signed.example/poster",
    created_at: createdAt,
    parentStoryId,
    parentStoryUserId: "author-1",
    parentStoryTitle: "Prayer",
    parentStoryAuthor: "Author",
  };
}

const context = {
  blockedUserIds: new Set<string>(),
  removedAtFilterAvailable: true,
};

describe("realtime feed sync across loaded pages", () => {
  const pageOne = [storyItem("head-1", "2026-07-18T22:00:00.000Z")];
  const pageTwo = [
    storyItem("tail-story", "2026-07-18T20:00:00.000Z"),
    responseItem("tail-response", "parent-tail", "2026-07-18T19:00:00.000Z"),
  ];
  const loaded = [...pageOne, ...pageTwo];

  it("removes a rejected story from a later loaded page", () => {
    const plan = planRealtimeFeedSync(
      {
        storyChanges: [
          {
            eventType: "UPDATE",
            record: {
              id: "tail-story",
              status: "rejected",
              removed_at: null,
              user_id: "author-1",
            },
          },
        ],
        responseChanges: [],
        reactionStoryIds: [],
      },
      loaded,
      context
    );

    const next = applyRemovalKeysToLoadedFeed(loaded, plan.removalKeys);
    expect(next.map((item) => item.id)).toEqual(["head-1", "tail-response"]);
  });

  it("removes a removed story from a later loaded page", () => {
    const plan = planRealtimeFeedSync(
      {
        storyChanges: [
          {
            eventType: "UPDATE",
            record: {
              id: "tail-story",
              status: "approved",
              removed_at: "2026-07-18T21:00:00.000Z",
              user_id: "author-1",
            },
          },
        ],
        responseChanges: [],
        reactionStoryIds: [],
      },
      loaded,
      context
    );

    const next = applyRemovalKeysToLoadedFeed(loaded, plan.removalKeys);
    expect(next.some((item) => item.id === "tail-story")).toBe(false);
  });

  it("removes a story when status changes away from approved", () => {
    const plan = planRealtimeFeedSync(
      {
        storyChanges: [
          {
            eventType: "UPDATE",
            record: {
              id: "tail-story",
              status: "submitted",
              removed_at: null,
              user_id: "author-1",
            },
          },
        ],
        responseChanges: [],
        reactionStoryIds: [],
      },
      loaded,
      context
    );

    const next = applyRemovalKeysToLoadedFeed(loaded, plan.removalKeys);
    expect(next.some((item) => item.id === "tail-story")).toBe(false);
  });

  it("removes a story when removed_at becomes non-null", () => {
    const result = collectRemovalKeysForStoryChange(
      {
        eventType: "UPDATE",
        record: {
          id: "tail-story",
          status: "approved",
          removed_at: "2026-07-18T21:00:00.000Z",
          user_id: "author-1",
        },
      },
      loaded,
      context
    );

    const next = applyRemovalKeysToLoadedFeed(loaded, result.removalKeys);
    expect(next.some((item) => item.id === "tail-story")).toBe(false);
  });

  it("removes a rejected response from a later loaded page", () => {
    const plan = planRealtimeFeedSync(
      {
        storyChanges: [],
        responseChanges: [
          {
            eventType: "UPDATE",
            record: {
              id: "tail-response",
              status: "rejected",
              removed_at: null,
              user_id: "responder-1",
              story_id: "parent-tail",
            },
          },
        ],
        reactionStoryIds: [],
      },
      loaded,
      context
    );

    const next = applyRemovalKeysToLoadedFeed(loaded, plan.removalKeys);
    expect(next.map((item) => item.id)).toEqual(["head-1", "tail-story"]);
  });

  it("removes a removed response from a later loaded page", () => {
    const plan = planRealtimeFeedSync(
      {
        storyChanges: [],
        responseChanges: [
          {
            eventType: "UPDATE",
            record: {
              id: "tail-response",
              status: "approved",
              removed_at: "2026-07-18T21:00:00.000Z",
              user_id: "responder-1",
              story_id: "parent-tail",
            },
          },
        ],
        reactionStoryIds: [],
      },
      loaded,
      context
    );

    const next = applyRemovalKeysToLoadedFeed(loaded, plan.removalKeys);
    expect(next.some((item) => item.id === "tail-response")).toBe(false);
  });

  it("removes child responses when parent story becomes ineligible", () => {
    const loadedWithChild = [
      storyItem("head-1", "2026-07-18T22:00:00.000Z"),
      responseItem("child-1", "parent-tail"),
      responseItem("child-2", "parent-tail"),
    ];

    const childKeys = collectChildResponseDedupeKeys(loadedWithChild, "parent-tail");
    expect(childKeys.size).toBe(2);

    const plan = planRealtimeFeedSync(
      {
        storyChanges: [
          {
            eventType: "DELETE",
            record: null,
            oldRecord: { id: "parent-tail" },
          },
        ],
        responseChanges: [],
        reactionStoryIds: [],
      },
      loadedWithChild,
      context
    );

    const next = applyRemovalKeysToLoadedFeed(loadedWithChild, plan.removalKeys);
    expect(next.map((item) => item.id)).toEqual(["head-1"]);
  });

  it("leaves later pages intact for unrelated realtime events", () => {
    const plan = planRealtimeFeedSync(
      {
        storyChanges: [
          {
            eventType: "UPDATE",
            record: {
              id: "head-1",
              status: "approved",
              removed_at: null,
              user_id: "author-1",
              prayer_status: "answered",
            },
          },
        ],
        responseChanges: [],
        reactionStoryIds: [],
      },
      loaded,
      context
    );

    expect(plan.removalKeys.size).toBe(0);
    const next = applyRemovalKeysToLoadedFeed(loaded, plan.removalKeys);
    expect(next).toHaveLength(3);
  });

  it("preserves remaining item order after removal", () => {
    const plan = planRealtimeFeedSync(
      {
        storyChanges: [
          {
            eventType: "UPDATE",
            record: {
              id: "tail-story",
              status: "removed",
              removed_at: "2026-07-18T21:00:00.000Z",
              user_id: "author-1",
            },
          },
        ],
        responseChanges: [],
        reactionStoryIds: [],
      },
      loaded,
      context
    );

    const next = applyRemovalKeysToLoadedFeed(loaded, plan.removalKeys);
    expect(next.map((item) => item.id)).toEqual(["head-1", "tail-response"]);
  });

  it("does not create duplicate entries after removal", () => {
    const plan = planRealtimeFeedSync(
      {
        storyChanges: [
          {
            eventType: "UPDATE",
            record: {
              id: "tail-story",
              status: "rejected",
              removed_at: null,
              user_id: "author-1",
            },
          },
        ],
        responseChanges: [],
        reactionStoryIds: [],
      },
      loaded,
      context
    );

    const next = applyRemovalKeysToLoadedFeed(loaded, plan.removalKeys);
    expect(new Set(next.map((item) => item.dedupeKey)).size).toBe(next.length);
  });

  it("preserves tail pages during head refresh merge", () => {
    const refreshedHead = [storyItem("head-new", "2026-07-18T23:00:00.000Z")];
    const next = mergeLoadedPagesAfterRealtime(loaded, {
      removalKeys: new Set(),
      refreshedHead,
      headSlotCount: 1,
    });

    expect(next.map((item) => item.id)).toEqual([
      "head-new",
      "tail-story",
      "tail-response",
    ]);
  });
});
