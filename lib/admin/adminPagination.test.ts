import { describe, expect, it } from "vitest";
import {
  ADMIN_REPORTS_PAGE_LIMIT,
  ADMIN_STORIES_PAGE_LIMIT,
  buildAdminKeysetOrFilter,
  decodeAdminListCursor,
  encodeAdminListCursor,
  nextAdminCursorFromRows,
} from "./adminPagination";

describe("adminPagination", () => {
  it("uses bounded page limits", () => {
    expect(ADMIN_STORIES_PAGE_LIMIT).toBeLessThanOrEqual(200);
    expect(ADMIN_REPORTS_PAGE_LIMIT).toBeLessThanOrEqual(200);
  });

  it("round-trips cursors", () => {
    const encoded = encodeAdminListCursor({
      createdAt: "2026-07-18T12:00:00.000Z",
      id: "story-1",
    });
    expect(decodeAdminListCursor(encoded)).toEqual({
      createdAt: "2026-07-18T12:00:00.000Z",
      id: "story-1",
    });
  });

  it("builds keyset filters for descending created_at", () => {
    expect(
      buildAdminKeysetOrFilter({
        createdAt: "2026-07-18T12:00:00.000Z",
        id: "story-1",
      })
    ).toContain("created_at.lt.");
  });

  it("returns next cursor only when page is full", () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      created_at: `2026-07-18T12:00:0${index}.000Z`,
      id: `story-${index}`,
    }));

    expect(nextAdminCursorFromRows(rows, 100)).toEqual({
      hasMore: true,
      nextCursor: encodeAdminListCursor({
        createdAt: rows.at(-1)!.created_at,
        id: rows.at(-1)!.id,
      }),
    });

    expect(nextAdminCursorFromRows(rows.slice(0, 50), 100)).toEqual({
      hasMore: false,
      nextCursor: null,
    });
  });
});
