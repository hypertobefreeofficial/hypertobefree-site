import { describe, expect, it } from "vitest";
import {
  buildSourceKeysetOrFilter,
  filterRowsAfterSourceKeyset,
  isRowAfterSourceKeyset,
  lastSourceKeysetFromRows,
  sortRowsBySourceKeysetDesc,
} from "./sourceKeyset";
import { decodeFeedCursor, encodeFeedCursor, filterItemsAfterCursor } from "./cursor";
import {
  mapStoryToFeedItem,
  mapVideoResponseToFeedItem,
  mergeFeedItems,
  paginateFeedItems,
} from "./aggregateHelpers";
import { buildStory, buildVideoResponse } from "./testFixtures";
import type {
  CommunityFeedStoryRecord,
  CommunityFeedVideoResponseRecord,
} from "./types";

const sharedTime = "2026-07-18T20:15:00.000Z";

function storyIds(rows: CommunityFeedStoryRecord[]) {
  return sortRowsBySourceKeysetDesc(rows).map((row) => row.id);
}

function responseIds(rows: CommunityFeedVideoResponseRecord[]) {
  return sortRowsBySourceKeysetDesc(rows).map((row) => row.id);
}

function queryStories(
  allStories: CommunityFeedStoryRecord[],
  options: { keyset: { createdAt: string; id: string } | null; limit: number }
) {
  const approved = allStories.filter(
    (row) => row.status === "approved" && !row.removed_at
  );
  const afterKeyset = filterRowsAfterSourceKeyset(approved, options.keyset);
  return sortRowsBySourceKeysetDesc(afterKeyset).slice(0, options.limit);
}

function queryResponses(
  allResponses: CommunityFeedVideoResponseRecord[],
  options: { keyset: { createdAt: string; id: string } | null; limit: number }
) {
  const approved = allResponses.filter(
    (row) => row.status === "approved" && !row.removed_at
  );
  const afterKeyset = filterRowsAfterSourceKeyset(approved, options.keyset);
  return sortRowsBySourceKeysetDesc(afterKeyset).slice(0, options.limit);
}

