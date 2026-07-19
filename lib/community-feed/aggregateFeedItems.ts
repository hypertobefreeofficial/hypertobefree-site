import { supabase } from "../supabaseClient";
import {
  appendDemoFieldsToSelect,
  applyGenuinePublicDemoFilter,
  DEMO_RESPONSE_FIELD_SELECT,
  DEMO_STORY_FIELD_SELECT,
  getDemoContentSchemaCapabilities,
  type DemoContentSchemaCapabilities,
} from "../demo-content/eligibility";
import { decodeFeedCursor } from "./cursor";
import {
  buildEligibleResponseFeedItems,
  comparePublishedAtDesc,
  filterEligibleStories,
  filterItemsAfterCursor,
  findMissingParentStoryIds,
  indexStoriesById,
  mapStoryToFeedItem,
  mergeFeedItems,
  paginateFeedItems,
} from "./aggregateHelpers";
import { isStoryFeedEligible } from "./eligibility";
import { getCommunityFeedSchemaCapabilities } from "./schemaCapabilities";
import {
  buildSourceKeysetOrFilter,
  lastSourceKeysetFromRows,
  type SourceKeysetPosition,
} from "./sourceKeyset";
import type {
  CommunityFeedFilter,
  CommunityFeedItem,
  CommunityFeedStoryRecord,
  CommunityFeedVideoResponseRecord,
} from "./types";

/** Default merged feed page size returned to FreedomFeed. */
export const COMMUNITY_FEED_PAGE_LIMIT_DEFAULT = 40;

/** Minimum story rows fetched per source batch (>= page limit). */
export const COMMUNITY_FEED_STORY_SOURCE_FETCH_MIN = 50;

/** Maximum video-response rows fetched per source batch. */
export const COMMUNITY_FEED_RESPONSE_SOURCE_FETCH_MAX = 30;

/** Safety cap on source refetch loops for large same-timestamp groups. */
export const COMMUNITY_FEED_SOURCE_FETCH_MAX_ITERATIONS = 20;

const STORY_SELECT_BASE =
  "id, user_id, name, location, story_type, story_text, overlay_text, overlay_x, overlay_y, caption_style, caption_font, caption_background, caption_template, caption_color, caption_size, caption_align, video_template, htbf_watermark_enabled, silhouette_watermark_enabled, shared_htbf_intro_enabled, image_url, video_url, status, created_at, prayer_status, answered_at, answered_text, creation_mode, ai_suggestions";

const RESPONSE_SELECT_BASE =
  "id, story_id, user_id, video_url, status, created_at";

function buildStorySelect(options: {
  includeRemovedAt: boolean;
  includeThumbnailUrl: boolean;
  demoCapabilities: DemoContentSchemaCapabilities;
}) {
  let select = STORY_SELECT_BASE;
  if (options.includeThumbnailUrl) {
    select += ", thumbnail_url";
  }
  if (options.includeRemovedAt) {
    select += ", removed_at";
  }
  return appendDemoFieldsToSelect(
    select,
    "stories",
    options.demoCapabilities,
    DEMO_STORY_FIELD_SELECT
  );
}

function buildResponseSelect(options: {
  includeRemovedAt: boolean;
  includeThumbnailUrl: boolean;
  demoCapabilities: DemoContentSchemaCapabilities;
}) {
  let select = RESPONSE_SELECT_BASE;
  if (options.includeThumbnailUrl) {
    select += ", thumbnail_url";
  }
  if (options.includeRemovedAt) {
    select += ", removed_at";
  }
  return appendDemoFieldsToSelect(
    select,
    "prayer_video_responses",
    options.demoCapabilities,
    DEMO_RESPONSE_FIELD_SELECT
  );
}

function computeStoryFetchLimit(pageLimit: number) {
  return Math.max(pageLimit, COMMUNITY_FEED_STORY_SOURCE_FETCH_MIN);
}

function computeResponseFetchLimit(pageLimit: number) {
  return Math.min(
    computeStoryFetchLimit(pageLimit),
    COMMUNITY_FEED_RESPONSE_SOURCE_FETCH_MAX
  );
}

export type LoadCommunityFeedOptions = {
  filter?: CommunityFeedFilter;
  limit?: number;
  /** Encoded composite cursor from prior page. */
  cursor?: string | null;
  viewerUserId?: string | null;
  blockedUserIds?: string[];
  includeVideoResponses?: boolean;
};

export type LoadCommunityFeedResult =
  | {
      ok: true;
      items: CommunityFeedItem[];
      nextCursor: string | null;
    }
  | { ok: false; message: string };

/**
 * Database predicate (previous, unsafe):
 *   stories: `.lte('created_at', cursor.publishedAt)`
 *   responses: `.lte('created_at', cursor.publishedAt)`
 *
 * Database predicate (current, keyset-safe):
 *   per source, descending (created_at, id):
 *   `.or('created_at.lt.{createdAt},and(created_at.eq.{createdAt},id.lt.{id})')`
 *   with `.order('created_at', { ascending: false }).order('id', { ascending: false })`
 */
