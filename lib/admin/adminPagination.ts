/** Admin moderation list page sizes — bounded per request, not total records. */
export const ADMIN_STORIES_PAGE_LIMIT = 100;
export const ADMIN_REPORTS_PAGE_LIMIT = 100;

export type AdminListCursor = {
  createdAt: string;
  id: string;
};

export function encodeAdminListCursor(cursor: AdminListCursor | null) {
  if (!cursor) return null;
  return `${cursor.createdAt}|${cursor.id}`;
}

export function decodeAdminListCursor(value: string | null | undefined) {
  if (!value) return null;
  const [createdAt, id] = value.split("|");
  if (!createdAt || !id) return null;
  return { createdAt, id };
}

export function buildAdminKeysetOrFilter(cursor: AdminListCursor) {
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}

export function nextAdminCursorFromRows<
  T extends { created_at?: string | null; id?: string | null }
>(rows: T[], limit: number) {
  const last = rows.at(-1);
  if (!last?.created_at || !last.id || rows.length < limit) {
    return { nextCursor: null as string | null, hasMore: false };
  }
  return {
    nextCursor: encodeAdminListCursor({
      createdAt: last.created_at,
      id: last.id,
    }),
    hasMore: true,
  };
}
