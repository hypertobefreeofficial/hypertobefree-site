import type { CommunityFeedCanonicalType, CommunityFeedItem } from "./types";
import type { SourceKeysetPosition } from "./sourceKeyset";
import {
  responseToSourceKeyset,
  storyToSourceKeyset,
} from "./sourceKeyset";

/** Global position of the last merged item on a page. */
export type FeedGlobalLastKey = {
  publishedAt: string;
  canonicalType: CommunityFeedCanonicalType;
  canonicalId: string;
  dedupeKey: string;
};

/**
 * Composite cursor v2 — per-source keyset positions plus global merge position.
 * Matches merged sort: publishedAt desc, then dedupeKey desc.
 */
export type FeedCompositeCursor = {
  version: 2;
  story: SourceKeysetPosition | null;
  prayerVideoResponse: SourceKeysetPosition | null;
  globalLast: FeedGlobalLastKey;
};

/** @deprecated v1 shape — decoded only for in-session backward compatibility. */
type FeedCompositeCursorV1 = {
  publishedAt: string;
  canonicalType: CommunityFeedCanonicalType;
  canonicalId: string;
  dedupeKey: string;
};

export function compareFeedOrderDesc(
  a: Pick<CommunityFeedItem, "publishedAt" | "dedupeKey">,
  b: Pick<CommunityFeedItem, "publishedAt" | "dedupeKey">
) {
  const byTime = b.publishedAt.localeCompare(a.publishedAt);
  if (byTime !== 0) return byTime;
  return b.dedupeKey.localeCompare(a.dedupeKey);
}

/** True when `item` appears strictly after `cursor` in descending feed order (next page). */
export function isItemAfterGlobalLast(
  item: Pick<CommunityFeedItem, "publishedAt" | "dedupeKey">,
  globalLast: FeedGlobalLastKey
) {
  if (item.dedupeKey === globalLast.dedupeKey) return false;

  return (
    compareFeedOrderDesc(
      { publishedAt: globalLast.publishedAt, dedupeKey: globalLast.dedupeKey },
      item
    ) < 0
  );
}

export function feedItemToGlobalLast(item: CommunityFeedItem): FeedGlobalLastKey {
  return {
    publishedAt: item.publishedAt,
    canonicalType: item.canonicalType,
    canonicalId: item.canonicalId,
    dedupeKey: item.dedupeKey,
  };
}

export function resolveSourceKeysetsAfterPage(
  page: CommunityFeedItem[],
  prior: Pick<
    FeedCompositeCursor,
    "story" | "prayerVideoResponse"
  > | null
): {
  story: SourceKeysetPosition | null;
  prayerVideoResponse: SourceKeysetPosition | null;
} {
  let story = prior?.story ?? null;
  let prayerVideoResponse = prior?.prayerVideoResponse ?? null;

  for (const item of page) {
    if (item.canonicalType === "story" && item.story) {
      story = storyToSourceKeyset(item.story);
    }
    if (item.canonicalType === "prayer_video_response" && item.videoResponse) {
      prayerVideoResponse = responseToSourceKeyset(item.videoResponse);
    }
  }

  return { story, prayerVideoResponse };
}

export function buildPageCursor(
  page: CommunityFeedItem[],
  prior: Pick<
    FeedCompositeCursor,
    "story" | "prayerVideoResponse"
  > | null
): FeedCompositeCursor {
  const last = page[page.length - 1];
  if (!last) {
    throw new Error("Cannot build cursor from empty page.");
  }

  const sourceKeysets = resolveSourceKeysetsAfterPage(page, prior);

  return {
    version: 2,
    story: sourceKeysets.story,
    prayerVideoResponse: sourceKeysets.prayerVideoResponse,
    globalLast: feedItemToGlobalLast(last),
  };
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isSourceKeyset(value: unknown): value is SourceKeysetPosition {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SourceKeysetPosition>;
  return (
    typeof candidate.createdAt === "string" && typeof candidate.id === "string"
  );
}

function isGlobalLastKey(value: unknown): value is FeedGlobalLastKey {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FeedGlobalLastKey>;
  return (
    typeof candidate.publishedAt === "string" &&
    (candidate.canonicalType === "story" ||
      candidate.canonicalType === "prayer_video_response") &&
    typeof candidate.canonicalId === "string" &&
    typeof candidate.dedupeKey === "string"
  );
}

function v1ToV2(parsed: FeedCompositeCursorV1): FeedCompositeCursor {
  return {
    version: 2,
    story: null,
    prayerVideoResponse: null,
    globalLast: {
      publishedAt: parsed.publishedAt,
      canonicalType: parsed.canonicalType,
      canonicalId: parsed.canonicalId,
      dedupeKey: parsed.dedupeKey,
    },
  };
}

export function encodeFeedCursor(cursor: FeedCompositeCursor): string {
  return base64UrlEncode(JSON.stringify(cursor));
}

export function decodeFeedCursor(
  encoded: string | null | undefined
): FeedCompositeCursor | null {
  if (!encoded) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(encoded)) as Partial<
      FeedCompositeCursor & FeedCompositeCursorV1
    >;

    if (parsed.version === 2 && isGlobalLastKey(parsed.globalLast)) {
      return {
        version: 2,
        story: isSourceKeyset(parsed.story) ? parsed.story : null,
        prayerVideoResponse: isSourceKeyset(parsed.prayerVideoResponse)
          ? parsed.prayerVideoResponse
          : null,
        globalLast: parsed.globalLast,
      };
    }

    if (
      typeof parsed.publishedAt === "string" &&
      (parsed.canonicalType === "story" ||
        parsed.canonicalType === "prayer_video_response") &&
      typeof parsed.canonicalId === "string" &&
      typeof parsed.dedupeKey === "string"
    ) {
      return v1ToV2(parsed as FeedCompositeCursorV1);
    }

    return null;
  } catch {
    return null;
  }
}

export function filterItemsAfterCursor(
  items: CommunityFeedItem[],
  cursor: FeedCompositeCursor | null
) {
  if (!cursor) return items;
  return items.filter((item) => isItemAfterGlobalLast(item, cursor.globalLast));
}

/** @deprecated use feedItemToGlobalLast */
export function feedItemToCursor(item: CommunityFeedItem): FeedGlobalLastKey {
  return feedItemToGlobalLast(item);
}

/** @deprecated use isItemAfterGlobalLast */
export function isItemAfterCursor(
  item: Pick<CommunityFeedItem, "publishedAt" | "dedupeKey">,
  cursor: FeedGlobalLastKey
) {
  return isItemAfterGlobalLast(item, cursor);
}
