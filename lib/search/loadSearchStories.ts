import { supabase } from "../supabaseClient";

export const SEARCH_STORIES_PAGE_LIMIT = 120;

/** Soft guidance for diagnostics only — not a hard UI ceiling. */
export const SEARCH_STORIES_SOFT_PAGE_GUIDANCE = 20;

export type SearchStoryCursor = {
  createdAt: string;
  id: string;
};

export function encodeSearchStoryCursor(cursor: SearchStoryCursor | null) {
  if (!cursor) return null;
  return `${cursor.createdAt}|${cursor.id}`;
}

export function decodeSearchStoryCursor(value: string | null | undefined) {
  if (!value) return null;
  const [createdAt, id] = value.split("|");
  if (!createdAt || !id) return null;
  return { createdAt, id };
}

type SearchStoryRow = Record<string, unknown>;

export type LoadSearchStoriesResult =
  | {
      ok: true;
      rows: SearchStoryRow[];
      nextCursor: string | null;
      hasMore: boolean;
    }
  | { ok: false; message: string };

export async function loadSearchStoriesPage(options?: {
  cursor?: string | null;
  limit?: number;
}): Promise<LoadSearchStoriesResult> {
  const limit = Math.min(
    Math.max(options?.limit ?? SEARCH_STORIES_PAGE_LIMIT, 1),
    SEARCH_STORIES_PAGE_LIMIT
  );

  const metadataSelect =
    "id, user_id, name, location, content_type, story_type, story_text, image_url, video_url, thumbnail_url, overlay_text, overlay_x, overlay_y, caption_style, caption_font, caption_background, caption_color, caption_size, caption_align, video_template, topics, creation_mode, status, created_at";
  const legacySelect =
    "id, user_id, name, location, story_type, story_text, image_url, video_url, thumbnail_url, overlay_text, overlay_x, overlay_y, caption_style, caption_font, caption_background, caption_color, caption_size, caption_align, video_template, status, created_at";

  const cursor = decodeSearchStoryCursor(options?.cursor);

  const runQuery = async (select: string) => {
    let query = supabase
      .from("stories")
      .select(select)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
      );
    }

    return query;
  };

  const metadataResult = await runQuery(metadataSelect);
  if (!metadataResult.error && metadataResult.data) {
    const rows = metadataResult.data as unknown as SearchStoryRow[];
    const last = rows.at(-1) as { created_at?: string; id?: string } | undefined;
    const nextCursor =
      last?.created_at && last.id ? encodeSearchStoryCursor({
        createdAt: last.created_at,
        id: last.id,
      }) : null;
    return {
      ok: true,
      rows,
      nextCursor: rows.length >= limit ? nextCursor : null,
      hasMore: rows.length >= limit,
    };
  }

  if (
    metadataResult.error &&
    ["content_type", "topics", "creation_mode"].some((column) =>
      metadataResult.error?.message.includes(column)
    )
  ) {
    const legacyResult = await runQuery(legacySelect);
    if (!legacyResult.error && legacyResult.data) {
      const rows = legacyResult.data as unknown as SearchStoryRow[];
      const last = rows.at(-1) as { created_at?: string; id?: string } | undefined;
      const nextCursor =
        last?.created_at && last.id
          ? encodeSearchStoryCursor({ createdAt: last.created_at, id: last.id })
          : null;
      return {
        ok: true,
        rows,
        nextCursor: rows.length >= limit ? nextCursor : null,
        hasMore: rows.length >= limit,
      };
    }
    return {
      ok: false,
      message: legacyResult.error?.message ?? "Could not load search results.",
    };
  }

  return {
    ok: false,
    message: metadataResult.error?.message ?? "Could not load search results.",
  };
}
