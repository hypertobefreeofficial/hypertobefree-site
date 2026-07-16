import { describe, expect, it } from "vitest";
import {
  buildEligibleResponseFeedItems,
  comparePublishedAtDesc,
  dedupeFeedItems,
  findMissingParentStoryIds,
  indexStoriesById,
  mapStoryToFeedItem,
  mapVideoResponseToFeedItem,
  mergeFeedItems,
  paginateFeedItems,
} from "./aggregateHelpers";
import { buildStory, buildVideoResponse } from "./testFixtures";

describe("community feed aggregate helpers", () => {
  it("merges duplicate canonical rows into one feed item", () => {
    const story = buildStory({ id: "story-dup" });
    const storyItem = mapStoryToFeedItem(story);
    const merged = dedupeFeedItems([storyItem, storyItem]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.dedupeKey).toBe("story:story-dup");
  });

  it("includes approved responses with eligible parents and attaches parent ids", () => {
    const parent = buildStory({ id: "parent-1", story_text: "Need prayer" });
    const response = buildVideoResponse({
      id: "resp-1",
      story_id: "parent-1",
    });
    const storyById = indexStoriesById([parent]);
    const items = buildEligibleResponseFeedItems([response], storyById, {
      blockedUserIds: new Set(),
      removedAtFilterAvailable: true,
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.parentCanonicalId).toBe("parent-1");
    expect(items[0]?.canonicalId).toBe("resp-1");
  });

  it("excludes responses with ineligible or missing parents", () => {
    const removedParent = buildStory({
      id: "parent-removed",
      removed_at: "2026-07-14T09:00:00.000Z",
    });
    const pendingParent = buildStory({ id: "parent-pending", status: "pending" });
    const storyById = indexStoriesById([removedParent, pendingParent]);

    const items = buildEligibleResponseFeedItems(
      [
        buildVideoResponse({ id: "r1", story_id: "parent-removed" }),
        buildVideoResponse({ id: "r2", story_id: "parent-pending" }),
        buildVideoResponse({ id: "r3", story_id: "orphan-parent" }),
      ],
      storyById,
      {
        blockedUserIds: new Set(),
        removedAtFilterAvailable: true,
      }
    );

    expect(items).toHaveLength(0);
  });

  it("loads missing parent ids only for orphan responses", () => {
    const loaded = buildStory({ id: "loaded" });
    const storyById = indexStoriesById([loaded]);
    const missing = findMissingParentStoryIds(
      [
        buildVideoResponse({ story_id: "loaded" }),
        buildVideoResponse({ story_id: "missing" }),
      ],
      storyById
    );

    expect(missing).toEqual(["missing"]);
  });

  it("excludes blocked responders and blocked parent authors", () => {
    const blockedParent = buildStory({ id: "parent-blocked", user_id: "blocked-author" });
    const goodParent = buildStory({ id: "parent-good", user_id: "good-author" });
    const storyById = indexStoriesById([blockedParent, goodParent]);
    const blocked = new Set(["blocked-author", "blocked-responder"]);

    const items = buildEligibleResponseFeedItems(
      [
        buildVideoResponse({
          id: "blocked-responder",
          story_id: "parent-good",
          user_id: "blocked-responder",
        }),
        buildVideoResponse({
          id: "blocked-parent",
          story_id: "parent-blocked",
          user_id: "responder-2",
        }),
        buildVideoResponse({
          id: "allowed",
          story_id: "parent-good",
          user_id: "responder-3",
        }),
      ],
      storyById,
      {
        blockedUserIds: blocked,
        removedAtFilterAvailable: true,
      }
    );

    expect(items.map((item) => item.canonicalId)).toEqual(["allowed"]);
  });

  it("sorts by publishedAt desc with dedupeKey tie-breaker", () => {
    const older = mapStoryToFeedItem(
      buildStory({
        id: "older",
        created_at: "2026-07-14T10:00:00.000Z",
      })
    );
    const newer = mapVideoResponseToFeedItem(
      buildVideoResponse({
        id: "newer-response",
        created_at: "2026-07-14T12:00:00.000Z",
      }),
      buildStory({ id: "parent-1" })
    );

    const merged = mergeFeedItems([older], [newer]);
    expect(merged[0]?.canonicalId).toBe("newer-response");
    expect(comparePublishedAtDesc(older, newer)).toBeGreaterThan(0);
  });

  it("paginates without loading unbounded items and emits composite cursor", () => {
    const items = [
      mapStoryToFeedItem(buildStory({ id: "1", created_at: "2026-07-14T13:00:00.000Z" })),
      mapStoryToFeedItem(buildStory({ id: "2", created_at: "2026-07-14T12:00:00.000Z" })),
      mapStoryToFeedItem(buildStory({ id: "3", created_at: "2026-07-14T11:00:00.000Z" })),
    ];
    const { page, nextCursor } = paginateFeedItems(items, 2);
    expect(page).toHaveLength(2);
    expect(page[1]?.canonicalId).toBe("2");
    expect(nextCursor).toBeTruthy();
    expect(nextCursor).not.toBe("2026-07-14T12:00:00.000Z");
  });

  it("returns no cursor when the feed is exhausted", () => {
    const items = [
      mapStoryToFeedItem(buildStory({ id: "1", created_at: "2026-07-14T13:00:00.000Z" })),
    ];
    const { page, nextCursor } = paginateFeedItems(items, 2);
    expect(page).toHaveLength(1);
    expect(nextCursor).toBeNull();
  });
});