async function loadApprovedStoriesBatch(
  storySelect: string,
  removedAtFilterAvailable: boolean,
  demoCapabilities: DemoContentSchemaCapabilities,
  options: {
    limit: number;
    keyset: SourceKeysetPosition | null;
  }
) {
  if (!removedAtFilterAvailable) {
    return { data: [] as CommunityFeedStoryRecord[], error: null };
  }

  let query = supabase
    .from("stories")
    .select(storySelect)
    .eq("status", "approved")
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(options.limit);

  query = applyGenuinePublicDemoFilter(query, "stories", demoCapabilities);

  if (options.keyset) {
    query = query.or(buildSourceKeysetOrFilter(options.keyset));
  }

  return query;
}

async function loadApprovedVideoResponsesBatch(
  responseSelect: string,
  removedAtFilterAvailable: boolean,
  demoCapabilities: DemoContentSchemaCapabilities,
  options: {
    limit: number;
    keyset: SourceKeysetPosition | null;
    includeVideoResponses: boolean;
  }
) {
  if (options.includeVideoResponses === false) {
    return { data: [] as CommunityFeedVideoResponseRecord[], error: null };
  }

  if (!removedAtFilterAvailable) {
    return { data: [] as CommunityFeedVideoResponseRecord[], error: null };
  }

  let query = supabase
    .from("prayer_video_responses")
    .select(responseSelect)
    .eq("status", "approved")
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(options.limit);

  query = applyGenuinePublicDemoFilter(
    query,
    "prayer_video_responses",
    demoCapabilities
  );

  if (options.keyset) {
    query = query.or(buildSourceKeysetOrFilter(options.keyset));
  }

  return query;
}

async function attachMissingParents(
  responseRows: CommunityFeedVideoResponseRecord[],
  storyById: Map<string, CommunityFeedStoryRecord>,
  storySelect: string,
  storyEligibilityOptions: {
    blockedUserIds: Set<string>;
    removedAtFilterAvailable: boolean;
    demoIsolationActive: boolean;
  },
  demoCapabilities: DemoContentSchemaCapabilities
) {
  const missingParentIds = findMissingParentStoryIds(responseRows, storyById);

  if (
    missingParentIds.length === 0 ||
    !storyEligibilityOptions.removedAtFilterAvailable
  ) {
    return;
  }

  let query = supabase
    .from("stories")
    .select(storySelect)
    .in("id", missingParentIds)
    .eq("status", "approved")
    .is("removed_at", null);

  query = applyGenuinePublicDemoFilter(query, "stories", demoCapabilities);

  const { data: parentRows, error: parentError } = await query;

  if (parentError) {
    console.error(
      "[community-feed] Could not load parent stories for video responses:",
      parentError.message
    );
    return;
  }

  for (const parent of (parentRows as unknown as CommunityFeedStoryRecord[]) ??
    []) {
    if (isStoryFeedEligible(parent, storyEligibilityOptions)) {
      storyById.set(parent.id, parent);
    }
  }
}

/**
 * Aggregates eligible public content from canonical tables without duplicating media.
 * Stories and approved public video responses merge into one chronologically sorted list.
 */
