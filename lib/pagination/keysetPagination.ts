/** Shared keyset (cursor) pagination helpers for created_at DESC, id DESC ordering. */

export type CreatedAtIdCursor = {
  createdAt: string;
  id: string;
};

export function encodeCreatedAtIdCursor(cursor: CreatedAtIdCursor | null) {
  if (!cursor) return null;
  return `${cursor.createdAt}|${cursor.id}`;
}

export function decodeCreatedAtIdCursor(value: string | null | undefined) {
  if (!value) return null;
  const [createdAt, id] = value.split("|");
  if (!createdAt || !id) return null;
  return { createdAt, id };
}

export function buildCreatedAtIdKeysetOrFilter(cursor: CreatedAtIdCursor) {
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}

export function compareCreatedAtIdDesc(
  a: { created_at: string; id: string },
  b: { created_at: string; id: string }
) {
  if (a.created_at !== b.created_at) {
    return a.created_at > b.created_at ? -1 : 1;
  }
  return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
}

/** Client-side simulation of keyset page selection — used in tests. */
export function selectKeysetPage<T extends { created_at: string; id: string }>(
  rows: T[],
  cursor: CreatedAtIdCursor | null,
  limit: number
) {
  const sorted = [...rows].sort(compareCreatedAtIdDesc);
  const filtered = cursor
    ? sorted.filter((row) => {
        if (row.created_at < cursor.createdAt) return true;
        if (row.created_at > cursor.createdAt) return false;
        return row.id < cursor.id;
      })
    : sorted;

  const page = filtered.slice(0, limit);
  const last = page.at(-1);
  const hasMore = filtered.length > limit;
  const nextCursor =
    last && hasMore
      ? encodeCreatedAtIdCursor({ createdAt: last.created_at, id: last.id })
      : null;

  return { page, nextCursor, hasMore };
}
