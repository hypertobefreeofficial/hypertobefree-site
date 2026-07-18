import { describe, expect, it } from "vitest";
import {
  decodeSearchStoryCursor,
  encodeSearchStoryCursor,
  SEARCH_STORIES_PAGE_LIMIT,
} from "./loadSearchStories";

describe("loadSearchStories pagination helpers", () => {
  it("uses a bounded page limit", () => {
    expect(SEARCH_STORIES_PAGE_LIMIT).toBeLessThanOrEqual(200);
    expect(SEARCH_STORIES_PAGE_LIMIT).toBeGreaterThan(0);
  });

  it("round-trips cursors", () => {
    const encoded = encodeSearchStoryCursor({
      createdAt: "2026-07-18T12:00:00.000Z",
      id: "story-1",
    });
    expect(decodeSearchStoryCursor(encoded)).toEqual({
      createdAt: "2026-07-18T12:00:00.000Z",
      id: "story-1",
    });
  });
});