export async function loadCommunityFeedItems(
  options: LoadCommunityFeedOptions = {}
): Promise<LoadCommunityFeedResult> {
  const blockedSet = new Set(options.blockedUserIds ?? []);
  const pageLimit = options.limit ?? COMMUNITY_FEED_PAGE_LIMIT_DEFAULT;
  const storyFetchLimit = computeStoryFetchLimit(pageLimit);
  const responseFetchLimit = computeResponseFetchLimit(pageLimit);
  const decodedCursor = decodeFeedCursor(options.cursor);

  const capabilities = await getCommunityFeedSchemaCapabilities();
  const demoCapabilities = await getDemoContentSchemaCapabilities();
  const storySelect = buildStorySelect({
    includeRemovedAt: capabilities.stories.hasRemovedAt,
    includeThumbnailUrl: capabilities.stories.hasThumbnailUrl,
    demoCapabilities,
  });
  const responseSelect = buildResponseSelect({
    includeRemovedAt: capabilities.prayerVideoResponses.hasRemovedAt,
    includeThumbnailUrl: capabilities.prayerVideoResponses.hasThumbnailUrl,
    demoCapabilities,
  });

  const storyEligibilityOptions = {
    blockedUserIds: blockedSet,
    removedAtFilterAvailable: capabilities.stories.hasRemovedAt,
    demoIsolationActive: demoCapabilities.genuinePublicIsolationActive,
  };
  const responseEligibilityOptions = {
    blockedUserIds: blockedSet,
    removedAtFilterAvailable: capabilities.prayerVideoResponses.hasRemovedAt,
    demoIsolationActive: demoCapabilities.genuinePublicIsolationActive,
  };

  let storyKeyset = decodedCursor?.story ?? null;
  let responseKeyset = decodedCursor?.prayerVideoResponse ?? null;

  let mergedPool: CommunityFeedItem[] = [];
  let iterations = 0;
  let lastStoryBatchFull = false;
  let lastResponseBatchFull = false;
  let lastStoryExhausted = true;
  let lastResponseExhausted = true;

  while (iterations < COMMUNITY_FEED_SOURCE_FETCH_MAX_ITERATIONS) {
    iterations += 1;

    const [storiesResult, responsesResult] = await Promise.all([
      loadApprovedStoriesBatch(
        storySelect,
        capabilities.stories.hasRemovedAt,
        demoCapabilities,
        {
          limit: storyFetchLimit,
          keyset: storyKeyset,
        }
      ),
      loadApprovedVideoResponsesBatch(
        responseSelect,
        capabilities.prayerVideoResponses.hasRemovedAt,
        demoCapabilities,
        {
          limit: responseFetchLimit,
          keyset: responseKeyset,
          includeVideoResponses: options.includeVideoResponses ?? true,
        }
      ),
    ]);

    if (storiesResult.error) {
      return {
        ok: false,
        message: storiesResult.error.message || "Could not load community feed.",
      };
    }

    if (responsesResult.error) {
      return {
        ok: false,
        message:
          responsesResult.error.message ||
          "Could not load community feed video responses.",
      };
    }

    const storyRows = (storiesResult.data as CommunityFeedStoryRecord[]) ?? [];
    const responseRows =
      (responsesResult.data as CommunityFeedVideoResponseRecord[]) ?? [];

    if (storyRows.length === 0 && responseRows.length === 0) {
      break;
    }

    const stories = filterEligibleStories(storyRows, storyEligibilityOptions);
    const storyById = indexStoriesById(stories);

    await attachMissingParents(
      responseRows,
      storyById,
      storySelect,
      storyEligibilityOptions,
      demoCapabilities
    );

    const responseItems = buildEligibleResponseFeedItems(
      responseRows,
      storyById,
      responseEligibilityOptions
    );
    const storyItems = stories.map(mapStoryToFeedItem);
    const batchMerged = mergeFeedItems(storyItems, responseItems);

    const poolByKey = new Map(mergedPool.map((item) => [item.dedupeKey, item]));
    for (const item of batchMerged) poolByKey.set(item.dedupeKey, item);
    mergedPool = [...poolByKey.values()].sort(comparePublishedAtDesc);

    const nextStoryKeyset = lastSourceKeysetFromRows(storyRows);
    const nextResponseKeyset = lastSourceKeysetFromRows(responseRows);

    const storyExhausted = storyRows.length < storyFetchLimit;
    const responseExhausted = responseRows.length < responseFetchLimit;
    lastStoryBatchFull = storyRows.length === storyFetchLimit;
    lastResponseBatchFull = responseRows.length === responseFetchLimit;
    lastStoryExhausted = storyExhausted;
    lastResponseExhausted = responseExhausted;

    storyKeyset = nextStoryKeyset ?? storyKeyset;
    responseKeyset = nextResponseKeyset ?? responseKeyset;

    const afterGlobal = filterItemsAfterCursor(mergedPool, decodedCursor);
    if (afterGlobal.length >= pageLimit) {
      break;
    }

    if (storyExhausted && responseExhausted) {
      break;
    }

    if (
      nextStoryKeyset &&
      storyKeyset?.createdAt === nextStoryKeyset.createdAt &&
      storyKeyset?.id === nextStoryKeyset.id &&
      nextResponseKeyset &&
      responseKeyset?.createdAt === nextResponseKeyset.createdAt &&
      responseKeyset?.id === nextResponseKeyset.id
    ) {
      break;
    }
  }

  const afterGlobal = filterItemsAfterCursor(mergedPool, decodedCursor);
  let hasMore =
    afterGlobal.length > pageLimit ||
    (lastStoryBatchFull && !lastStoryExhausted) ||
    (lastResponseBatchFull && !lastResponseExhausted);

  if (hasMore && afterGlobal.length <= pageLimit) {
    const [probeStories, probeResponses] = await Promise.all([
      loadApprovedStoriesBatch(
        storySelect,
        capabilities.stories.hasRemovedAt,
        demoCapabilities,
        {
          limit: 1,
          keyset: storyKeyset,
        }
      ),
      loadApprovedVideoResponsesBatch(
        responseSelect,
        capabilities.prayerVideoResponses.hasRemovedAt,
        demoCapabilities,
        {
          limit: 1,
          keyset: responseKeyset,
          includeVideoResponses: options.includeVideoResponses ?? true,
        }
      ),
    ]);

    const probeStoryCount = ((probeStories.data as CommunityFeedStoryRecord[]) ?? [])
      .length;
    const probeResponseCount = (
      (probeResponses.data as CommunityFeedVideoResponseRecord[]) ?? []
    ).length;
    hasMore = probeStoryCount > 0 || probeResponseCount > 0;
  }

  const { page, nextCursor } = paginateFeedItems(
    afterGlobal,
    pageLimit,
    decodedCursor
      ? {
          story: decodedCursor.story,
          prayerVideoResponse: decodedCursor.prayerVideoResponse,
        }
      : null,
    { hasMore }
  );

  return { ok: true, items: page, nextCursor };
}

// Re-export for parent loader tests without importing supabase paths.
export { isStoryFeedEligible } from "./eligibility";
