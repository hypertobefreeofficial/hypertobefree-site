"use client";

import type * as React from "react";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from "react";
import Link from "next/link";
import {
  Bookmark,
  Copy,
  Download,
  Eye,
  EyeOff,
  Flag,
  Info,
  MoreHorizontal,
  Video,
  MessageCircleHeart,
  CheckCircle2,
  Share2,
  UserX,
  X,
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import {
  FEED_MEDIA_EL_CLASS,
  FEED_MEDIA_FRAME_CLASS,
} from "../lib/feedMediaClasses";
import {
  creationCenterStoryTemplates,
  type CreationCenterTemplateId,
} from "../lib/creationCenter";
import {
  isCreatorStudioFeedPost,
  readStoredCreatorStudioDesignFromStory,
} from "../lib/creatorStudioMetadata";
import CreatorStudioStoryRenderer from "./creation-center/CreatorStudioStoryRenderer";
import { FeedComposer } from "./FeedComposer";
import StoryMediaStamp from "./StoryMediaStamp";
import StoryOverlayText from "./StoryOverlayText";
import {
  COMMUNITY_FEED_PAGE_LIMIT_DEFAULT,
  filterFeedDisplayItems,
  loadCommunityFeed,
  type FeedDisplayItem,
  type FeedStoryDisplay,
  type FeedVideoResponseDisplay,
} from "../lib/community-feed/loadCommunityFeed";
import { canPersistentlyHideFeedItem } from "../lib/community-feed/canHideFeedItem";
import { buildVideoResponseSharePayload } from "../lib/community-feed/shareVideoResponse";
import {
  hidePrayer,
  loadHiddenPrayerIds,
  migrateLegacyHiddenPrayers,
} from "../lib/prayer-connect/hiddenPrayers";
import { loadBidirectionalBlockedUserIds } from "../lib/community-feed/blockedUsers";
import { mergeFeedDisplayPages } from "../lib/community-feed/mergeFeedState";
import { processRealtimeFeedUpdates } from "../lib/community-feed/processRealtimeFeedUpdates";
import {
  parseReactionRealtimePayload,
  parseResponseRealtimePayload,
  parseStoryRealtimePayload,
} from "../lib/community-feed/realtimePayload";
import type {
  RealtimeFeedSyncBatch,
  RealtimeResponseChange,
  RealtimeStoryChange,
} from "../lib/community-feed/realtimeFeedSync";
import { getCommunityFeedSchemaCapabilities } from "../lib/community-feed/schemaCapabilities";
import {
  feedMediaAspectClassName,
  getStoryFeedMediaAspect,
} from "../lib/community-feed/feedMediaAspect";
import {
  isCommunityFeedVisualValidationEnabled,
  VISUAL_VALIDATION_PAGE_2_CURSOR,
} from "../lib/community-feed/visualValidationMode";
import { formatFeedRelativeTime } from "../lib/community-feed/formatFeedRelativeTime";
import {
  MARK_PRAYER_ANSWERED_TEXT_MAX_LENGTH,
} from "../lib/community-feed/markPrayerAnsweredAuthorization";
import { markMyPrayerAnswered } from "../lib/prayer-connect/markMyPrayerAnswered";
import { ensureElementBelowFeedStickyHeader } from "../lib/navigation/feedScrollPadding";
import FeedScrollVideoPreview from "./community-feed/FeedScrollVideoPreview";
import FeedListItem from "./community-feed/FeedListItem";
import type { CommunityFeedPostCallbacks } from "./community-feed/types";
import { getCommunityFeedVisualValidationFixtures,
  FIXTURE_VIEWER_USER_ID,
} from "../lib/community-feed/visualValidationFixtures";
import { loadApprovedVideoResponsesByStoryIds } from "../lib/community-feed/loadParentApprovedVideoResponses";
import { loadViewerPendingVideoResponsesByStoryIds } from "../lib/community-feed/loadViewerPendingVideoResponses";
import { submitContentReport } from "../lib/prayer-connect/submitContentReport";
import {
  formatBlockedUserConfirmation,
  VIDEO_RESPONSE_REPORT_REASONS,
  VIDEO_RESPONSE_REPORT_SUCCESS,
} from "../lib/feed/formatFeedSafetyMessages";
import styles from "./FreedomFeed.module.css";

type ReactionType = "amen" | "praise_god" | "encouraged" | "praying";
const SELECTOR_REACTION_TYPES: ReactionType[] = [
  "amen",
  "praise_god",
  "encouraged",
];
type ReportReason =
  | "inappropriate"
  | "harassment_hate"
  | "violence_harmful"
  | "spam"
  | "other";

type FeedFilter =
  | "all"
  | "videos"
  | "testimony"
  | "praise"
  | "prayer"
  | "answered";

type CaptionStyle =
  | "classic-caption"
  | "bold-center"
  | "bottom-banner"
  | "highlight-box"
  | "scripture-card"
  | "praise-glow"
  | "testimony-quote"
  | "minimal-white"
  | "black-outline"
  | "soft-gradient"
  | "elegant-script";
type CaptionFont =
  | "classic"
  | "bold"
  | "scripture"
  | "praise"
  | "testimony"
  | "minimal"
  | "grace-script";
type CaptionColor =
  | "white"
  | "black"
  | "deep-navy"
  | "soft-gold"
  | "prayer-blue"
  | "warm-cream"
  | "praise-green"
  | `#${string}`;
type CaptionSize = "small" | "medium" | "large" | "extra-large";
type CaptionAlign = "left" | "center" | "right";
type CaptionBackground =
  | "none"
  | "soft-pill"
  | "glass-blur"
  | "dark-banner"
  | "glow-box"
  | "scripture-card";
type CaptionTemplate =
  | "testimony-light"
  | "prayer-calm"
  | "scripture-focus"
  | "freedom-glow"
  | "quiet-strength"
  | "celebration-praise";
type VideoTemplate =
  | "none"
  | "htbf-logo"
  | "freedom-silhouette"
  | "shared-through-htbf"
  | "freedom-story"
  | "prayer-moment"
  | "praise-report"
  | "god-did-it";

type ReactionRow = {
  story_id: string | null;
  user_id: string | null;
  reaction_type: string | null;
};

type ApprovedStory = FeedStoryDisplay;

type CreationTemplateMetadata = {
  id: CreationCenterTemplateId | "generated-creator-studio";
  label: string;
  imagePath: string;
};

const STORY_IMAGE_BUCKET = "story-images";
const FREEDOM_FEED_RETURN_STATE_KEY = "htbf_freedom_feed_return_state";

type FreedomFeedReturnState = {
  source: "freedom-feed";
  storyId: string;
  anchorId?: string;
  scrollY: number;
  storyViewportTop: number;
  savedAt: number;
};

function getFreedomFeedStoryElement(storyId: string) {
  if (typeof document === "undefined") return null;

  return document.getElementById(`freedom-feed-story-${storyId}`);
}

function readFreedomFeedReturnState() {
  if (typeof window === "undefined") return null;

  const rawState = window.sessionStorage.getItem(
    FREEDOM_FEED_RETURN_STATE_KEY
  );

  if (!rawState) return null;

  try {
    const state = JSON.parse(rawState) as Partial<FreedomFeedReturnState>;

    if (
      state.source !== "freedom-feed" ||
      typeof state.storyId !== "string" ||
      (state.anchorId !== undefined && typeof state.anchorId !== "string") ||
      typeof state.scrollY !== "number" ||
      typeof state.storyViewportTop !== "number" ||
      typeof state.savedAt !== "number"
    ) {
      return null;
    }

    if (Date.now() - state.savedAt > 1000 * 60 * 30) {
      window.sessionStorage.removeItem(FREEDOM_FEED_RETURN_STATE_KEY);
      return null;
    }

    return state as FreedomFeedReturnState;
  } catch {
    window.sessionStorage.removeItem(FREEDOM_FEED_RETURN_STATE_KEY);
    return null;
  }
}

function restoreFreedomFeedReturnPosition(
  savedState?: FreedomFeedReturnState | null,
  {
    clearAfterRestore = true,
  }: {
    clearAfterRestore?: boolean;
  } = {}
) {
  if (typeof window === "undefined") return;

  const state = savedState ?? readFreedomFeedReturnState();

  if (!state) return;

  window.scrollTo(0, Math.max(0, state.scrollY));

  window.requestAnimationFrame(() => {
    const storyElement = state.anchorId
      ? document.getElementById(state.anchorId)
      : getFreedomFeedStoryElement(state.storyId);

    if (storyElement) {
      const currentViewportTop = storyElement.getBoundingClientRect().top;
      const topDifference = currentViewportTop - state.storyViewportTop;

      if (Math.abs(topDifference) > 12) {
        window.scrollTo(0, Math.max(0, window.scrollY + topDifference));
      }

      ensureElementBelowFeedStickyHeader(storyElement);
    }

    if (clearAfterRestore) {
      window.sessionStorage.removeItem(FREEDOM_FEED_RETURN_STATE_KEY);
    }
  });
}

import {
  pauseAllFeedPreviewVideos,
  resumeFeedVideoAutoplay,
  suspendFeedVideoAutoplay,
} from "../hooks/useViewportVideoAutoplay";

const reportReasons: { label: string; value: ReportReason }[] = [
  { label: "Inappropriate content", value: "inappropriate" },
  { label: "Harassment or hate", value: "harassment_hate" },
  { label: "Violence or harmful content", value: "violence_harmful" },
  { label: "Spam or misleading", value: "spam" },
  { label: "Other", value: "other" },
];

function getCaptionStyle(value: string | null | undefined): CaptionStyle {
  if (
    value === "classic-caption" ||
    value === "bold-center" ||
    value === "bottom-banner" ||
    value === "highlight-box" ||
    value === "scripture-card" ||
    value === "praise-glow" ||
    value === "testimony-quote" ||
    value === "minimal-white" ||
    value === "black-outline" ||
    value === "soft-gradient" ||
    value === "elegant-script"
  ) {
    return value;
  }

  return "classic-caption";
}

function getCaptionColor(value: string | null | undefined): CaptionColor {
  if (
    value === "white" ||
    value === "black" ||
    value === "deep-navy" ||
    value === "soft-gold" ||
    value === "prayer-blue" ||
    value === "warm-cream" ||
    value === "praise-green"
  ) {
    return value;
  }

  if (value && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value as `#${string}`;
  }

  return "white";
}

function getCaptionSize(value: string | null | undefined): CaptionSize {
  if (
    value === "small" ||
    value === "medium" ||
    value === "large" ||
    value === "extra-large"
  ) {
    return value;
  }

  return "medium";
}

function getCaptionAlign(value: string | null | undefined): CaptionAlign {
  if (value === "left" || value === "center" || value === "right") {
    return value;
  }

  return "center";
}

function getCaptionFont(
  value: string | null | undefined,
  legacyStyle?: CaptionStyle | null
): CaptionFont {
  if (
    value === "classic" ||
    value === "bold" ||
    value === "scripture" ||
    value === "praise" ||
    value === "testimony" ||
    value === "minimal" ||
    value === "grace-script"
  ) {
    return value;
  }

  if (legacyStyle === "bold-center") return "bold";
  if (legacyStyle === "scripture-card") return "scripture";
  if (legacyStyle === "praise-glow") return "praise";
  if (legacyStyle === "testimony-quote") return "testimony";
  if (legacyStyle === "minimal-white" || legacyStyle === "black-outline") {
    return "minimal";
  }
  if (legacyStyle === "elegant-script") return "grace-script";

  return "classic";
}

function getCaptionBackground(
  value: string | null | undefined,
  legacyStyle?: CaptionStyle | null
): CaptionBackground {
  if (
    value === "none" ||
    value === "soft-pill" ||
    value === "glass-blur" ||
    value === "dark-banner" ||
    value === "glow-box" ||
    value === "scripture-card"
  ) {
    return value;
  }

  if (legacyStyle === "bottom-banner") return "dark-banner";
  if (legacyStyle === "scripture-card") return "scripture-card";
  if (legacyStyle === "soft-gradient" || legacyStyle === "praise-glow") {
    return "glow-box";
  }
  if (legacyStyle === "minimal-white" || legacyStyle === "black-outline") {
    return "none";
  }

  return "soft-pill";
}

function getCaptionTemplate(
  value: string | null | undefined
): CaptionTemplate | null {
  if (
    value === "testimony-light" ||
    value === "prayer-calm" ||
    value === "scripture-focus" ||
    value === "freedom-glow" ||
    value === "quiet-strength" ||
    value === "celebration-praise"
  ) {
    return value;
  }

  return null;
}

function getVideoTemplate(value: string | null | undefined): VideoTemplate {
  if (
    value === "none" ||
    value === "htbf-logo" ||
    value === "freedom-silhouette" ||
    value === "shared-through-htbf" ||
    value === "freedom-story" ||
    value === "prayer-moment" ||
    value === "praise-report" ||
    value === "god-did-it"
  ) {
    return value;
  }

  if (value === "freedom") return "freedom-story";
  if (value === "testimony") return "shared-through-htbf";
  if (value === "prayer_circle") return "prayer-moment";
  if (value === "revival") return "praise-report";
  if (value === "kingdom") return "htbf-logo";

  return "none";
}

export default function FreedomFeed({
  defaultFilter = "all",
  lockedFilter = false,
}: {
  defaultFilter?: FeedFilter;
  lockedFilter?: boolean;
}) {
  const [feedItems, setFeedItems] = useState<FeedDisplayItem[]>([]);
  const [feedNextCursor, setFeedNextCursor] = useState<string | null>(null);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [loadingMoreFeed, setLoadingMoreFeed] = useState(false);
  const [feedLoadError, setFeedLoadError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [reactionMessage, setReactionMessage] = useState("");
  const [pendingReactionKey, setPendingReactionKey] = useState<string | null>(
    null
  );
  const [activeFilter, setActiveFilter] = useState<FeedFilter>(defaultFilter);
  const [answeringPrayerStory, setAnsweringPrayerStory] =
    useState<ApprovedStory | null>(null);
  const [answeredPrayerText, setAnsweredPrayerText] = useState("");
  const [markingPrayerAnsweredPending, setMarkingPrayerAnsweredPending] =
    useState(false);
  const [photoViewerStory, setPhotoViewerStory] =
    useState<ApprovedStory | null>(null);
  const [photoActionSheetOpen, setPhotoActionSheetOpen] = useState(false);
  const [photoViewerMessage, setPhotoViewerMessage] = useState("");
  const [photoCaptionExpanded, setPhotoCaptionExpanded] = useState(false);
  const [photoCaptionHidden, setPhotoCaptionHidden] = useState(false);
  const [photoDetailsStory, setPhotoDetailsStory] =
    useState<ApprovedStory | null>(null);
  const [reportStory, setReportStory] = useState<ApprovedStory | null>(null);
  const [reportVideoResponse, setReportVideoResponse] =
    useState<FeedVideoResponseDisplay | null>(null);
  const [reportReason, setReportReason] =
    useState<ReportReason>("inappropriate");
  const [videoReportReason, setVideoReportReason] = useState("other");
  const [reportDetails, setReportDetails] = useState("");
  const [reportModalError, setReportModalError] = useState("");
  const [sendingReport, setSendingReport] = useState(false);
  const reportFocusReturnKeyRef = useRef<string | null>(null);
  const [pendingBlockUserId, setPendingBlockUserId] = useState<string | null>(
    null
  );
  const [savedStoryIds, setSavedStoryIds] = useState<string[]>([]);
  const [hiddenPrayerStoryIds, setHiddenPrayerStoryIds] = useState<string[]>(
    []
  );
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [postOverflowMenuKey, setPostOverflowMenuKey] = useState<string | null>(
    null
  );
  const blockedUserIdsRef = useRef<string[]>([]);
  const [isRestoringFeedPosition, setIsRestoringFeedPosition] = useState(
    () => Boolean(readFreedomFeedReturnState())
  );
  const currentUserIdRef = useRef<string | null>(null);
  const feedRealtimeInFlightRef = useRef(false);
  const feedRealtimeQueuedRef = useRef(false);
  const feedLoadMoreInFlightRef = useRef(false);
  const feedPagesLoadedRef = useRef(1);
  const feedNextCursorRef = useRef<string | null>(null);
  const feedItemsRef = useRef<FeedDisplayItem[]>([]);
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const realtimeBatchRef = useRef<RealtimeFeedSyncBatch>({
    storyChanges: [],
    responseChanges: [],
    reactionStoryIds: [],
  });
  const feedSchemaCapabilitiesRef = useRef<{
    stories: { hasRemovedAt: boolean };
    prayerVideoResponses: { hasRemovedAt: boolean };
  } | null>(null);
  const restoredReturnPositionRef = useRef(false);
  const photoViewerHistoryPushedRef = useRef(false);
  const photoViewerReturnUrlRef = useRef<string | null>(null);
  const photoViewerSwipeStartXRef = useRef<number | null>(null);
  const photoViewerSwipeStartYRef = useRef<number | null>(null);
  const photoViewerSwipeTrackingRef = useRef(false);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;

    const fixtureEnabled = isCommunityFeedVisualValidationEnabled(
      new URLSearchParams(window.location.search)
    );

    async function loadVisualValidationFixtures() {
      setLoadingFeed(true);
      setFeedLoadError("");
      currentUserIdRef.current = FIXTURE_VIEWER_USER_ID;
      setUserId(FIXTURE_VIEWER_USER_ID);
      setFeedItems(getCommunityFeedVisualValidationFixtures(1));
      setFeedNextCursor(VISUAL_VALIDATION_PAGE_2_CURSOR);
      feedPagesLoadedRef.current = 1;
      setLoadingFeed(false);
    }

    async function loadPage() {
      if (fixtureEnabled) {
        await loadVisualValidationFixtures();
        return;
      }

      if (isSupabaseConfigured) {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          currentUserIdRef.current = user?.id ?? null;
          setUserId(currentUserIdRef.current);

          if (currentUserIdRef.current) {
            await loadAccountSafety(currentUserIdRef.current);
          } else {
            setSavedStoryIds([]);
            setHiddenPrayerStoryIds([]);
            setBlockedUserIds([]);
            blockedUserIdsRef.current = [];
          }
        } catch (error) {
          console.warn(
            "Could not load feed session:",
            formatFeedLoadError(error)
          );
        }
      }

      await loadInitialCommunityFeed();
    }

    void loadPage();

    if (fixtureEnabled || !isSupabaseConfigured) {
      return () => {
        cancelled = true;
      };
    }

    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }

    const channel = supabase
      .channel("freedom-feed-live-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "story_reactions",
        },
        (payload) => {
          queueRealtimeReactionChange(payload);
          scheduleRealtimeFeedSync();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stories",
        },
        (payload) => {
          queueRealtimeStoryChange(payload);
          scheduleRealtimeFeedSync();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "prayer_video_responses",
        },
        (payload) => {
          queueRealtimeResponseChange(payload);
          scheduleRealtimeFeedSync();
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      cancelled = true;
      feedRealtimeQueuedRef.current = false;
      feedRealtimeInFlightRef.current = false;
      if (realtimeDebounceRef.current) {
        clearTimeout(realtimeDebounceRef.current);
      }
      supabase.removeChannel(channel);
      realtimeChannelRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("scrollRestoration" in window.history)
    ) {
      return;
    }

    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    function handleBrowserBack() {
      if (!photoViewerHistoryPushedRef.current) return;

      closePhotoViewerFromBrowserBack();
    }

    window.addEventListener("popstate", handleBrowserBack);

    return () => {
      window.removeEventListener("popstate", handleBrowserBack);
    };
  }, []);

  function getVideoStoragePath(videoUrl: string) {
    if (!videoUrl) return null;

    if (videoUrl.includes("story-videos/")) {
      const afterBucket = videoUrl.split("story-videos/")[1];
      const pathOnly = afterBucket.split("?")[0];
      return decodeURIComponent(pathOnly);
    }

    if (videoUrl.startsWith("http")) {
      return null;
    }

    return videoUrl;
  }

  function getPhotoStoragePath(imageUrl: string) {
    if (!imageUrl) return null;

    if (imageUrl.startsWith("http")) {
      return null;
    }

    if (imageUrl.includes(`${STORY_IMAGE_BUCKET}/`)) {
      const afterBucket = imageUrl.split(`${STORY_IMAGE_BUCKET}/`)[1];
      const pathOnly = afterBucket.split("?")[0];
      return decodeURIComponent(pathOnly);
    }

    return imageUrl;
  }

  function isPrayerStory(story: ApprovedStory) {
    return story.story_type?.toLowerCase().includes("prayer") ?? false;
  }

  function isOriginalPoster(story: ApprovedStory) {
    return Boolean(userId && story.user_id && story.user_id === userId);
  }

  function readNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  function readString(value: unknown) {
    return typeof value === "string" ? value : null;
  }

  function readRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  function getCreationTemplateMetadata(
    value: unknown
  ): CreationTemplateMetadata | null {
    const metadata = readRecord(value);
    const selectedTemplate = readRecord(metadata?.selectedTemplate);
    const templateId = readString(selectedTemplate?.id);
    const storedImagePath = readString(selectedTemplate?.imagePath);

    if (!templateId || templateId === "none") return null;

    if (templateId === "generated-creator-studio" && storedImagePath) {
      return {
        id: "generated-creator-studio",
        label:
          readString(selectedTemplate?.label) ??
          "Creator Studio visual design",
        imagePath: storedImagePath,
      };
    }

    const template = creationCenterStoryTemplates.find(
      (item) => item.id === templateId
    );

    if (!template?.imagePath) return null;

    return {
      id: template.id,
      label: readString(selectedTemplate?.label) ?? template.label,
      imagePath: template.imagePath,
    };
  }

  async function loadAccountSafety(currentUserId: string) {
    const [savedResult, blockedUserIdsLoaded, hiddenResult] = await Promise.all([
      supabase
        .from("saved_content")
        .select("story_id")
        .eq("user_id", currentUserId),
      loadBidirectionalBlockedUserIds(currentUserId),
      loadHiddenPrayerIds(currentUserId),
    ]);

    try {
      await migrateLegacyHiddenPrayers(currentUserId);
    } catch (error) {
      console.warn("Could not migrate legacy hidden prayers:", error);
    }

    if (savedResult.error) {
      console.error("Could not load saved stories:", savedResult.error);
    } else {
      const savedRows: unknown[] = Array.isArray(savedResult.data)
        ? savedResult.data
        : [];
      setSavedStoryIds(
        savedRows.flatMap((row) =>
          typeof row === "object" &&
          row !== null &&
          "story_id" in row &&
          typeof row.story_id === "string"
            ? [row.story_id]
            : []
        )
      );
    }

    setBlockedUserIds(blockedUserIdsLoaded);
    blockedUserIdsRef.current = blockedUserIdsLoaded;
    setHiddenPrayerStoryIds(hiddenResult.ids);
  }

  function formatFeedLoadError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      return error.message;
    }

    return "Unknown error";
  }

  useEffect(() => {
    feedItemsRef.current = feedItems;
  }, [feedItems]);

  useEffect(() => {
    feedNextCursorRef.current = feedNextCursor;
  }, [feedNextCursor]);

  function buildExistingItemsCache(items: FeedDisplayItem[]) {
    return new Map(items.map((item) => [item.dedupeKey, item]));
  }

  async function loadCommunityFeedPage(options: {
    cursor?: string | null;
    mode: "initial" | "more" | "realtime";
  }) {
    if (!isSupabaseConfigured) {
      console.warn(
        "Could not load approved stories: Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart the dev server."
      );
      return null;
    }

    const existingItemsByKey =
      options.mode === "more" || options.mode === "realtime"
        ? buildExistingItemsCache(feedItemsRef.current)
        : undefined;

    const pageLimit =
      options.mode === "realtime"
        ? COMMUNITY_FEED_PAGE_LIMIT_DEFAULT * feedPagesLoadedRef.current
        : COMMUNITY_FEED_PAGE_LIMIT_DEFAULT;

    const result = await loadCommunityFeed({
      limit: pageLimit,
      cursor: options.mode === "more" ? options.cursor ?? null : null,
      viewerUserId: currentUserIdRef.current,
      blockedUserIds: blockedUserIdsRef.current,
      includeVideoResponses: true,
      existingItemsByKey,
    });

    if (result.ok === false) {
      console.warn("Could not load community feed:", result.message);
      setFeedLoadError(result.message);
      return null;
    }

    setFeedLoadError("");
    return result;
  }

  async function loadInitialCommunityFeed() {
    setLoadingFeed(true);
    try {
      const result = await loadCommunityFeedPage({ mode: "initial" });
      if (!result) return;

      feedPagesLoadedRef.current = 1;
      setFeedItems(result.items);
      setFeedNextCursor(result.nextCursor);
    } finally {
      setLoadingFeed(false);
    }
  }

  async function loadMoreCommunityFeed() {
    const cursor = feedNextCursorRef.current;
    if (!cursor || feedLoadMoreInFlightRef.current || loadingMoreFeed) {
      return;
    }

    if (
      isCommunityFeedVisualValidationEnabled(
        new URLSearchParams(window.location.search)
      ) &&
      cursor === VISUAL_VALIDATION_PAGE_2_CURSOR
    ) {
      feedLoadMoreInFlightRef.current = true;
      setLoadingMoreFeed(true);

      try {
        setFeedItems((current) =>
          mergeFeedDisplayPages(
            current,
            getCommunityFeedVisualValidationFixtures(2)
          )
        );
        setFeedNextCursor(null);
        feedPagesLoadedRef.current += 1;
      } finally {
        feedLoadMoreInFlightRef.current = false;
        setLoadingMoreFeed(false);
      }

      return;
    }

    feedLoadMoreInFlightRef.current = true;
    setLoadingMoreFeed(true);

    try {
      const result = await loadCommunityFeedPage({
        mode: "more",
        cursor,
      });
      if (!result || result.items.length === 0) {
        setFeedNextCursor(null);
        return;
      }

      setFeedItems((current) => mergeFeedDisplayPages(current, result.items));
      setFeedNextCursor(result.nextCursor);
      feedPagesLoadedRef.current += 1;
    } finally {
      feedLoadMoreInFlightRef.current = false;
      setLoadingMoreFeed(false);
    }
  }

  async function refreshCommunityFeedRealtime() {
    if (feedRealtimeInFlightRef.current) {
      feedRealtimeQueuedRef.current = true;
      return;
    }

    feedRealtimeInFlightRef.current = true;

    try {
      const preserveScrollY =
        typeof window !== "undefined" && !restoredReturnPositionRef.current
          ? window.scrollY
          : null;

      const batch = realtimeBatchRef.current;
      realtimeBatchRef.current = {
        storyChanges: [],
        responseChanges: [],
        reactionStoryIds: [],
      };

      if (!feedSchemaCapabilitiesRef.current) {
        feedSchemaCapabilitiesRef.current =
          await getCommunityFeedSchemaCapabilities();
      }

      const capabilities = feedSchemaCapabilitiesRef.current;
      const result = await processRealtimeFeedUpdates({
        loaded: feedItemsRef.current,
        batch,
        pagesLoaded: feedPagesLoadedRef.current,
        viewerUserId: currentUserIdRef.current,
        blockedUserIds: blockedUserIdsRef.current,
        existingItemsByKey: buildExistingItemsCache(feedItemsRef.current),
        context: {
          blockedUserIds: new Set(blockedUserIdsRef.current),
          removedAtFilterAvailable:
            capabilities.stories.hasRemovedAt &&
            capabilities.prayerVideoResponses.hasRemovedAt,
        },
      });

      setFeedItems(result.items);

      if (
        preserveScrollY != null &&
        typeof window !== "undefined" &&
        !restoredReturnPositionRef.current
      ) {
        window.requestAnimationFrame(() => {
          window.scrollTo(0, preserveScrollY);
        });
      }
    } finally {
      feedRealtimeInFlightRef.current = false;

      if (feedRealtimeQueuedRef.current) {
        feedRealtimeQueuedRef.current = false;
        void refreshCommunityFeedRealtime();
      }
    }
  }

  function queueRealtimeStoryChange(payload: unknown) {
    const parsed = parseStoryRealtimePayload(
      payload as {
        eventType?: string;
        new?: Record<string, unknown> | null;
        old?: Record<string, unknown> | null;
      }
    );
    realtimeBatchRef.current.storyChanges.push(parsed as RealtimeStoryChange);
  }

  function queueRealtimeResponseChange(payload: unknown) {
    const parsed = parseResponseRealtimePayload(
      payload as {
        eventType?: string;
        new?: Record<string, unknown> | null;
        old?: Record<string, unknown> | null;
      }
    );
    realtimeBatchRef.current.responseChanges.push(
      parsed as RealtimeResponseChange
    );
  }

  function queueRealtimeReactionChange(payload: unknown) {
    const storyId = parseReactionRealtimePayload(
      payload as {
        new?: Record<string, unknown> | null;
        old?: Record<string, unknown> | null;
      }
    );
    if (storyId) {
      realtimeBatchRef.current.reactionStoryIds.push(storyId);
    }
  }

  function scheduleRealtimeFeedSync() {
    if (realtimeDebounceRef.current) {
      clearTimeout(realtimeDebounceRef.current);
    }
    realtimeDebounceRef.current = setTimeout(() => {
      void refreshCommunityFeedRealtime();
    }, 400);
  }

  const visibleFeedItems = useMemo(() => {
    if (hiddenPrayerStoryIds.length === 0) return feedItems;

    const hidden = new Set(hiddenPrayerStoryIds);
    return feedItems.filter(
      (item) => !(item.kind === "story" && hidden.has(item.id))
    );
  }, [feedItems, hiddenPrayerStoryIds]);

  const filteredFeedItems = useMemo(
    () => filterFeedDisplayItems(visibleFeedItems, activeFilter, blockedUserIds),
    [activeFilter, blockedUserIds, visibleFeedItems]
  );

  const storyFeedItems = useMemo(
    () =>
      feedItems.filter(
        (item): item is FeedStoryDisplay => item.kind === "story"
      ),
    [feedItems]
  );

  const miniReelStories = useMemo(
    () =>
      storyFeedItems
        .filter(
          (story) =>
            Boolean(story.signed_video_url) &&
            (!story.user_id || !blockedUserIds.includes(story.user_id))
        )
        .slice(0, 12),
    [blockedUserIds, storyFeedItems]
  );

  const showMiniReelsInFeed =
    !lockedFilter && activeFilter === "all" && miniReelStories.length > 0;

  useEffect(() => {
    if (restoredReturnPositionRef.current || filteredFeedItems.length === 0) return;

    const returnState = readFreedomFeedReturnState();

    if (!returnState) {
      setIsRestoringFeedPosition(false);
      return;
    }

    restoredReturnPositionRef.current = true;
    setIsRestoringFeedPosition(true);

    window.requestAnimationFrame(() => {
      restoreFreedomFeedReturnPosition(returnState, {
        clearAfterRestore: true,
      });

      window.setTimeout(() => {
        restoreFreedomFeedReturnPosition(returnState, {
          clearAfterRestore: false,
        });
        setIsRestoringFeedPosition(false);
      }, 120);
    });
  }, [filteredFeedItems]);

  async function toggleSavedStory(story: ApprovedStory) {
    setReactionMessage("");

    if (!userId) {
      setReactionMessage("Please sign in to save stories.");
      return;
    }

    const isSaved = savedStoryIds.includes(story.id);

    const { error } = isSaved
      ? await supabase
          .from("saved_content")
          .delete()
          .eq("user_id", userId)
          .eq("story_id", story.id)
      : await supabase.from("saved_content").insert({
          user_id: userId,
          story_id: story.id,
        });

    if (error) {
      setReactionMessage(`Could not update saved content: ${error.message}`);
      return;
    }

    setSavedStoryIds((current) =>
      isSaved
        ? current.filter((storyId) => storyId !== story.id)
        : [...current, story.id]
    );
    setReactionMessage(isSaved ? "Removed from saved content." : "Story saved.");
  }

  async function blockStoryUser(story: ApprovedStory) {
    setPostOverflowMenuKey(null);
    setReactionMessage("");

    if (!userId || !story.user_id) {
      setReactionMessage("Please sign in to block users.");
      return;
    }

    if (story.user_id === userId) return;
    if (pendingBlockUserId === story.user_id) return;

    setPendingBlockUserId(story.user_id);

    try {
      const { error } = await supabase.from("blocked_users").upsert(
        {
          blocker_user_id: userId,
          blocked_user_id: story.user_id,
        },
        { onConflict: "blocker_user_id,blocked_user_id" }
      );

      if (error) {
        setReactionMessage("We couldn't block this user. Please try again.");
        return;
      }

      setBlockedUserIds((current) => {
        const next = current.includes(story.user_id as string)
          ? current
          : [...current, story.user_id as string];
        blockedUserIdsRef.current = next;
        return next;
      });

      setFeedItems((current) =>
        current.filter((item) => {
          if (item.kind === "story") {
            return item.user_id !== story.user_id;
          }
          if (item.kind === "prayer_video_response") {
            return item.user_id !== story.user_id;
          }
          return true;
        })
      );

      void loadBidirectionalBlockedUserIds(userId).then((next) => {
        blockedUserIdsRef.current = next;
        setBlockedUserIds(next);
      });
      setReactionMessage(formatBlockedUserConfirmation(story.name));
    } finally {
      setPendingBlockUserId((current) =>
        current === story.user_id ? null : current
      );
    }
  }

  async function blockFeedUser(targetUserId: string | null | undefined) {
    setPostOverflowMenuKey(null);
    setReactionMessage("");

    if (!userId || !targetUserId) {
      setReactionMessage("Please sign in to block users.");
      return;
    }

    if (targetUserId === userId) return;
    if (pendingBlockUserId === targetUserId) return;

    const blockedItem = feedItemsRef.current.find(
      (item) => item.user_id === targetUserId
    );
    const blockedLabel =
      blockedItem?.kind === "prayer_video_response"
        ? blockedItem.name?.trim()
        : blockedItem?.name?.trim() || null;

    setPendingBlockUserId(targetUserId);

    try {
      const { error } = await supabase.from("blocked_users").upsert(
        {
          blocker_user_id: userId,
          blocked_user_id: targetUserId,
        },
        { onConflict: "blocker_user_id,blocked_user_id" }
      );

      if (error) {
        setReactionMessage("We couldn't block this user. Please try again.");
        return;
      }

      setBlockedUserIds((current) => {
        const next = current.includes(targetUserId)
          ? current
          : [...current, targetUserId];
        blockedUserIdsRef.current = next;
        return next;
      });

      setFeedItems((current) =>
        current.filter((item) => item.user_id !== targetUserId)
      );

      void loadBidirectionalBlockedUserIds(userId).then((next) => {
        blockedUserIdsRef.current = next;
        setBlockedUserIds(next);
      });
      setReactionMessage(formatBlockedUserConfirmation(blockedLabel));
    } finally {
      setPendingBlockUserId((current) =>
        current === targetUserId ? null : current
      );
    }
  }

  function formatAuthorMeta(
    location: string | null | undefined,
    createdAt: string | null | undefined
  ) {
    const time = formatFeedRelativeTime(createdAt);
    const place = location?.trim() || "Location not shared";
    return time ? `${place} · ${time}` : place;
  }

  function openFeedReport(story: ApprovedStory) {
    setPostOverflowMenuKey(null);
    reportFocusReturnKeyRef.current = `story:${story.id}`;

    if (!userId) {
      setReactionMessage("Please sign in to report a post.");
      return;
    }

    setReportVideoResponse(null);
    setReportStory(story);
    setReportReason("inappropriate");
    setReportDetails("");
    setReportModalError("");
  }

  function openFeedVideoResponseReport(item: FeedVideoResponseDisplay) {
    setPostOverflowMenuKey(null);
    reportFocusReturnKeyRef.current = item.dedupeKey;

    if (!userId) {
      setReactionMessage("Please sign in to report a video.");
      return;
    }

    setReportStory(null);
    setReportVideoResponse(item);
    setVideoReportReason("other");
    setReportDetails("");
    setReportModalError("");
  }

  function restoreReportFocusReturn() {
    const focusKey = reportFocusReturnKeyRef.current;
    reportFocusReturnKeyRef.current = null;
    if (!focusKey) return;

    requestAnimationFrame(() => {
      const trigger = document.querySelector(
        `[data-report-focus-return="${CSS.escape(focusKey)}"]`
      );
      if (trigger instanceof HTMLElement) {
        trigger.focus();
      }
    });
  }

  function closeReportModal() {
    setReportStory(null);
    setReportVideoResponse(null);
    setReportReason("inappropriate");
    setVideoReportReason("other");
    setReportDetails("");
    setReportModalError("");
    setSendingReport(false);
    restoreReportFocusReturn();
  }

  async function hideFeedItem(item: FeedDisplayItem) {
    setPostOverflowMenuKey(null);
    setReactionMessage("");

    if (!userId) {
      setReactionMessage("Please sign in to hide posts.");
      return;
    }

    if (!canPersistentlyHideFeedItem(item)) {
      return;
    }

    try {
      await hidePrayer(userId, item.id);
      setHiddenPrayerStoryIds((current) =>
        current.includes(item.id) ? current : [...current, item.id]
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not hide post.";
      setReactionMessage(message);
      return;
    }

    setFeedItems((current) =>
      current.filter((entry) => entry.dedupeKey !== item.dedupeKey)
    );
    setReactionMessage("Post hidden.");
  }

  useEffect(() => {
    if (
      reportStory ||
      reportVideoResponse ||
      photoViewerStory ||
      photoActionSheetOpen ||
      postOverflowMenuKey ||
      answeringPrayerStory
    ) {
      suspendFeedVideoAutoplay();
      return;
    }

    resumeFeedVideoAutoplay();
  }, [
    answeringPrayerStory,
    photoActionSheetOpen,
    photoViewerStory,
    postOverflowMenuKey,
    reportStory,
    reportVideoResponse,
  ]);

  useEffect(() => {
    if (!reportStory && !reportVideoResponse) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !sendingReport) {
        event.preventDefault();
        closeReportModal();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
    // closeReportModal is stable enough for modal lifecycle cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportStory, reportVideoResponse, sendingReport]);

  async function toggleReaction(storyId: string, reactionType: ReactionType) {
    setReactionMessage("");

    if (!userId) {
      setReactionMessage("Please sign in to react to stories.");
      return;
    }

    const pendingKey = `${storyId}:${reactionType}`;
    if (pendingReactionKey === pendingKey) return;

    const story = feedItemsRef.current.find(
      (item): item is FeedStoryDisplay =>
        item.kind === "story" && item.id === storyId
    );
    if (!story) return;

    const alreadyReacted = story.user_reactions.includes(reactionType);
    const optimisticAction: "add" | "remove" = alreadyReacted ? "remove" : "add";

    setPendingReactionKey(pendingKey);
    updateLocalReaction(storyId, reactionType, optimisticAction);

    try {
      if (alreadyReacted) {
        const { error } = await supabase
          .from("story_reactions")
          .delete()
          .eq("story_id", storyId)
          .eq("user_id", userId)
          .eq("reaction_type", reactionType);

        if (error) {
          updateLocalReaction(storyId, reactionType, "add");
          setReactionMessage("Could not update your reaction. Please try again.");
        }
        return;
      }

      const { error } = await supabase.from("story_reactions").insert({
        story_id: storyId,
        user_id: userId,
        reaction_type: reactionType,
      });

      if (error) {
        updateLocalReaction(storyId, reactionType, "remove");
        if (/duplicate|unique/i.test(error.message)) {
          return;
        }
        setReactionMessage("Could not update your reaction. Please try again.");
      }
    } finally {
      setPendingReactionKey((current) => (current === pendingKey ? null : current));
    }
  }

  function updateLocalReaction(
    storyId: string,
    reactionType: ReactionType,
    action: "add" | "remove"
  ) {
    setFeedItems((currentItems) =>
      currentItems.map((item) => {
        if (item.kind !== "story" || item.id !== storyId) return item;

        const nextCount =
          action === "add"
            ? item.reaction_counts[reactionType] + 1
            : Math.max(item.reaction_counts[reactionType] - 1, 0);

        const nextUserReactions =
          action === "add"
            ? [...item.user_reactions, reactionType]
            : item.user_reactions.filter(
                (reaction) => reaction !== reactionType
              );

        return {
          ...item,
          reaction_counts: {
            ...item.reaction_counts,
            [reactionType]: nextCount,
          },
          user_reactions: nextUserReactions,
        };
      })
    );
  }

  function closeAnsweredPrayerModal() {
    if (markingPrayerAnsweredPending) return;
    setAnsweringPrayerStory(null);
    setAnsweredPrayerText("");
    setReactionMessage("");
  }

  async function markPrayerAnswered(storyId: string, answeredText: string) {
    if (markingPrayerAnsweredPending) return;

    setReactionMessage("");

    if (!userId) {
      setReactionMessage("Please sign in to mark a prayer request answered.");
      return;
    }

    const story = feedItems.find(
      (item): item is FeedStoryDisplay =>
        item.kind === "story" && item.id === storyId
    );

    setMarkingPrayerAnsweredPending(true);

    const result = await markMyPrayerAnswered({
      supabase,
      storyId,
      answeredText,
      authUserId: userId,
      storyForValidation: story
        ? {
            id: story.id,
            user_id: story.user_id,
            story_type: story.story_type,
            status: story.status,
            prayer_status: story.prayer_status,
            removed_at: null,
          }
        : null,
    });

    setMarkingPrayerAnsweredPending(false);

    if (result.ok === false) {
      setReactionMessage(result.message);
      return;
    }

    setFeedItems((currentItems) =>
      currentItems.map((item) =>
        item.kind === "story" && item.id === storyId
          ? {
              ...item,
              prayer_status: result.story.prayer_status,
              answered_at: result.story.answered_at,
              answered_text: result.story.answered_text,
            }
          : item
      )
    );

    setAnsweringPrayerStory(null);
    setAnsweredPrayerText("");
    setReactionMessage("Praise shared with the community.");
  }

  async function shareVideoResponse(item: FeedVideoResponseDisplay) {
    setReactionMessage("");

    const sharePayload = buildVideoResponseSharePayload(
      item,
      window.location.origin
    );

    if (sharePayload.parentStoryId) {
      saveFreedomFeedReturnState(
        sharePayload.parentStoryId,
        `freedom-feed-response-${item.id}`
      );
    }

    const shareData = {
      title: sharePayload.title,
      text: sharePayload.text,
      url: sharePayload.url,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }

      await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      setReactionMessage("Share link copied.");
    } catch (error) {
      console.error("Share failed:", error);
    }
  }

  async function shareStory(story: ApprovedStory) {
    setReactionMessage("");

    const storyType = story.story_type || "HTBF Story";

    let shareText = "See this story on Hyper to Be Free.";

    if (isPrayerStory(story) && story.prayer_status === "answered") {
      shareText = story.answered_text
        ? `God did it. Read this answered prayer: ${story.answered_text.slice(0, 140)}`
        : "God did it. Read this answered prayer on Hyper to Be Free.";
    } else if (isPrayerStory(story)) {
      shareText = story.story_text
        ? `Stand in prayer with this request: ${story.story_text.slice(0, 140)}`
        : "Stand in prayer with this request on Hyper to Be Free.";
    } else if (story.signed_video_url || story.video_url) {
      shareText = story.story_text
        ? `Watch this video testimony: ${story.story_text.slice(0, 140)}`
        : "Watch this video testimony on Hyper to Be Free.";
    } else if (story.story_text) {
      shareText = story.story_text.slice(0, 140);
    }

    const shareUrl = `${window.location.origin}/feed`;

    const shareData = {
      title: `Hyper to Be Free - ${storyType}`,
      text: shareText,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }

      await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      setReactionMessage("Share link copied.");
    } catch (error) {
      console.error("Share failed:", error);
    }
  }

  function saveFreedomFeedReturnState(storyId: string, anchorId?: string) {
    if (typeof window === "undefined") return;

    const storyElement = anchorId
      ? document.getElementById(anchorId)
      : getFreedomFeedStoryElement(storyId);
    const storyViewportTop =
      storyElement?.getBoundingClientRect().top ??
      Math.min(window.innerHeight * 0.2, 160);
    const returnState: FreedomFeedReturnState = {
      source: "freedom-feed",
      storyId,
      ...(anchorId ? { anchorId } : {}),
      scrollY: window.scrollY,
      storyViewportTop,
      savedAt: Date.now(),
    };

    window.sessionStorage.setItem(
      FREEDOM_FEED_RETURN_STATE_KEY,
      JSON.stringify(returnState)
    );
  }

  function resetPhotoViewerState() {
    setPhotoViewerStory(null);
    setPhotoActionSheetOpen(false);
    setPhotoViewerMessage("");
    setPhotoCaptionExpanded(false);
    setPhotoCaptionHidden(false);
    setPhotoDetailsStory(null);
    setReportStory(null);
    setReportReason("inappropriate");
    setReportDetails("");
    photoViewerSwipeTrackingRef.current = false;
    photoViewerSwipeStartXRef.current = null;
    photoViewerSwipeStartYRef.current = null;
  }

  function openPhotoViewer(story: ApprovedStory) {
    saveFreedomFeedReturnState(story.id);

    if (typeof window !== "undefined" && !photoViewerHistoryPushedRef.current) {
      photoViewerReturnUrlRef.current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.history.pushState(
        { htbfSource: "freedom-feed", storyId: story.id },
        "",
        `/feed?story=${encodeURIComponent(story.id)}&source=freedom-feed`
      );
      photoViewerHistoryPushedRef.current = true;
    }

    setPhotoViewerStory(story);
    setPhotoActionSheetOpen(false);
    setPhotoViewerMessage("");
    setPhotoCaptionExpanded(false);
    setPhotoCaptionHidden(false);
    setPhotoDetailsStory(null);
    setReportStory(null);
    setReportReason("inappropriate");
    setReportDetails("");
  }

  function closePhotoViewer() {
    const returnUrl = photoViewerReturnUrlRef.current ?? "/feed";
    const shouldRestoreFeedUrl =
      typeof window !== "undefined" && photoViewerHistoryPushedRef.current;

    resetPhotoViewerState();

    if (shouldRestoreFeedUrl) {
      window.history.replaceState(
        { htbfSource: "freedom-feed" },
        "",
        returnUrl
      );
    }

    photoViewerHistoryPushedRef.current = false;
    photoViewerReturnUrlRef.current = null;
    restoreFreedomFeedReturnPosition();
  }

  function closePhotoViewerFromBrowserBack() {
    resetPhotoViewerState();
    photoViewerHistoryPushedRef.current = false;
    photoViewerReturnUrlRef.current = null;
    restoreFreedomFeedReturnPosition();
  }

  function handlePhotoViewerTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (
      event.touches.length !== 1 ||
      photoActionSheetOpen ||
      photoCaptionExpanded ||
      Boolean(photoDetailsStory) ||
      Boolean(reportStory)
    ) {
      photoViewerSwipeTrackingRef.current = false;
      return;
    }

    const touch = event.touches[0];

    photoViewerSwipeStartXRef.current = touch.clientX;
    photoViewerSwipeStartYRef.current = touch.clientY;
    photoViewerSwipeTrackingRef.current = true;
  }

  function handlePhotoViewerTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (
      !photoViewerSwipeTrackingRef.current ||
      event.touches.length !== 1 ||
      photoViewerSwipeStartXRef.current === null ||
      photoViewerSwipeStartYRef.current === null
    ) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = Math.abs(touch.clientX - photoViewerSwipeStartXRef.current);
    const deltaY = touch.clientY - photoViewerSwipeStartYRef.current;

    if (deltaY > 110 && deltaY > deltaX * 1.4) {
      event.preventDefault();
      photoViewerSwipeTrackingRef.current = false;
      closePhotoViewer();
    }
  }

  function handlePhotoViewerTouchEnd() {
    photoViewerSwipeTrackingRef.current = false;
    photoViewerSwipeStartXRef.current = null;
    photoViewerSwipeStartYRef.current = null;
  }

  function closePhotoActionSheet() {
    setPhotoActionSheetOpen(false);
  }

  function openPhotoDetails(story: ApprovedStory) {
    setPhotoActionSheetOpen(false);
    setPhotoDetailsStory(story);
  }

  function openVideoStory(storyId: string, anchorId?: string) {
    saveFreedomFeedReturnState(storyId, anchorId);

    window.location.href = `/videos?story=${encodeURIComponent(
      storyId
    )}&source=freedom-feed`;
  }

  function openStoryDetail(story: ApprovedStory) {
    if (story.signed_video_url || story.video_url) {
      openVideoStory(story.id);
      return;
    }

    openPhotoViewer(story);
  }

  async function copyPhotoLink(story: ApprovedStory) {
    setPhotoViewerMessage("");

    const postUrl = `${window.location.origin}/feed?story=${encodeURIComponent(
      story.id
    )}`;
    const linkToCopy = story.signed_image_url || postUrl;

    try {
      if (!navigator.clipboard) {
        setPhotoViewerMessage("Copy is not available in this browser.");
        return;
      }

      await navigator.clipboard.writeText(linkToCopy);
      setPhotoViewerMessage(
        story.signed_image_url ? "Photo link copied." : "Post link copied."
      );
      setPhotoActionSheetOpen(false);
    } catch (error) {
      console.error("Could not copy post link:", error);
      setPhotoViewerMessage("Could not copy the post link.");
    }
  }

  function savePhoto(story: ApprovedStory) {
    setPhotoViewerMessage("");

    if (!story.signed_image_url) {
      setPhotoViewerMessage("Save Photo is not available for this photo yet.");
      return;
    }

    try {
      const downloadLink = document.createElement("a");
      downloadLink.href = story.signed_image_url;
      downloadLink.download = `htbf-photo-${story.id}.jpg`;
      downloadLink.target = "_blank";
      downloadLink.rel = "noopener noreferrer";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      setPhotoViewerMessage("Photo download opened.");
      setPhotoActionSheetOpen(false);
    } catch (error) {
      console.error("Could not save photo:", error);
      window.open(story.signed_image_url, "_blank", "noopener,noreferrer");
      setPhotoViewerMessage("Photo opened in a new tab.");
      setPhotoActionSheetOpen(false);
    }
  }

  async function sharePhoto(story: ApprovedStory) {
    setPhotoViewerMessage("");

    if (!story.signed_image_url) {
      await shareStory(story);
      setPhotoActionSheetOpen(false);
      return;
    }

    const shareData = {
      title: "Hyper to Be Free - Post",
      text: story.story_text
        ? story.story_text.slice(0, 140)
        : "See this HTBF post on Hyper to Be Free.",
      url: story.signed_image_url,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setPhotoActionSheetOpen(false);
        return;
      }

      await copyPhotoLink(story);
    } catch (error) {
      console.error("Could not share post:", error);
      setPhotoViewerMessage("Could not share this post.");
    }
  }

  async function copyPhotoCaption(story: ApprovedStory) {
    setPhotoViewerMessage("");

    const caption = story.story_text?.trim();

    if (!caption) {
      setPhotoViewerMessage("There is no caption to copy.");
      setPhotoActionSheetOpen(false);
      return;
    }

    try {
      if (!navigator.clipboard) {
        setPhotoViewerMessage("Copy is not available in this browser.");
        setPhotoActionSheetOpen(false);
        return;
      }

      await navigator.clipboard.writeText(caption);
      setPhotoViewerMessage("Caption copied.");
      setPhotoActionSheetOpen(false);
    } catch (error) {
      console.error("Could not copy caption:", error);
      setPhotoViewerMessage("Could not copy the caption.");
      setPhotoActionSheetOpen(false);
    }
  }

  async function prayForPhotoStory(story: ApprovedStory) {
    setPhotoActionSheetOpen(false);

    if (!userId) {
      setPhotoViewerMessage("Please sign in to join the Prayer Circle.");
      return;
    }

    const alreadyPraying = story.user_reactions.includes("praying");

    await toggleReaction(story.id, "praying");

    setPhotoViewerStory((currentStory) => {
      if (!currentStory || currentStory.id !== story.id) return currentStory;

      const nextReactions: ReactionType[] = alreadyPraying
        ? currentStory.user_reactions.filter((reaction) => reaction !== "praying")
        : [...currentStory.user_reactions, "praying"];

      return {
        ...currentStory,
        user_reactions: nextReactions,
        reaction_counts: {
          ...currentStory.reaction_counts,
          praying: alreadyPraying
            ? Math.max(currentStory.reaction_counts.praying - 1, 0)
            : currentStory.reaction_counts.praying + 1,
        },
      };
    });

    setPhotoViewerMessage(
      alreadyPraying
        ? "Prayer Circle reaction removed."
        : "You joined the Prayer Circle."
    );
  }

  function togglePhotoCaption() {
    setPhotoCaptionHidden((current) => !current);
    setPhotoActionSheetOpen(false);
  }

  function reportPhoto(story: ApprovedStory) {
    setPhotoActionSheetOpen(false);

    if (!userId) {
      setPhotoViewerMessage("Please sign in to report a post.");
      return;
    }

    setReportStory(story);
    setReportReason("inappropriate");
    setReportDetails("");
    setPhotoViewerMessage("");
  }

  async function submitVideoResponseReport() {
    if (!userId || !reportVideoResponse) {
      setReportModalError("Please sign in to report a video.");
      return;
    }

    if (sendingReport) return;

    setSendingReport(true);
    setReportModalError("");
    setReactionMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        setReportModalError("Please sign in to report a video.");
        return;
      }

      const result = await submitContentReport({
        accessToken,
        contentType: "video_response",
        reason: videoReportReason,
        details: reportDetails.trim() || undefined,
        storyId: reportVideoResponse.parentStoryId ?? null,
        responseId: reportVideoResponse.id,
      });

      if (result.ok !== true) {
        setReportModalError(
          result.error || "We couldn't submit your report. Please try again."
        );
        return;
      }

      closeReportModal();
      setPostOverflowMenuKey(null);
      setReactionMessage(VIDEO_RESPONSE_REPORT_SUCCESS);
    } finally {
      setSendingReport(false);
    }
  }

  async function submitReport() {
    if (reportVideoResponse) {
      await submitVideoResponseReport();
      return;
    }

    if (!userId || !reportStory) {
      setReportModalError("Please sign in to report a post.");
      return;
    }

    if (sendingReport) return;

    setSendingReport(true);
    setReportModalError("");
    setReactionMessage("");

    const cleanDetails = reportDetails.trim();

    try {
      const { error } = await supabase.from("content_reports").insert({
        story_id: reportStory.id,
        reporter_user_id: userId,
        reported_user_id: reportStory.user_id,
        reason: reportReason,
        details: cleanDetails || null,
        status: "open",
      });

      if (error) {
        if (/duplicate|unique/i.test(error.message)) {
          closeReportModal();
          setReactionMessage(
            "Your report was submitted. Thank you for helping keep HTBF safe."
          );
          return;
        }

        setReportModalError("We couldn't submit your report. Please try again.");
        return;
      }

      closeReportModal();
      setReactionMessage(
        "Your report was submitted. Thank you for helping keep HTBF safe."
      );
    } finally {
      setSendingReport(false);
    }
  }

  const feedLabel =
    lockedFilter && defaultFilter === "videos"
      ? "Video Testimonies"
      : lockedFilter && defaultFilter === "prayer"
        ? "Prayer Support"
        : lockedFilter && defaultFilter === "answered"
          ? "Answered Prayers"
          : "Community Feed";

  const feedHeading =
    lockedFilter && defaultFilter === "videos"
      ? "Videos being shared now"
      : lockedFilter && defaultFilter === "prayer"
        ? "Prayer requests being shared now"
        : lockedFilter && defaultFilter === "answered"
          ? "God Did It"
          : "Stories being shared now";

  const emptyMessage =
    lockedFilter && defaultFilter === "videos"
      ? "No approved videos are showing yet. Approved video testimonies will appear here after review."
      : lockedFilter && defaultFilter === "prayer"
        ? "No approved prayer requests are showing yet. Approved prayer requests will appear here after review."
        : lockedFilter && defaultFilter === "answered"
        ? "No answered prayers are showing yet. When someone marks a prayer request as answered, it will appear here."
        : "No approved stories are showing yet. Approved stories will appear here after review.";

  const photoViewerText = photoViewerStory?.story_text?.trim() ?? "";
  const photoViewerTextIsLong =
    photoViewerText.length > 80 ||
    photoViewerText.split(/\r\n|\r|\n/).length > 2;

  async function refreshStoryVideoResponses(storyId: string) {
    const [approvedMap, pendingMap] = await Promise.all([
      loadApprovedVideoResponsesByStoryIds([storyId]),
      loadViewerPendingVideoResponsesByStoryIds([storyId], userId),
    ]);
    const approved = approvedMap.get(storyId) ?? [];
    const pending = pendingMap.get(storyId) ?? null;

    setFeedItems((current) =>
      current.map((item) => {
        if (item.kind !== "story" || item.id !== storyId) return item;
        return {
          ...item,
          approved_video_responses: approved,
          video_response_count: approved.length,
          viewer_pending_response: pending,
        };
      })
    );
  }

  const communityFeedCallbacks = useMemo<CommunityFeedPostCallbacks>(
    () => ({
      userId,
      savedStoryIds,
      postOverflowMenuKey,
      setPostOverflowMenuKey,
      formatAuthorMeta,
      isOriginalPoster,
      onOpenStory: openStoryDetail,
      onShareStory: shareStory,
      onShareVideoResponse: shareVideoResponse,
      onToggleReaction: toggleReaction,
      pendingReactionKey,
      onToggleSaved: toggleSavedStory,
      onReportStory: openFeedReport,
      onReportVideoResponse: openFeedVideoResponseReport,
      pendingBlockUserId,
      onBlockStoryUser: blockStoryUser,
      onHideFeedItem: hideFeedItem,
      onBlockFeedUser: blockFeedUser,
      onGodDidIt: (story) => {
        setAnsweringPrayerStory(story);
        setAnsweredPrayerText("");
        setReactionMessage("");
      },
      onPrepareFeedReturn: (storyId) => saveFreedomFeedReturnState(storyId),
      onResponseMessage: (message) => setReactionMessage(message),
      onRefreshStoryVideoResponses: (storyId) => {
        void refreshStoryVideoResponses(storyId);
      },
    }),
    [userId, savedStoryIds, postOverflowMenuKey, pendingReactionKey, pendingBlockUserId]
  );

  return (
    <section
      id="stories"
      aria-busy={isRestoringFeedPosition || loadingFeed}
      className={`${styles.feedRoot} ${
        isRestoringFeedPosition ? styles.restoring : ""
      }`}
    >
      <div className={styles.feedShell}>
        <div className={styles.feedColumn}>
        <div className={styles.feedTop}>
          {!lockedFilter && (
            <div className={styles.heroWrap}>
              <FeedComposer />
            </div>
          )}

          <div className={styles.feedHeadingBlock}>
            <div className={styles.feedEyebrow}>{feedLabel}</div>
            <h2 className={styles.feedTitle}>{feedHeading}</h2>
          </div>

          {!lockedFilter && (
            <div className={styles.filterShell}>
              <div className={styles.filterRow}>
                <FilterButton
                  label="All"
                  active={activeFilter === "all"}
                  onClick={() => setActiveFilter("all")}
                />
                <FilterButton
                  label="Testimonies"
                  active={activeFilter === "testimony"}
                  onClick={() => setActiveFilter("testimony")}
                />
                <FilterButton
                  label="Praise"
                  active={activeFilter === "praise"}
                  onClick={() => setActiveFilter("praise")}
                />
                <FilterButton
                  label="Prayer"
                  active={activeFilter === "prayer"}
                  onClick={() => setActiveFilter("prayer")}
                />
              </div>
              <div aria-hidden className={styles.filterFade} />
            </div>
          )}
        </div>

        {reactionMessage ? (
          <div
            className={styles.bannerMessage}
            role="status"
            aria-live="polite"
          >
            {reactionMessage}
          </div>
        ) : null}

        {loadingFeed && filteredFeedItems.length === 0 ? (
          <div className={styles.skeletonPost} aria-live="polite">
            <div className={styles.skeletonLine} style={{ width: "42%" }} />
            <div
              className={styles.skeletonLine}
              style={{ width: "68%", marginTop: "0.5rem" }}
            />
            <div className={styles.skeletonMedia} aria-hidden />
          </div>
        ) : null}

        <div className={styles.feedList}>
          {!loadingFeed && filteredFeedItems.length === 0 ? (
            <p className={styles.emptyState}>{emptyMessage}</p>
          ) : (
            filteredFeedItems.map((feedItem, index) => {
              const postSeparator =
                index > 0 ? (
                  <div
                    key={`sep-${feedItem.dedupeKey}`}
                    className={styles.postSeparator}
                    role="separator"
                    aria-hidden
                  />
                ) : null;
              const miniReelAnchorId = `freedom-feed-mini-reels-${index + 1}`;
              const shouldShowMiniReels =
                showMiniReelsInFeed &&
                (index + 1) % 12 === 0 &&
                index < filteredFeedItems.length - 1;

              return (
                <FeedListItem
                  key={feedItem.dedupeKey}
                  feedItem={feedItem}
                  index={index}
                  totalItems={filteredFeedItems.length}
                  callbacks={communityFeedCallbacks}
                  postSeparator={postSeparator}
                  shouldShowMiniReels={shouldShowMiniReels}
                  miniReelAnchorId={miniReelAnchorId}
                  miniReelsSlot={
                    <MiniReelsCarousel
                      anchorId={miniReelAnchorId}
                      stories={miniReelStories}
                      onOpen={(storyId) =>
                        openVideoStory(storyId, miniReelAnchorId)
                      }
                      onViewAll={() =>
                        saveFreedomFeedReturnState(
                          miniReelStories[0].id,
                          miniReelAnchorId
                        )
                      }
                    />
                  }
                  isPrayerStory={isPrayerStory}
                  getCaptionStyle={getCaptionStyle}
                  getCreationTemplateMetadata={getCreationTemplateMetadata}
                  getCaptionAlign={getCaptionAlign}
                  getCaptionBackground={getCaptionBackground}
                  getCaptionColor={getCaptionColor}
                  getCaptionFont={getCaptionFont}
                  getCaptionSize={getCaptionSize}
                  renderComposedFeedPostVisual={({ captionStyle, story, template }) => (
                    <ComposedFeedPostVisual
                      captionStyle={captionStyle}
                      story={story}
                      template={template}
                    />
                  )}
                  renderComposedFeedPostButton={({ captionStyle, story, template, onOpen }) => (
                    <ComposedFeedPostButton
                      onOpen={onOpen}
                      captionStyle={captionStyle}
                      story={story}
                      template={template}
                    />
                  )}
                  renderCaptionOverlay={(props) => (
                    <FeedCaptionOverlay
                      {...(props as {
                        alignment?: CaptionAlign;
                        background?: CaptionBackground;
                        color?: CaptionColor;
                        font?: CaptionFont;
                        overlayX?: number | null;
                        overlayY?: number | null;
                        size?: CaptionSize;
                        style: CaptionStyle;
                        text: string;
                      })}
                    />
                  )}
                />
              );
            })
          )}
        </div>

        {feedLoadError ? (
          <div role="alert" className={styles.alertError}>
            {feedLoadError}
          </div>
        ) : null}

        {loadingFeed && filteredFeedItems.length > 0 ? (
          <div aria-live="polite" className={styles.loadingState}>
            Loading community feed…
          </div>
        ) : null}

        {!loadingFeed && feedNextCursor ? (
          <div className={styles.loadMoreWrap}>
            <button
              type="button"
              onClick={() => void loadMoreCommunityFeed()}
              disabled={loadingMoreFeed}
              aria-busy={loadingMoreFeed}
              className={styles.loadMoreButton}
            >
              {loadingMoreFeed ? "Loading more…" : "Load more"}
            </button>
            {loadingMoreFeed ? (
              <span className="sr-only" aria-live="polite">
                Loading more community feed items
              </span>
            ) : null}
          </div>
        ) : null}

        {!loadingFeed &&
        !feedNextCursor &&
        feedItems.length > 0 &&
        filteredFeedItems.length > 0 ? (
          <p aria-live="polite" className={styles.endOfFeed}>
            You&apos;ve reached the end of the feed.
          </p>
        ) : null}

        {photoViewerStory && (
          <div
            className="fixed inset-0 z-[90] flex flex-col overflow-hidden bg-black text-white"
            onTouchStart={handlePhotoViewerTouchStart}
            onTouchMove={handlePhotoViewerTouchMove}
            onTouchEnd={handlePhotoViewerTouchEnd}
            onTouchCancel={handlePhotoViewerTouchEnd}
          >
            <div className="fixed left-4 right-4 top-[calc(1rem+env(safe-area-inset-top))] z-[100] flex items-center justify-between">
              <button
                type="button"
                onClick={closePhotoViewer}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-black/65 px-4 text-sm font-black text-white shadow-lg ring-1 ring-white/25 backdrop-blur-md transition hover:bg-black/80 focus:outline-none focus:ring-4 focus:ring-white/25"
                aria-label="Close photo viewer"
              >
                <X className="h-6 w-6" />
                <span>Close</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPhotoActionSheetOpen(true);
                  setPhotoViewerMessage("");
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-black/60"
                aria-label="Open post actions"
              >
                <MoreHorizontal className="h-6 w-6" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-1.5 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-[calc(4.25rem+env(safe-area-inset-top))] sm:px-6 sm:py-20">
              <div className="w-full max-w-[calc(100vw-0.75rem)] sm:max-w-2xl">
                <PinchZoomResetFrame>
                  <ComposedFeedPostVisual
                    captionStyle={getCaptionStyle(photoViewerStory.caption_style)}
                    story={photoViewerStory}
                    template={getCreationTemplateMetadata(
                      photoViewerStory.ai_suggestions
                    )}
                    variant="detail"
                  />
                </PinchZoomResetFrame>
              </div>
            </div>

            {(!photoCaptionHidden || photoViewerMessage) && (
            <div className="absolute bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 md:bottom-8 md:left-1/2 md:right-auto md:w-[min(720px,80vw)] md:-translate-x-1/2">
              <div className="mx-auto max-w-2xl rounded-[1.5rem] bg-black/55 p-4 ring-1 ring-white/10 backdrop-blur-md md:max-w-xl lg:max-w-2xl">
                {!photoCaptionHidden && (
                  <>
                    <div
                      className="max-w-full overflow-hidden break-words text-sm font-black sm:text-base"
                      style={{
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                      }}
                    >
                      {photoViewerStory.name || "HTBF Community"}
                    </div>

                    {photoViewerText && (
                      <>
                        <p
                          className="mt-2 max-w-full overflow-hidden whitespace-pre-wrap break-words text-sm leading-6 text-white/85"
                          style={{
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                            display: "-webkit-box",
                            WebkitBoxOrient: "vertical",
                            WebkitLineClamp: 3,
                          }}
                        >
                          {photoViewerText}
                        </p>

                        {photoViewerTextIsLong && (
                          <button
                            type="button"
                            onClick={() => setPhotoCaptionExpanded(true)}
                            className="mt-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-black text-blue-100 ring-1 ring-white/15 transition hover:bg-white/15"
                          >
                            See more
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}

                {photoViewerMessage && (
                  <div className="mt-3 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-white ring-1 ring-white/15">
                    {photoViewerMessage}
                  </div>
                )}
              </div>
            </div>
            )}

            {photoCaptionExpanded && photoViewerText && (
              <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/55 p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] backdrop-blur-sm sm:pb-4">
                <div className="w-full max-w-lg rounded-[1.5rem] bg-white p-4 text-slate-900 shadow-2xl">
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                    Caption
                  </div>

                  <div
                    className="mt-3 max-h-[55vh] max-w-full overflow-y-auto whitespace-pre-wrap break-words rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700 ring-1 ring-slate-200"
                    style={{
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                    }}
                  >
                    {photoViewerText}
                  </div>

                  <button
                    type="button"
                    onClick={() => setPhotoCaptionExpanded(false)}
                    className="mt-4 flex w-full items-center justify-center rounded-2xl bg-[#0b63ce] px-4 py-3 text-sm font-black text-white transition hover:bg-[#084f9f]"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {photoDetailsStory && (
              <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/55 p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:pb-4">
                <div className="w-full max-w-lg rounded-[1.5rem] bg-white p-5 text-slate-900 shadow-2xl">
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                    HYPER TO BE FREE
                  </div>

                  <h3 className="mt-2 text-2xl font-black text-[#062a57]">
                    Post Details
                  </h3>

                  <div className="mt-4 grid gap-3 text-sm">
                    <DetailRow
                      label="Author"
                      value={photoDetailsStory.name || "HTBF Community"}
                    />
                    <DetailRow
                      label="Location"
                      value={photoDetailsStory.location || "Location not shared"}
                    />
                  </div>

                  {photoDetailsStory.story_text && (
                    <div
                      className="mt-4 max-h-[42vh] max-w-full overflow-y-auto whitespace-pre-wrap break-words rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700 ring-1 ring-slate-200"
                      style={{
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                      }}
                    >
                      {photoDetailsStory.story_text}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setPhotoDetailsStory(null)}
                    className="mt-4 flex w-full items-center justify-center rounded-2xl bg-[#0b63ce] px-4 py-3 text-sm font-black text-white transition hover:bg-[#084f9f]"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {photoActionSheetOpen && (
              <div
                className="fixed inset-0 z-[60] flex items-end justify-center bg-black/35 p-4 backdrop-blur-sm"
                onClick={closePhotoActionSheet}
              >
                <div
                  className="max-h-[78vh] w-full max-w-sm overflow-y-auto rounded-[1.5rem] bg-white p-2 text-slate-900 shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="px-4 pb-2 pt-3 text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                    Post Options
                  </div>

                  <PhotoActionButton
                    icon={<Info className="h-5 w-5" />}
                    label="View Post Details"
                    onClick={() => openPhotoDetails(photoViewerStory)}
                  />
                  {isPrayerStory(photoViewerStory) && (
                    <PhotoActionButton
                      icon={<MessageCircleHeart className="h-5 w-5" />}
                      label={
                        photoViewerStory.user_reactions.includes("praying")
                          ? "Prayer Circle Joined"
                          : "Pray for This"
                      }
                      onClick={() => prayForPhotoStory(photoViewerStory)}
                    />
                  )}
                  <PhotoActionButton
                    icon={<Copy className="h-5 w-5" />}
                    label="Copy Caption"
                    onClick={() => copyPhotoCaption(photoViewerStory)}
                  />
                  <PhotoActionButton
                    icon={
                      photoCaptionHidden ? (
                        <Eye className="h-5 w-5" />
                      ) : (
                        <EyeOff className="h-5 w-5" />
                      )
                    }
                    label={photoCaptionHidden ? "Show Caption" : "Hide Caption"}
                    onClick={togglePhotoCaption}
                  />
                  {photoViewerStory.signed_image_url && (
                    <PhotoActionButton
                      icon={<Download className="h-5 w-5" />}
                      label="Save Photo"
                      onClick={() => savePhoto(photoViewerStory)}
                    />
                  )}
                  <PhotoActionButton
                    icon={<Copy className="h-5 w-5" />}
                    label={
                      photoViewerStory.signed_image_url
                        ? "Copy Photo Link"
                        : "Copy Post Link"
                    }
                    onClick={() => copyPhotoLink(photoViewerStory)}
                  />
                  <PhotoActionButton
                    icon={<Share2 className="h-5 w-5" />}
                    label="Share"
                    onClick={() => sharePhoto(photoViewerStory)}
                  />
                  <PhotoActionButton
                    icon={<Flag className="h-5 w-5" />}
                    label="Report Post"
                    danger
                    onClick={() => reportPhoto(photoViewerStory)}
                  />

                  <button
                    type="button"
                    onClick={closePhotoActionSheet}
                    className="mt-2 flex w-full items-center justify-center rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {(reportStory || reportVideoResponse) && (
          <div
            className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:pb-4"
            onClick={sendingReport ? undefined : closeReportModal}
          >
            <div
              className="w-full max-w-lg rounded-[1.5rem] bg-white p-5 text-slate-900 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="feed-report-modal-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                HYPER TO BE FREE
              </div>

              <h3
                id="feed-report-modal-title"
                className="mt-2 text-2xl font-black text-[#062a57]"
              >
                {reportVideoResponse ? "Report Video" : "Report Post"}
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                {reportVideoResponse
                  ? "Reports help keep HTBF safe and send this video response to the admin review queue."
                  : "Reports help keep HTBF safe and send this story to the admin review queue."}
              </p>

              <label className="mt-4 block text-sm font-black text-[#062a57]">
                Why are you reporting this?
              </label>
              <select
                value={reportVideoResponse ? videoReportReason : reportReason}
                onChange={(event) => {
                  if (reportVideoResponse) {
                    setVideoReportReason(event.target.value);
                    return;
                  }
                  setReportReason(event.target.value as ReportReason);
                }}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
              >
                {(reportVideoResponse
                  ? VIDEO_RESPONSE_REPORT_REASONS
                  : reportReasons
                ).map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>

              <label className="mt-4 block text-sm font-black text-[#062a57]">
                Details, optional
              </label>
              <textarea
                value={reportDetails}
                onChange={(event) => setReportDetails(event.target.value)}
                rows={4}
                placeholder="Add any details that may help the moderator..."
                className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
              />

              {reportModalError ? (
                <p
                  className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
                  role="alert"
                >
                  {reportModalError}
                </p>
              ) : null}

              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeReportModal}
                  disabled={sendingReport}
                  className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={sendingReport}
                  aria-busy={sendingReport}
                  onClick={() => void submitReport()}
                  className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sendingReport ? "Submitting…" : "Submit Report"}
                </button>
              </div>
            </div>
          </div>
        )}

        {answeringPrayerStory && (
          <div className="fixed inset-0 z-50 flex items-end bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
            <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 shadow-2xl">
              <div className="text-xs font-black uppercase tracking-[0.22em] text-[#0b63ce]">
                HYPER TO BE FREE
              </div>

              <h3 className="mt-2 text-2xl font-black leading-tight text-[#062a57]">
                Praise God! How did He answer your prayer?
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Share a short update so others can be encouraged.
              </p>

              <textarea
                value={answeredPrayerText}
                onChange={(event) => setAnsweredPrayerText(event.target.value)}
                rows={7}
                maxLength={MARK_PRAYER_ANSWERED_TEXT_MAX_LENGTH}
                disabled={markingPrayerAnsweredPending}
                placeholder="Share what God did…"
                className="mt-4 min-h-[11rem] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base leading-7 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-4 focus:ring-emerald-50 sm:min-h-[10rem]"
              />

              {reactionMessage && (
                <div className="mt-3 rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-[#082f63]">
                  {reactionMessage}
                </div>
              )}

              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeAnsweredPrayerModal}
                  disabled={markingPrayerAnsweredPending}
                  className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Not Yet
                </button>

                <button
                  type="button"
                  disabled={markingPrayerAnsweredPending}
                  onClick={() =>
                    markPrayerAnswered(
                      answeringPrayerStory.id,
                      answeredPrayerText
                    )
                  }
                  className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {markingPrayerAnsweredPending ? "Sharing…" : "Share Praise"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </section>
  );
}

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${styles.filterButton} ${
        active ? styles.filterButtonActive : styles.filterButtonInactive
      }`}
    >
      {label}
    </button>
  );
}

function ReactionButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${styles.reactionButton} ${
        active ? styles.reactionActive : styles.reactionInactive
      }`}
    >
      <span
        style={{
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {label}
      </span>
    </button>
  );
}

function MiniReelsCarousel({
  anchorId,
  stories,
  onOpen,
  onViewAll,
}: {
  anchorId: string;
  stories: ApprovedStory[];
  onOpen: (storyId: string) => void;
  onViewAll: () => void;
}) {
  if (stories.length === 0) return null;

  return (
    <section
      id={anchorId}
      className="overflow-hidden rounded-[1.75rem] border border-blue-100 bg-gradient-to-br from-[#062a57] via-[#0b63ce] to-[#0f8cff] p-4 text-white shadow-sm"
      aria-label="Community mini reels"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.2em] text-blue-100">
            Faith in Motion
          </div>
          <h3 className="mt-1 text-lg font-black leading-tight">
            Watch what God is doing
          </h3>
        </div>

        <Link
          href="/videos?source=freedom-feed"
          onClick={onViewAll}
          className="shrink-0 rounded-full bg-white/15 px-3 py-2 text-xs font-black text-white ring-1 ring-white/20 transition hover:bg-white/25"
        >
          View all
        </Link>
      </div>

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {stories.map((story) => {
          const caption = story.story_text?.trim() || "Video testimony";

          return (
            <button
              key={story.id}
              type="button"
              onClick={() => onOpen(story.id)}
              className="group w-32 shrink-0 overflow-hidden rounded-[1.25rem] bg-black/35 text-left shadow-sm ring-1 ring-white/15 transition hover:-translate-y-0.5 hover:bg-black/45 focus:outline-none focus:ring-4 focus:ring-white/30 sm:w-36"
              aria-label={`Open community reel from ${
                story.name || "HTBF Community"
              }`}
            >
              <div className="relative aspect-[9/14] overflow-hidden bg-black">
                {story.signed_video_url ? (
                  <MiniReelPreviewVideo videoUrl={story.signed_video_url} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-blue-950">
                    <Video className="h-8 w-8 text-white/70" />
                  </div>
                )}

                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-2">
                  <div className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-black text-[#062a57] shadow-sm">
                    <Video className="h-3 w-3" />
                    Watch
                  </div>
                </div>
              </div>

              <div className="p-2.5">
                <div className="truncate text-[11px] font-black text-blue-100">
                  {story.name || "HTBF Community"}
                </div>
                <p
                  className="mt-1 text-xs font-bold leading-4 text-white"
                  style={{
                    display: "-webkit-box",
                    WebkitBoxOrient: "vertical" as const,
                    WebkitLineClamp: 2,
                    overflow: "hidden",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                  }}
                >
                  {caption}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function MiniReelPreviewVideo({ videoUrl }: { videoUrl: string }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [shouldLoadPreview, setShouldLoadPreview] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;

    if (!frame) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const video = videoRef.current;
        const isNearViewport = entry.isIntersecting;
        const isPlayable = entry.intersectionRatio >= 0.55;

        if (isNearViewport) {
          setShouldLoadPreview(true);
        }

        if (!video) return;

        if (isPlayable) {
          pauseAllFeedPreviewVideos(video);
          void video.play().catch(() => {
            // Keep the static frame if mobile autoplay is delayed.
          });
        } else {
          video.pause();
        }
      },
      {
        root: null,
        rootMargin: "160px 0px",
        threshold: [0, 0.35, 0.55, 0.8],
      }
    );

    observer.observe(frame);

    return () => {
      observer.disconnect();
      videoRef.current?.pause();
    };
  }, [videoUrl]);

  return (
    <div ref={frameRef} className="h-full w-full">
      {shouldLoadPreview ? (
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          loop
          playsInline
          preload="metadata"
          data-freedom-feed-preview-video="true"
          className={`pointer-events-none transition duration-300 group-hover:scale-105 ${FEED_MEDIA_EL_CLASS}`}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;

            video.muted = true;
            video.defaultMuted = true;
            video.playsInline = true;
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-blue-950">
          <Video className="h-8 w-8 text-white/70" />
        </div>
      )}
    </div>
  );
}

function CollapsibleStoryText({
  className = "mt-4",
  onOpen,
  text,
}: {
  className?: string;
  onOpen?: () => void;
  text: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const cleanText = text?.trim();

  if (!cleanText) return null;

  const isLong = cleanText.length > 180;
  const visibleText =
    !isLong || expanded ? cleanText : `${cleanText.slice(0, 180).trim()}...`;

  return (
    <div className={className}>
      <p className={styles.postCaption}>{visibleText}</p>

      {isLong && onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="mt-2 inline-flex min-h-[2.75rem] items-center rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100"
        >
          Open full post
        </button>
      ) : null}

      {isLong && !onOpen ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-2 inline-flex min-h-[2.75rem] items-center rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100"
        >
          {expanded ? "See less" : "See more"}
        </button>
      ) : null}
    </div>
  );
}

function ComposedFeedPostButton({
  captionStyle,
  onOpen,
  story,
  template,
}: {
  captionStyle: CaptionStyle;
  onOpen: () => void;
  story: ApprovedStory;
  template: CreationTemplateMetadata;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full cursor-pointer overflow-hidden rounded-none bg-[#062a57] text-left shadow-sm ring-0 transition hover:ring-blue-200 focus:outline-none focus:ring-4 focus:ring-blue-100 md:rounded-[0.625rem] md:ring-1 md:ring-blue-100"
      aria-label="Open post"
    >
      <ComposedFeedPostVisual
        captionStyle={captionStyle}
        story={story}
        template={template}
      />
    </button>
  );
}

function ComposedFeedPostVisual({
  captionStyle,
  story,
  template,
  variant = "feed",
}: {
  captionStyle: CaptionStyle;
  story: ApprovedStory;
  template?: CreationTemplateMetadata | null;
  variant?: "feed" | "detail";
}) {
  const creatorStudioDesign = readStoredCreatorStudioDesignFromStory(story);

  if (creatorStudioDesign) {
    console.log("[CreatorStudio/pipeline] feed render design JSON", {
      storyId: story.id,
      creation_mode: story.creation_mode,
      selectedDesignId: creatorStudioDesign.id,
      templateId: creatorStudioDesign.templateId,
      layoutType: creatorStudioDesign.layoutType,
      feedRenderDesignJson: creatorStudioDesign,
    });

    return (
      <CreatorStudioStoryRenderer
        design={creatorStudioDesign}
        photoPreviewUrl={story.signed_image_url}
        videoPreviewUrl={story.signed_video_url ?? story.video_url}
        variant={variant === "detail" ? "detail" : "feed"}
      />
    );
  }

  const cleanText = story.story_text?.trim() ?? "";
  const isTemplateLong = cleanText.length > 260;
  const visibleTemplateText =
    variant === "feed" && isTemplateLong
      ? `${cleanText.slice(0, 260).trim()}...`
      : cleanText;
  const templateFrameClass =
    variant === "detail"
      ? "relative min-h-[68dvh] overflow-hidden rounded-[1.5rem] bg-[#062a57] p-4 text-white sm:min-h-[42rem] sm:p-6"
      : "relative min-h-[22rem] overflow-hidden rounded-none bg-[#062a57] p-5 text-white sm:min-h-[25rem] md:rounded-[0.625rem] sm:p-6";
  const templateInnerClass =
    variant === "detail"
      ? "relative z-10 flex min-h-[calc(68dvh-2rem)] flex-col justify-between sm:min-h-[39rem]"
      : "relative z-10 flex min-h-[19.5rem] flex-col justify-between sm:min-h-[22.5rem]";
  const templateTextClass =
    variant === "detail"
      ? "whitespace-pre-wrap break-words text-[clamp(1.45rem,7vw,2.35rem)] font-black leading-tight text-white drop-shadow-sm sm:text-4xl sm:leading-tight"
      : "whitespace-pre-wrap break-words text-xl font-black leading-8 text-white drop-shadow-sm sm:text-2xl sm:leading-9";
  const imageFrameClass =
    variant === "detail"
      ? "relative overflow-hidden rounded-[1.5rem] bg-black ring-1 ring-white/10"
      : "relative overflow-hidden rounded-none bg-slate-100 ring-0 md:rounded-[0.625rem] md:ring-1 md:ring-slate-200";
  const imageClass =
    variant === "detail"
      ? "pointer-events-none block max-h-[74dvh] w-full max-w-full rounded-[1.5rem] object-contain"
      : "pointer-events-none block max-h-[520px] w-full max-w-full rounded-none object-cover md:rounded-[0.625rem]";

  if (template && cleanText) {
    return (
      <div className={templateFrameClass}>
        <img
          src={template.imagePath}
          alt=""
          loading="lazy"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />

        <div className={templateInnerClass}>
          <div className="flex items-start justify-between gap-3">
            <div />
            <img
              src="/images/htbf-logo.png"
              alt=""
              loading="lazy"
              className="pointer-events-none h-9 w-9 shrink-0 rounded-full bg-white/80 object-contain p-1.5 opacity-85 shadow-sm ring-1 ring-white/50"
            />
          </div>

          <div className="mt-8">
            <p
              className={templateTextClass}
              style={{
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              }}
            >
              {visibleTemplateText}
            </p>

            {variant === "feed" && isTemplateLong && (
              <span className="mt-4 inline-flex rounded-full bg-white/90 px-4 py-2 text-xs font-black text-[#0b63ce] ring-1 ring-white/50 backdrop-blur-sm">
                Open full post
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (story.signed_image_url) {
    return (
      <div className={imageFrameClass}>
        <img
          src={story.signed_image_url}
          alt="HTBF post image"
          className={imageClass}
        />

        <StoryMediaStamp stamp={getVideoTemplate(story.video_template)} />

        {cleanText && captionStyle !== "classic-caption" && (
          <FeedCaptionOverlay
            alignment={getCaptionAlign(story.caption_align)}
            background={getCaptionBackground(
              story.caption_background,
              captionStyle
            )}
            color={getCaptionColor(story.caption_color)}
            font={getCaptionFont(story.caption_font, captionStyle)}
            size={getCaptionSize(story.caption_size)}
            style={captionStyle}
            text={cleanText}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="max-w-full whitespace-pre-wrap break-words rounded-none bg-slate-50 p-5 text-[18px] leading-8 text-slate-800 ring-0 md:rounded-[0.625rem] md:ring-1 md:ring-slate-200"
      style={{
        overflowWrap: "anywhere",
        wordBreak: "break-word",
      }}
    >
      {cleanText || "HTBF post"}
    </div>
  );
}

function PinchZoomResetFrame({ children }: { children?: ReactNode }) {
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState("50% 50%");
  const [settling, setSettling] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const initialDistanceRef = useRef<number | null>(null);
  const settlingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function getTouchDistance(touches: React.TouchList) {
    if (touches.length < 2) return 0;

    const firstTouch = touches[0];
    const secondTouch = touches[1];
    const dx = firstTouch.clientX - secondTouch.clientX;
    const dy = firstTouch.clientY - secondTouch.clientY;

    return Math.sqrt(dx * dx + dy * dy);
  }

  function updateTransformOrigin(touches: React.TouchList) {
    const frame = frameRef.current;

    if (!frame || touches.length < 2) return;

    const firstTouch = touches[0];
    const secondTouch = touches[1];

    const frameBounds = frame.getBoundingClientRect();
    const centerX =
      ((firstTouch.clientX + secondTouch.clientX) / 2 - frameBounds.left) /
      frameBounds.width;
    const centerY =
      ((firstTouch.clientY + secondTouch.clientY) / 2 - frameBounds.top) /
      frameBounds.height;

    setOrigin(
      `${Math.min(100, Math.max(0, centerX * 100))}% ${Math.min(
        100,
        Math.max(0, centerY * 100)
      )}%`
    );
  }

  function resetZoom() {
    initialDistanceRef.current = null;
    setSettling(true);
    setScale(1);
    setOrigin("50% 50%");

    if (settlingTimeoutRef.current) {
      clearTimeout(settlingTimeoutRef.current);
    }

    settlingTimeoutRef.current = setTimeout(() => {
      setSettling(false);
      settlingTimeoutRef.current = null;
    }, 220);
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length < 2) return;

    const distance = getTouchDistance(event.touches);

    if (!distance) return;

    if (settlingTimeoutRef.current) {
      clearTimeout(settlingTimeoutRef.current);
      settlingTimeoutRef.current = null;
    }

    initialDistanceRef.current = distance;
    setSettling(false);
    updateTransformOrigin(event.touches);
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length < 2 || !initialDistanceRef.current) return;

    const distance = getTouchDistance(event.touches);

    if (!distance) return;

    event.preventDefault();
    event.stopPropagation();
    updateTransformOrigin(event.touches);
    setScale(Math.min(2.6, Math.max(1, distance / initialDistanceRef.current)));
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length < 2 && initialDistanceRef.current) {
      resetZoom();
    }
  }

  useEffect(() => {
    return () => {
      if (settlingTimeoutRef.current) {
        clearTimeout(settlingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={frameRef}
      className="overflow-visible"
      onTouchCancel={resetZoom}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onTouchStart={handleTouchStart}
      style={{
        touchAction: scale > 1 ? "none" : "pan-y",
      }}
    >
      <div
        className="will-change-transform"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: origin,
          transition: settling ? "transform 220ms ease-out" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function FeedCaptionOverlay({
  alignment,
  background,
  color,
  font,
  overlayX,
  overlayY,
  reserveBottomAction = false,
  size,
  style,
  text,
}: {
  alignment?: CaptionAlign;
  background?: CaptionBackground;
  color?: CaptionColor;
  font?: CaptionFont;
  overlayX?: number | null;
  overlayY?: number | null;
  reserveBottomAction?: boolean;
  size?: CaptionSize;
  style: CaptionStyle;
  text: string;
}) {
  const fallbackPosition = getFeedOverlayDefaultPosition(
    style,
    reserveBottomAction
  );

  return (
    <StoryOverlayText
      alignment={alignment}
      background={background}
      color={color}
      font={font}
      maxLines={4}
      overlayContext="freedom-feed"
      overlayX={overlayX ?? fallbackPosition.x}
      overlayY={overlayY ?? fallbackPosition.y}
      size={size}
      style={style}
      text={text}
    />
  );
}

function FreedomFeedVideoMediaFrame({
  children,
  stamp,
  videoUrl,
  posterUrl,
}: {
  children?: ReactNode;
  stamp: VideoTemplate;
  videoUrl: string;
  posterUrl?: string | null;
}) {
  const [shouldLoadPreview, setShouldLoadPreview] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const frame = frameRef.current;

    if (!frame) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const video = videoRef.current;
        const isNearViewport = entry.isIntersecting;
        const isPlayable = entry.intersectionRatio >= 0.45;

        if (isNearViewport) {
          setShouldLoadPreview(true);
        }

        if (!video) return;

        if (isPlayable) {
          pauseAllFeedPreviewVideos(video);
          void video.play().catch(() => {
            // Mobile browsers may delay autoplay; keep the poster frame visible.
          });
        } else {
          video.pause();
        }
      },
      {
        root: null,
        rootMargin: "180px 0px",
        threshold: [0, 0.25, 0.45, 0.7],
      }
    );

    observer.observe(frame);

    return () => {
      observer.disconnect();
      videoRef.current?.pause();
    };
  }, [videoUrl]);

  return (
    <div ref={frameRef} className={FEED_MEDIA_FRAME_CLASS}>
      {shouldLoadPreview ? (
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="metadata"
          data-freedom-feed-preview-video="true"
          className={`pointer-events-none bg-black ${FEED_MEDIA_EL_CLASS}`}
          src={videoUrl}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;

            video.muted = true;
            video.defaultMuted = true;
            video.playsInline = true;
          }}
        >
          Your browser does not support the video tag.
        </video>
      ) : posterUrl ? (
        <img
          src={posterUrl}
          alt=""
          className={`pointer-events-none bg-black ${FEED_MEDIA_EL_CLASS}`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-black text-white/60">
          <Video className="h-10 w-10" />
        </div>
      )}

      <StoryMediaStamp stamp={stamp} />
      {children}
    </div>
  );
}

function getFeedOverlayDefaultPosition(
  style: CaptionStyle,
  reserveBottomAction: boolean
) {
  if (style === "bold-center" || style === "testimony-quote") {
    return { x: 50, y: 50 };
  }

  if (style === "scripture-card") {
    return { x: 50, y: 18 };
  }

  if (style === "minimal-white" || style === "black-outline") {
    return { x: 50, y: 18 };
  }

  return { x: 50, y: reserveBottomAction ? 68 : 82 };
}

function PhotoActionButton({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: ReactNode;
  label: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-black transition ${
        danger
          ? "text-red-700 hover:bg-red-50"
          : "text-slate-800 hover:bg-blue-50"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          danger ? "bg-red-50 text-red-700" : "bg-blue-50 text-[#0b63ce]"
        }`}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div
        className="mt-1 max-w-full overflow-hidden break-words text-sm font-black text-slate-800"
        style={{
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}
