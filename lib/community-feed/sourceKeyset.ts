import type {
  CommunityFeedStoryRecord,
  CommunityFeedVideoResponseRecord,
} from "./types";

/** Per-table keyset position for descending (created_at, id) pagination. */
export type SourceKeysetPosition = {
  createdAt: string;
  id: string;
};

/**
 * True when `row` sorts strictly before `cursor` in descending (created_at, id) order,
 * i.e. `row` belongs on a later page.
 */
export function isRowAfterSourceKeyset(
  row: { created_at: string | null; id: string },
  cursor: SourceKeysetPosition
) {
  const createdAt = row.created_at || "";
  if (createdAt !== cursor.createdAt) {
    return createdAt < cursor.createdAt;
  }
  return row.id < cursor.id;
}

export function filterRowsAfterSourceKeyset<
  T extends { created_at: string | null; id: string },
>(rows: T[], cursor: SourceKeysetPosition | null | undefined) {
  if (!cursor) return rows;
  return rows.filter((row) => isRowAfterSourceKeyset(row, cursor));
}

/** PostgREST `.or()` filter for descending keyset pagination. */
export function buildSourceKeysetOrFilter(cursor: SourceKeysetPosition) {
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}

export function sortRowsBySourceKeysetDesc<
  T extends { created_at: string | null; id: string },
>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const aCreated = a.created_at || "";
    const bCreated = b.created_at || "";
    const byTime = bCreated.localeCompare(aCreated);
    if (byTime !== 0) return byTime;
    return b.id.localeCompare(a.id);
  });
}

export function storyToSourceKeyset(
  story: Pick<CommunityFeedStoryRecord, "created_at" | "id">
): SourceKeysetPosition {
  return {
    createdAt: story.created_at || new Date(0).toISOString(),
    id: story.id,
  };
}

export function responseToSourceKeyset(
  response: Pick<CommunityFeedVideoResponseRecord, "created_at" | "id">
): SourceKeysetPosition {
  return {
    createdAt: response.created_at,
    id: response.id,
  };
}

export function lastSourceKeysetFromRows<
  T extends { created_at: string | null; id: string },
>(rows: T[]) {
  if (rows.length === 0) return null;
  const sorted = sortRowsBySourceKeysetDesc(rows);
  const last = sorted[sorted.length - 1];
  return {
    createdAt: last.created_at || new Date(0).toISOString(),
    id: last.id,
  };
}
