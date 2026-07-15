import { describe, expect, it } from "vitest";
import {
  compareFeedOrderDesc,
  decodeFeedCursor,
  encodeFeedCursor,
  feedItemToGlobalLast,
  filterItemsAfterCursor,
  isItemAfterGlobalLast,
} from "./cursor";
import {
  mapStoryToFeedItem,
  mapVideoResponseToFeedItem,
  mergeFeedItems,
  paginateFeedItems,
} from "./aggregateHelpers";
import { buildStory, buildVideoResponse } from "./testFixtures";

describe("community feed composite cursor", () => {
  it("encodes and decodes a stable composite cursor", () => {
    const items = [
      mapStoryToFeedItem(
        buildStory({ id: "story-abc", created_at: "2026-07-18T20:15:00.000Z" })
      ),
      mapStoryToFeedItem(
        buildStory({ id: "story-def", created_at: "2026-07-18T20:14:00.000Z" })
      ),
    ];
    const { nextCursor } = paginateFeedItems(items, 1, null, { hasMore: true });
    const decoded = decodeFeedCursor(nextCursor);

    expect(decoded?.version).toBe(2);
    expect(decoded?.globalLast.dedupeKey).toBe("story:story-abc");
    expect(decoded?.story).toEqual({
      createdAt: "2026-07-18T20:15:00.000Z",
      id: "story-abc",
    });
  });

  it("does not skip or repeat same-timestamp stories across pages", () => {
    const sharedTime = "2026-07-18T20:15:00.000Z";
    const items = mergeFeedItems(
      [
        mapStoryToFeedItem(buildStory({ id: "a", created_at: sharedTime })),
        mapStoryToFeedItem(buildStory({ id: "b", created_at: sharedTime })),
        mapStoryToFeedItem(buildStory({ id: "c", created_at: sharedTime })),
      ],
      []
    );

    const pageOne = paginateFeedItems(items, 2);
    const pageTwoItems = filterItemsAfterCursor(
      items,
      decodeFeedCursor(pageOne.nextCursor)
    );
    const pageTwo = paginateFeedItems(pageTwoItems, 2);

    const ids = [...pageOne.page, ...pageTwo.page].map((item) => item.canonicalId);
    expect(ids).toEqual(["c", "b", "a"]);
    expect(new Set(ids).size).toBe(3);
    expect(pageTwo.nextCursor).toBeNull();
  });

  it("does not skip or repeat same-timestamp story and response across pages", () => {
    const sharedTime = "2026-07-18T20:15:00.000Z";
    const parent = buildStory({ id: "parent-1", created_at: sharedTime });
    const items = mergeFeedItems(
      [mapStoryToFeedItem(buildStory({ id: "story-1", created_at: sharedTime }))],
      [
        mapVideoResponseToFeedItem(
          buildVideoResponse({
            id: "resp-1",
            story_id: "parent-1",
            created_at: sharedTime,
          }),
          parent
        ),
      ]
    );

    const pageOne = paginateFeedItems(items, 1, null, { hasMore: true });
    const pageTwoItems = filterItemsAfterCursor(
      items,
      decodeFeedCursor(pageOne.nextCursor)
    );
    const pageTwo = paginateFeedItems(pageTwoItems, 1, decodeFeedCursor(pageOne.nextCursor), {
      hasMore: false,
    });

    expect([...pageOne.page, ...pageTwo.page]).toHaveLength(2);
    expect(new Set([...pageOne.page, ...pageTwo.page].map((i) => i.dedupeKey)).size).toBe(
      2
    );
  });

  it("deduplicates duplicate source rows across adjacent pages", () => {
    const storyItem = mapStoryToFeedItem(
      buildStory({ id: "dup", created_at: "2026-07-18T20:15:00.000Z" })
    );
    const merged = mergeFeedItems([storyItem, storyItem], []);
    expect(merged).toHaveLength(1);
    const { page, nextCursor } = paginateFeedItems(merged, 1, null, {
      hasMore: false,
    });
    expect(page).toHaveLength(1);
    expect(nextCursor).toBeNull();
  });

  it("orders mixed canonical types deterministically by publishedAt then dedupeKey", () => {
    const t = "2026-07-18T20:15:00.000Z";
    const parent = buildStory({ id: "parent-x" });
    const merged = mergeFeedItems(
      [mapStoryToFeedItem(buildStory({ id: "z-story", created_at: t }))],
      [
        mapVideoResponseToFeedItem(
          buildVideoResponse({ id: "z-resp", story_id: "parent-x", created_at: t }),
          parent
        ),
      ]
    );

    expect(merged.map((item) => item.dedupeKey)).toEqual([
      "story:z-story",
      "prayer_video_response:z-resp",
    ]);
    expect(
      compareFeedOrderDesc(
        { publishedAt: t, dedupeKey: "story:z-story" },
        { publishedAt: t, dedupeKey: "prayer_video_response:z-resp" }
      )
    ).toBeLessThan(0);
  });

  it("treats the cursor item itself as not after the cursor", () => {
    const item = mapStoryToFeedItem(buildStory({ id: "cursor-item" }));
    const globalLast = feedItemToGlobalLast(item);
    expect(isItemAfterGlobalLast(item, globalLast)).toBe(false);
  });
});
