import { isSupabaseConfigured, supabase } from "../supabaseClient";
import {
  looksLikePreciseAddress,
  sanitizePublicLocationLabel,
} from "../testimonyMap/privacy";
import { geocodePublicLocation } from "../testimonyMap/geocodeLocation";
import type { PrayerConnectRequest } from "./types";
import {
  getPrayerTitle,
  inferMediaKind,
  inferPrayerCategory,
} from "./utils";
import { loadPublicResponseCounts } from "./responseCounts";
import {
  attachResolvedMediaToRequestsWithSession,
  StorageSignSession,
} from "../media/storageSignSession";
import {
  createLoadTraceId,
  isLoadDiagnosticsEnabled,
  logLoadDiagnostic,
  measureLoad,
} from "../perf/loadDiagnostics";
import { partitionPrayerTopics } from "./topicPartition";
import { isMockPrayerMode } from "./mockMode";
import { MOCK_PRAYER_REQUESTS } from "./mockPrayerData";

type RawStoryRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  image_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  status: string | null;
  prayer_status: string | null;
  created_at: string | null;
  topics?: string[] | null;
  public_lat?: number | string | null;
  public_lng?: number | string | null;
  public_location_label?: string | null;
  location_visibility?: string | null;
};

type ProfileRow = {
  id: string;
  show_location: boolean | null;
  display_name: string | null;
  avatar_url: string | null;
};

type ReactionRow = {
  story_id: string | null;
  reaction_type: string | null;
};

export type LoadPrayerConnectResult =
  | {
      ok: true;
      requests: PrayerConnectRequest[];
      nextCursor: string | null;
      hasMore: boolean;
    }
  | {
      ok: false;
      reason: "not-configured" | "offline" | "error";
      message: string;
    };

/** Initial Prayer discovery fetch — enough for first screen + map without 300-row overfetch. */
export const PRAYER_CONNECT_INITIAL_FETCH_LIMIT = 80;

/** Maximum rows fetched in a single Prayer discovery request. */
export const PRAYER_CONNECT_PAGE_FETCH_LIMIT = 80;

/** Hard cap for client-side accumulation during a session. */
export const PRAYER_CONNECT_MAX_ACCUMULATED = 300;

function isPrayerStory(storyType: string | null) {
  return (storyType || "").toLowerCase().includes("prayer");
}

