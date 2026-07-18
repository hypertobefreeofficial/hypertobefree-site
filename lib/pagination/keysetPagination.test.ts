import { describe, expect, it } from "vitest";
import {
  decodeCreatedAtIdCursor,
  encodeCreatedAtIdCursor,
  selectKeysetPage,
} from "./keysetPagination";

type Row = { created_at: string; id: string };

function buildRows(count: number, sameTimestamp = false): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    created_at: sameTimestamp
      ? "2026-07-18T12:00:00.000Z"
      : `2026-07-18T12:00:${String(index).padStart(2, "0")}.000Z`,
    id: `story-${String(index).padStart(3, "0")}`,
  }));
}

describe("keyset pagination", () => {
  it("round-trips cursors", () => {
    const encoded = encodeCreatedAtIdCursor({
      createdAt: "2026-07-18T12:00:00.000Z",
      id: "story-001",
    });
    expect(decodeCreatedAtIdCursor(encoded)).toEqual({
      createdAt: "2026-07-18T12:00:00.000Z",
      id: "story-001",
    });
  });

  it("does not duplicate or skip rows across pages", () => {
    const rows = buildRows(25);
    const seen = new Set<string>();
    let cursor: string | null = null;

    for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
      const decoded = decodeCreatedAtIdCursor(cursor);
      const { page, nextCursor, hasMore } = selectKeysetPage(rows, decoded, 10);

      page.forEach((row) => {
        expect(seen.has(row.id)).toBe(false);
        seen.add(row.id);
      });

      if (!hasMore) {
        expect(nextCursor).toBeNull();
        break;
      }

      expect(nextCursor).not.toBeNull();
      cursor = nextCursor;
    }

    expect(seen.size).toBe(rows.length);
  });

  it("handles multiple rows sharing the same created_at", () => {
    const rows = buildRows(12, true);
    const seen = new Set<string>();
    let cursor: string | null = null;

    while (true) {
      const decoded = decodeCreatedAtIdCursor(cursor);
      const { page, nextCursor, hasMore } = selectKeysetPage(rows, decoded, 5);

      page.forEach((row) => seen.add(row.id));

      if (!hasMore) {
        expect(nextCursor).toBeNull();
        break;
      }

      cursor = nextCursor;
    }

    expect(seen.size).toBe(12);
  });

  it("returns an empty final page when the cursor is past the end", () => {
    const rows = buildRows(3);
    const last = [...rows].sort((a, b) => (a.id > b.id ? -1 : 1)).at(-1)!;
    const { page, hasMore, nextCursor } = selectKeysetPage(
      rows,
      { createdAt: "2020-01-01T00:00:00.000Z", id: "story-000" },
      10
    );

    expect(page).toHaveLength(0);
    expect(hasMore).toBe(false);
    expect(nextCursor).toBeNull();
    expect(last).toBeDefined();
  });
});