function loadMergedPage(options: {
  allStories: CommunityFeedStoryRecord[];
  allResponses: CommunityFeedVideoResponseRecord[];
  pageLimit: number;
  cursor: string | null;
  storyFetchLimit: number;
  responseFetchLimit: number;
  parents?: CommunityFeedStoryRecord[];
}) {
  const decoded = decodeFeedCursor(options.cursor);
  let storyKeyset = decoded?.story ?? null;
  let responseKeyset = decoded?.prayerVideoResponse ?? null;
  const parentById = new Map((options.parents ?? []).map((row) => [row.id, row]));

  let mergedPool = mergeFeedItems([], []);
  let iterations = 0;
  let lastStoryBatchFull = false;
  let lastResponseBatchFull = false;
  let lastStoryExhausted = true;
  let lastResponseExhausted = true;

  while (iterations < 20) {
    iterations += 1;
    const storyRows = queryStories(options.allStories, {
      keyset: storyKeyset,
      limit: options.storyFetchLimit,
    });
    const responseRows = queryResponses(options.allResponses, {
      keyset: responseKeyset,
      limit: options.responseFetchLimit,
    });

    if (storyRows.length === 0 && responseRows.length === 0) break;

    const storyItems = storyRows.map(mapStoryToFeedItem);
    const responseItems = responseRows
      .map((row) => {
        const parent =
          parentById.get(row.story_id) ??
          options.allStories.find((story) => story.id === row.story_id);
        if (!parent || parent.status !== "approved" || parent.removed_at) {
          return null;
        }
        return mapVideoResponseToFeedItem(row, parent);
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    mergedPool = mergeFeedItems(
      [...mergedPool.filter((item) => item.canonicalType === "story"), ...storyItems],
      [
        ...mergedPool.filter((item) => item.canonicalType === "prayer_video_response"),
        ...responseItems,
      ]
    );

    const storyExhausted = storyRows.length < options.storyFetchLimit;
    const responseExhausted = responseRows.length < options.responseFetchLimit;
    lastStoryBatchFull = storyRows.length === options.storyFetchLimit;
    lastResponseBatchFull = responseRows.length === options.responseFetchLimit;
    lastStoryExhausted = storyExhausted;
    lastResponseExhausted = responseExhausted;

    const nextStoryKeyset = lastSourceKeysetFromRows(storyRows);
    const nextResponseKeyset = lastSourceKeysetFromRows(responseRows);
    storyKeyset = nextStoryKeyset ?? storyKeyset;
    responseKeyset = nextResponseKeyset ?? responseKeyset;

    const afterGlobal = filterItemsAfterCursor(mergedPool, decoded);
    if (afterGlobal.length >= options.pageLimit) break;

    if (storyExhausted && responseExhausted) break;
  }

  const afterGlobal = filterItemsAfterCursor(mergedPool, decoded);
  let hasMore =
    afterGlobal.length > options.pageLimit ||
    (lastStoryBatchFull && !lastStoryExhausted) ||
    (lastResponseBatchFull && !lastResponseExhausted);

  if (hasMore && afterGlobal.length <= options.pageLimit) {
    const probeStories = queryStories(options.allStories, {
      keyset: storyKeyset,
      limit: 1,
    });
    const probeResponses = queryResponses(options.allResponses, {
      keyset: responseKeyset,
      limit: 1,
    });
    hasMore = probeStories.length > 0 || probeResponses.length > 0;
  }

  return paginateFeedItems(afterGlobal, options.pageLimit, decoded, { hasMore });
}

describe("source keyset predicates", () => {
  it("uses created_at/id OR predicate for descending keyset pagination", () => {
    expect(buildSourceKeysetOrFilter({ createdAt: sharedTime, id: "story-5" })).toBe(
      `created_at.lt.${sharedTime},and(created_at.eq.${sharedTime},id.lt.story-5)`
    );
  });

  it("returns rows strictly after the source keyset", () => {
    const rows = [
      buildStory({ id: "c", created_at: sharedTime }),
      buildStory({ id: "b", created_at: sharedTime }),
      buildStory({ id: "a", created_at: sharedTime }),
    ];

    const next = filterRowsAfterSourceKeyset(rows, {
      createdAt: sharedTime,
      id: "b",
    });

    expect(storyIds(next)).toEqual(["a"]);
    expect(isRowAfterSourceKeyset(rows[2], { createdAt: sharedTime, id: "b" })).toBe(
      true
    );
    expect(isRowAfterSourceKeyset(rows[1], { createdAt: sharedTime, id: "b" })).toBe(
      false
    );
  });
});

describe("source-query pagination integration model", () => {
  it("paginates more than one page of stories with the exact same timestamp", () => {
    const allStories = ["s-09", "s-08", "s-07", "s-06", "s-05"].map((id) =>
      buildStory({ id, created_at: sharedTime })
    );

    const pageOne = loadMergedPage({
      allStories,
      allResponses: [],
      pageLimit: 2,
      cursor: null,
      storyFetchLimit: 2,
      responseFetchLimit: 2,
    });
    const pageTwo = loadMergedPage({
      allStories,
      allResponses: [],
      pageLimit: 2,
      cursor: pageOne.nextCursor,
      storyFetchLimit: 2,
      responseFetchLimit: 2,
    });
    const pageThree = loadMergedPage({
      allStories,
      allResponses: [],
      pageLimit: 2,
      cursor: pageTwo.nextCursor,
      storyFetchLimit: 2,
      responseFetchLimit: 2,
    });

    const ids = [
      ...pageOne.page,
      ...pageTwo.page,
      ...pageThree.page,
    ].map((item) => item.canonicalId);

    expect(ids).toEqual(["s-09", "s-08", "s-07", "s-06", "s-05"]);
    expect(pageThree.nextCursor).toBeNull();
  });

  it("paginates more than one page of responses with the exact same timestamp", () => {
    const parent = buildStory({ id: "parent-1", created_at: sharedTime });
    const allResponses = ["r-04", "r-03", "r-02", "r-01"].map((id) =>
      buildVideoResponse({ id, story_id: "parent-1", created_at: sharedTime })
    );

    const pageOne = loadMergedPage({
      allStories: [],
      allResponses,
      pageLimit: 2,
      cursor: null,
      storyFetchLimit: 2,
      responseFetchLimit: 2,
      parents: [parent],
    });
    const pageTwo = loadMergedPage({
      allStories: [],
      allResponses,
      pageLimit: 2,
      cursor: pageOne.nextCursor,
      storyFetchLimit: 2,
      responseFetchLimit: 2,
      parents: [parent],
    });

    const ids = [...pageOne.page, ...pageTwo.page].map((item) => item.canonicalId);
    expect(ids).toEqual(["r-04", "r-03", "r-02", "r-01"]);
    expect(pageTwo.nextCursor).toBeNull();
  });

  it("paginates mixed stories and responses with the exact same timestamp", () => {
    const parent = buildStory({ id: "parent-1", created_at: sharedTime });
    const allStories = [
      buildStory({ id: "story-z", created_at: sharedTime }),
      buildStory({ id: "story-y", created_at: sharedTime }),
    ];
    const allResponses = [
      buildVideoResponse({ id: "resp-z", story_id: "parent-1", created_at: sharedTime }),
      buildVideoResponse({ id: "resp-y", story_id: "parent-1", created_at: sharedTime }),
    ];

    const pageOne = loadMergedPage({
      allStories,
      allResponses,
      pageLimit: 3,
      cursor: null,
      storyFetchLimit: 2,
      responseFetchLimit: 2,
      parents: [parent],
    });
    const pageTwo = loadMergedPage({
      allStories,
      allResponses,
      pageLimit: 3,
      cursor: pageOne.nextCursor,
      storyFetchLimit: 2,
      responseFetchLimit: 2,
      parents: [parent],
    });

    const ids = [...pageOne.page, ...pageTwo.page].map((item) => item.canonicalId);
    expect(ids).toEqual(["story-z", "story-y", "resp-z", "resp-y"]);
  });

  it("handles a timestamp group larger than the story fetch limit", () => {
    const allStories = Array.from({ length: 7 }, (_, index) =>
      buildStory({ id: `bulk-${index}`, created_at: sharedTime })
    );

    const pageOne = loadMergedPage({
      allStories,
      allResponses: [],
      pageLimit: 3,
      cursor: null,
      storyFetchLimit: 2,
      responseFetchLimit: 2,
    });
    const pageTwo = loadMergedPage({
      allStories,
      allResponses: [],
      pageLimit: 3,
      cursor: pageOne.nextCursor,
      storyFetchLimit: 2,
      responseFetchLimit: 2,
    });
    const pageThree = loadMergedPage({
      allStories,
      allResponses: [],
      pageLimit: 3,
      cursor: pageTwo.nextCursor,
      storyFetchLimit: 2,
      responseFetchLimit: 2,
    });

    const ids = [
      ...pageOne.page,
      ...pageTwo.page,
      ...pageThree.page,
    ].map((item) => item.canonicalId);

    expect(ids).toHaveLength(7);
    expect(new Set(ids).size).toBe(7);
  });

  it("does not skip or repeat canonical IDs across three pages", () => {
    const allStories = Array.from({ length: 5 }, (_, index) =>
      buildStory({
        id: `page-${index}`,
        created_at: sharedTime,
      })
    );

    const pages = [];
    let cursor: string | null = null;
    for (let page = 0; page < 3; page += 1) {
      const result = loadMergedPage({
        allStories,
        allResponses: [],
        pageLimit: 2,
        cursor,
        storyFetchLimit: 2,
        responseFetchLimit: 2,
      });
      pages.push(result);
      cursor = result.nextCursor;
    }

    const ids = pages.flatMap((page) => page.page.map((item) => item.canonicalId));
    expect(ids).toEqual(["page-4", "page-3", "page-2", "page-1", "page-0"]);
    expect(pages[2].nextCursor).toBeNull();
  });

  it("encodes v2 cursor with per-source keysets", () => {
    const item = mapStoryToFeedItem(buildStory({ id: "cursor-story", created_at: sharedTime }));
    const { nextCursor } = paginateFeedItems(
      [item, mapStoryToFeedItem(buildStory({ id: "cursor-story-2", created_at: "2026-07-18T20:14:00.000Z" }))],
      1,
      null,
      { hasMore: true }
    );
    const decoded = decodeFeedCursor(nextCursor);
    expect(decoded?.version).toBe(2);
    expect(decoded?.story).toEqual({
      createdAt: sharedTime,
      id: "cursor-story",
    });
    expect(decoded?.globalLast.dedupeKey).toBe("story:cursor-story");
    expect(encodeFeedCursor(decoded!)).toBe(nextCursor);
  });

  it("keeps parent lookup working when parent and response are on different pages", () => {
    const parent = buildStory({ id: "parent-later", created_at: "2026-07-18T19:00:00.000Z" });
    const earlyStory = buildStory({ id: "early-story", created_at: sharedTime });
    const response = buildVideoResponse({
      id: "resp-later",
      story_id: "parent-later",
      created_at: "2026-07-18T18:00:00.000Z",
    });

    const pageOne = loadMergedPage({
      allStories: [earlyStory],
      allResponses: [response],
      pageLimit: 1,
      cursor: null,
      storyFetchLimit: 1,
      responseFetchLimit: 1,
      parents: [parent],
    });
    const pageTwo = loadMergedPage({
      allStories: [earlyStory, parent],
      allResponses: [response],
      pageLimit: 2,
      cursor: pageOne.nextCursor,
      storyFetchLimit: 1,
      responseFetchLimit: 1,
      parents: [parent],
    });

    expect(pageTwo.page.some((item) => item.canonicalId === "resp-later")).toBe(true);
    const responseItem = pageTwo.page.find(
      (item) => item.canonicalType === "prayer_video_response"
    );
    expect(responseItem?.parentCanonicalId).toBe("parent-later");
  });

  it("excludes blocked and removed rows inside a same-timestamp group without skipping eligible neighbors", () => {
    const allStories = [
      buildStory({ id: "ok-1", created_at: sharedTime }),
      buildStory({ id: "blocked-1", created_at: sharedTime, user_id: "blocked-user" }),
      buildStory({ id: "ok-2", created_at: sharedTime }),
      buildStory({
        id: "removed-1",
        created_at: sharedTime,
        removed_at: "2026-07-18T21:00:00.000Z",
      }),
      buildStory({ id: "ok-3", created_at: sharedTime }),
    ];

    const eligibleStories = allStories.filter(
      (row) =>
        row.status === "approved" &&
        !row.removed_at &&
        row.user_id !== "blocked-user"
    );

    const pageOne = loadMergedPage({
      allStories: eligibleStories,
      allResponses: [],
      pageLimit: 2,
      cursor: null,
      storyFetchLimit: 2,
      responseFetchLimit: 2,
    });
    const pageTwo = loadMergedPage({
      allStories: eligibleStories,
      allResponses: [],
      pageLimit: 2,
      cursor: pageOne.nextCursor,
      storyFetchLimit: 2,
      responseFetchLimit: 2,
    });

    const ids = [...pageOne.page, ...pageTwo.page].map((item) => item.canonicalId);
    expect(ids).toEqual(["ok-3", "ok-2", "ok-1"]);
  });
});