async function loadBidirectionalBlockedUserIds(
  viewerUserId: string
): Promise<Set<string>> {
  const blocked = new Set<string>();

  const [iBlockedResult, blockedMeResult] = await Promise.all([
    supabase
      .from("blocked_users")
      .select("blocked_user_id")
      .eq("blocker_user_id", viewerUserId),
    supabase
      .from("blocked_users")
      .select("blocker_user_id")
      .eq("blocked_user_id", viewerUserId),
  ]);

  if (iBlockedResult.error) {
    console.error("Could not load blocked users:", iBlockedResult.error);
  } else {
    ((iBlockedResult.data as { blocked_user_id: string | null }[]) ?? []).forEach(
      (row) => {
        if (row.blocked_user_id) blocked.add(row.blocked_user_id);
      }
    );
  }

  if (blockedMeResult.error) {
    console.error("Could not load users who blocked viewer:", blockedMeResult.error);
  } else {
    ((blockedMeResult.data as { blocker_user_id: string | null }[]) ?? []).forEach(
      (row) => {
        if (row.blocker_user_id) blocked.add(row.blocker_user_id);
      }
    );
  }

  return blocked;
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function loadPrayerConnectRequests(options?: {
  /** When set, prayers hidden by this user are excluded at query time. */
  viewerUserId?: string | null;
  limit?: number;
  cursor?: string | null;
}): Promise<LoadPrayerConnectResult> {
  if (isMockPrayerMode()) {
    return {
      ok: true,
      requests: MOCK_PRAYER_REQUESTS,
      nextCursor: null,
      hasMore: false,
    };
  }

  if (!isSupabaseConfigured) {
    return {
      ok: false,
      reason: "not-configured",
      message:
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.",
    };
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return {
      ok: false,
      reason: "offline",
      message: "You appear to be offline. Reconnect to load Prayer Connect.",
    };
  }

  try {
    const fetchLimit = Math.min(
      Math.max(options?.limit ?? PRAYER_CONNECT_INITIAL_FETCH_LIMIT, 1),
      PRAYER_CONNECT_PAGE_FETCH_LIMIT
    );
    const traceId = createLoadTraceId("prayer-load");
    let hiddenStoryIds: string[] = [];
    let blockedAuthorIds = new Set<string>();
    if (options?.viewerUserId) {
      const [hiddenResult, blockedResult] = await Promise.all([
        supabase
          .from("prayer_hidden_stories")
          .select("story_id")
          .eq("user_id", options.viewerUserId),
        loadBidirectionalBlockedUserIds(options.viewerUserId),
      ]);

      blockedAuthorIds = blockedResult;

      const hiddenError = hiddenResult.error;
      if (!hiddenError) {
        hiddenStoryIds = ((hiddenResult.data as { story_id: string | null }[]) ?? [])
          .map((row) => row.story_id)
          .filter((id): id is string => Boolean(id));
      } else if (!/relation|does not exist|could not find/i.test(hiddenError.message)) {
        console.error("Could not load hidden prayers for viewer:", hiddenError);
      }
    }

    const selectWithGeo =
      "id, user_id, name, location, story_type, story_text, image_url, video_url, thumbnail_url, status, prayer_status, created_at, topics, public_lat, public_lng, public_location_label, location_visibility";
    const selectWithTopics =
      "id, user_id, name, location, story_type, story_text, image_url, video_url, thumbnail_url, status, prayer_status, created_at, topics";
    const selectBasic =
      "id, user_id, name, location, story_type, story_text, image_url, video_url, thumbnail_url, status, prayer_status, created_at";

    let data: RawStoryRow[] | null = null;
    let errorMessage: string | null = null;

    const attempts = [selectWithGeo, selectWithTopics, selectBasic];

    for (const select of attempts) {
      let query = supabase
        .from("stories")
        .select(select)
        .eq("status", "approved")
        .is("removed_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(fetchLimit);

      if (options?.cursor) {
        const [createdAt, id] = options.cursor.split("|");
        if (createdAt && id) {
          query = query.or(
            `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`
          );
        }
      }

      if (hiddenStoryIds.length > 0) {
        query = query.not("id", "in", `(${hiddenStoryIds.join(",")})`);
      }

      const result = await query;

      if (!result.error && result.data) {
        data = result.data as unknown as RawStoryRow[];
        break;
      }

      // Older schemas may lack removed_at — retry without it once per select shape.
      if (result.error && /removed_at/i.test(result.error.message)) {
        let fallbackQuery = supabase
          .from("stories")
          .select(select)
          .eq("status", "approved")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(fetchLimit);

        if (options?.cursor) {
          const [createdAt, id] = options.cursor.split("|");
          if (createdAt && id) {
            fallbackQuery = fallbackQuery.or(
              `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`
            );
          }
        }

        if (hiddenStoryIds.length > 0) {
          fallbackQuery = fallbackQuery.not(
            "id",
            "in",
            `(${hiddenStoryIds.join(",")})`
          );
        }

        const fallback = await fallbackQuery;
        if (!fallback.error && fallback.data) {
          data = fallback.data as unknown as RawStoryRow[];
          break;
        }
        errorMessage = fallback.error?.message ?? result.error.message;
      } else {
        errorMessage = result.error?.message ?? errorMessage;
      }
    }

    if (!data) {
      return {
        ok: false,
        reason: "error",
        message: errorMessage ?? "Could not load prayer requests.",
      };
    }

    const rawStories = data
      .filter((story) => isPrayerStory(story.story_type))
      .filter(
        (story) =>
          !story.user_id ||
          !blockedAuthorIds.has(story.user_id)
      );

    const userIds = [
      ...new Set(
        rawStories
          .map((story) => story.user_id)
          .filter((value): value is string => Boolean(value))
      ),
    ];

    const profileMap = new Map<
      string,
      { showLocation: boolean; displayName: string | null; avatarUrl: string | null }
    >();

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, show_location, display_name, avatar_url")
        .in("id", userIds);

      ((profiles as ProfileRow[]) ?? []).forEach((profile) => {
        profileMap.set(profile.id, {
          showLocation: profile.show_location !== false,
          displayName: profile.display_name,
          avatarUrl: profile.avatar_url,
        });
      });
    }

    const storyIds = rawStories.map((story) => story.id);
    const reactionMap = new Map<
      string,
      { praying: number; encouraged: number }
    >();

    if (storyIds.length > 0) {
      const { data: reactions } = await supabase
        .from("story_reactions")
        .select("story_id, reaction_type")
        .in("story_id", storyIds);

      ((reactions as ReactionRow[]) ?? []).forEach((reaction) => {
        if (!reaction.story_id) return;
        const current = reactionMap.get(reaction.story_id) ?? {
          praying: 0,
          encouraged: 0,
        };
        if (reaction.reaction_type === "praying") current.praying += 1;
        if (reaction.reaction_type === "encouraged") current.encouraged += 1;
        reactionMap.set(reaction.story_id, current);
      });
    }

    const requests: PrayerConnectRequest[] = rawStories
      .filter((story) => story.prayer_status !== "paused")
      .map((story) => {
      const profile = story.user_id ? profileMap.get(story.user_id) : undefined;
      const canShowLocation =
        profile?.showLocation !== false &&
        story.location_visibility !== "none";

      const storedLat = toNumber(story.public_lat);
      const storedLng = toNumber(story.public_lng);
      const hasStoredCoords = storedLat != null && storedLng != null;

      const fallbackGeocoded =
        !hasStoredCoords && canShowLocation && story.location
          ? geocodePublicLocation(story.location, story.id)
          : null;

      const publicLabel = canShowLocation
        ? story.public_location_label ||
          (story.location && !looksLikePreciseAddress(story.location)
            ? sanitizePublicLocationLabel(story.location)
            : null) ||
          fallbackGeocoded?.label ||
          null
        : null;

      const partitioned = partitionPrayerTopics(story.topics);
      const category = inferPrayerCategory(
        story.story_type,
        story.story_text,
        story.topics
      );

      const mediaKind = inferMediaKind(
        story.video_url,
        story.image_url,
        story.thumbnail_url
      );

      const body = story.story_text?.trim() || "";
      const isAnonymous =
        !story.name?.trim() ||
        story.name.trim().toLowerCase() === "anonymous" ||
        partitioned.metaKeys.includes("anonymous");

      const isUrgent =
        partitioned.metaKeys.includes("urgent") ||
        /\b(urgent|emergency|crisis|immediate)\b/i.test(
          `${story.story_type || ""} ${body}`
        );

      const prayerStatus =
        story.prayer_status === "answered"
          ? "answered"
          : story.prayer_status === "paused"
            ? "paused"
            : "active";

      return {
        id: story.id,
        userId: story.user_id,
        displayName: isAnonymous
          ? null
          : profile?.displayName || story.name || null,
        avatarUrl: isAnonymous ? null : profile?.avatarUrl || null,
        title: getPrayerTitle(story.story_text),
        body,
        locationLabel: publicLabel,
        category: category.id,
        categoryLabel: category.label,
        mediaKind,
        imageUrl: story.image_url,
        videoUrl: story.video_url,
        thumbnailUrl: story.thumbnail_url,
        prayerStatus,
        createdAt: story.created_at,
        lat: canShowLocation
          ? hasStoredCoords
            ? storedLat
            : fallbackGeocoded?.lat ?? null
          : null,
        lng: canShowLocation
          ? hasStoredCoords
            ? storedLng
            : fallbackGeocoded?.lng ?? null
          : null,
        distanceMiles: null,
        prayingCount: reactionMap.get(story.id)?.praying ?? 0,
        encouragementCount: reactionMap.get(story.id)?.encouraged ?? 0,
        responseCount: 0,
        isAnonymous,
        isUrgent,
        topics: story.topics ?? [],
      };
    });

    const responseCounts = await loadPublicResponseCounts(
      requests.map((request) => request.id)
    );

    const requestsWithCounts = requests.map((request) => ({
      ...request,
      responseCount: responseCounts.get(request.id) ?? 0,
    }));

    const signSession = new StorageSignSession();
    const withMedia = await measureLoad(
      "prayer",
      "media-resolution",
      traceId,
      () => attachResolvedMediaToRequestsWithSession(requestsWithCounts, signSession),
      {
        recordsFetched: requestsWithCounts.length,
        signOperations: signSession.getSignOperationCount(),
      }
    );

    const lastRaw = rawStories.at(-1);
    const nextCursor =
      lastRaw?.created_at && lastRaw.id
        ? `${lastRaw.created_at}|${lastRaw.id}`
        : null;
    const hasMore = rawStories.length >= fetchLimit;

    if (isLoadDiagnosticsEnabled()) {
      logLoadDiagnostic({
        traceId,
        loader: "prayer",
        phase: "initial-load-complete",
        durationMs: 0,
        recordsFetched: withMedia.length,
        signOperations: signSession.getSignOperationCount(),
        dbQueries: 4,
      });
    }

    return {
      ok: true,
      requests: withMedia,
      nextCursor: hasMore ? nextCursor : null,
      hasMore,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "error",
      message:
        error instanceof Error
          ? error.message
          : "Could not load prayer requests.",
    };
  }
}
