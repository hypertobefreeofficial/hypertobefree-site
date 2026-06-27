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
  Globe2,
  Info,
  MoreHorizontal,
  Plus,
  Video,
  MessageCircleHeart,
  Sparkles,
  CheckCircle2,
  Share2,
  UserX,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import {
  creationCenterStoryTemplates,
  type CreationCenterTemplateId,
} from "../lib/creationCenter";
import StoryMediaStamp from "./StoryMediaStamp";
import StoryOverlayText from "./StoryOverlayText";

type ReactionType = "amen" | "praise_god" | "encouraged" | "praying";
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

type ApprovedStory = {
  id: string;
  user_id: string | null;
  name: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  overlay_text: string | null;
  overlay_x: number | null;
  overlay_y: number | null;
  caption_style: CaptionStyle | null;
  caption_font: CaptionFont;
  caption_background: CaptionBackground;
  caption_template: CaptionTemplate | null;
  caption_color: CaptionColor;
  caption_size: CaptionSize;
  caption_align: CaptionAlign;
  video_template: VideoTemplate;
  htbf_watermark_enabled: boolean;
  silhouette_watermark_enabled: boolean;
  shared_htbf_intro_enabled: boolean;
  image_url: string | null;
  signed_image_url: string | null;
  video_url: string | null;
  signed_video_url: string | null;
  status: string | null;
  created_at: string | null;
  prayer_status: string | null;
  answered_at: string | null;
  answered_text: string | null;
  ai_suggestions: unknown | null;
  reaction_counts: {
    amen: number;
    praise_god: number;
    encouraged: number;
    praying: number;
  };
  user_reactions: ReactionType[];
};

type CreationTemplateMetadata = {
  id: CreationCenterTemplateId;
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

function restoreFreedomFeedReturnPosition(clearAfterRestore = true) {
  if (typeof window === "undefined") return;

  const state = readFreedomFeedReturnState();

  if (!state) return;

  window.requestAnimationFrame(() => {
    const storyElement = state.anchorId
      ? document.getElementById(state.anchorId)
      : getFreedomFeedStoryElement(state.storyId);

    if (storyElement) {
      const nextTop =
        window.scrollY +
        storyElement.getBoundingClientRect().top -
        state.storyViewportTop;

      window.scrollTo({
        top: Math.max(0, nextTop),
        behavior: "auto",
      });
    } else {
      window.scrollTo({
        top: Math.max(0, state.scrollY),
        behavior: "auto",
      });
    }

    if (clearAfterRestore) {
      window.sessionStorage.removeItem(FREEDOM_FEED_RETURN_STATE_KEY);
    }
  });
}

const reportReasons: { label: string; value: ReportReason }[] = [
  { label: "Inappropriate content", value: "inappropriate" },
  { label: "Harassment or hate", value: "harassment_hate" },
  { label: "Violence or harmful content", value: "violence_harmful" },
  { label: "Spam or misleading", value: "spam" },
  { label: "Other", value: "other" },
];

export default function FreedomFeed({
  defaultFilter = "all",
  lockedFilter = false,
}: {
  defaultFilter?: FeedFilter;
  lockedFilter?: boolean;
}) {
  const [stories, setStories] = useState<ApprovedStory[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [reactionMessage, setReactionMessage] = useState("");
  const [activeFilter, setActiveFilter] = useState<FeedFilter>(defaultFilter);
  const [answeringPrayerStory, setAnsweringPrayerStory] =
    useState<ApprovedStory | null>(null);
  const [answeredPrayerText, setAnsweredPrayerText] = useState("");
  const [photoViewerStory, setPhotoViewerStory] =
    useState<ApprovedStory | null>(null);
  const [photoActionSheetOpen, setPhotoActionSheetOpen] = useState(false);
  const [photoViewerMessage, setPhotoViewerMessage] = useState("");
  const [photoCaptionExpanded, setPhotoCaptionExpanded] = useState(false);
  const [photoCaptionHidden, setPhotoCaptionHidden] = useState(false);
  const [photoDetailsStory, setPhotoDetailsStory] =
    useState<ApprovedStory | null>(null);
  const [reportStory, setReportStory] = useState<ApprovedStory | null>(null);
  const [reportReason, setReportReason] =
    useState<ReportReason>("inappropriate");
  const [reportDetails, setReportDetails] = useState("");
  const [sendingReport, setSendingReport] = useState(false);
  const [savedStoryIds, setSavedStoryIds] = useState<string[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const currentUserIdRef = useRef<string | null>(null);
  const feedReloadInFlightRef = useRef(false);
  const feedReloadQueuedRef = useRef(false);
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

    async function reloadFeed() {
      if (cancelled) return;

      if (feedReloadInFlightRef.current) {
        feedReloadQueuedRef.current = true;
        return;
      }

      feedReloadInFlightRef.current = true;

      try {
        await loadApprovedStories(currentUserIdRef.current);
      } finally {
        feedReloadInFlightRef.current = false;

        if (feedReloadQueuedRef.current && !cancelled) {
          feedReloadQueuedRef.current = false;
          void reloadFeed();
        }
      }
    }

    async function loadPage() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      currentUserIdRef.current = user?.id ?? null;
      setUserId(currentUserIdRef.current);

      if (currentUserIdRef.current) {
        await loadAccountSafety(currentUserIdRef.current);
      } else {
        setSavedStoryIds([]);
        setBlockedUserIds([]);
      }

      await reloadFeed();
    }

    void loadPage();

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
        () => {
          void reloadFeed();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stories",
        },
        () => {
          void reloadFeed();
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      cancelled = true;
      feedReloadQueuedRef.current = false;
      feedReloadInFlightRef.current = false;
      supabase.removeChannel(channel);
      realtimeChannelRef.current = null;
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

    if (!templateId || templateId === "none") return null;

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
    const [savedResult, blockedResult] = await Promise.all([
      supabase
        .from("saved_content")
        .select("story_id")
        .eq("user_id", currentUserId),
      supabase
        .from("blocked_users")
        .select("blocked_user_id")
        .eq("blocker_user_id", currentUserId),
    ]);

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

    if (blockedResult.error) {
      console.error("Could not load blocked users:", blockedResult.error);
    } else {
      const blockedRows: unknown[] = Array.isArray(blockedResult.data)
        ? blockedResult.data
        : [];
      setBlockedUserIds(
        blockedRows.flatMap((row) =>
          typeof row === "object" &&
          row !== null &&
          "blocked_user_id" in row &&
          typeof row.blocked_user_id === "string"
            ? [row.blocked_user_id]
            : []
        )
      );
    }
  }

  async function loadApprovedStories(currentUserId: string | null) {
    const { data, error } = await supabase
      .from("stories")
      .select(
        "id, user_id, name, location, story_type, story_text, overlay_text, overlay_x, overlay_y, caption_style, caption_font, caption_background, caption_template, caption_color, caption_size, caption_align, video_template, htbf_watermark_enabled, silhouette_watermark_enabled, shared_htbf_intro_enabled, image_url, video_url, status, created_at, prayer_status, answered_at, answered_text, ai_suggestions"
      )
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(40);

    if (error || !data) {
      console.error("Could not load approved stories:", error);
      return;
    }

    const storyIds = data.map((story) => story.id);

    let reactions: ReactionRow[] = [];

    if (storyIds.length > 0) {
      const { data: reactionData } = await supabase
        .from("story_reactions")
        .select("story_id, user_id, reaction_type")
        .in("story_id", storyIds);

      reactions = (reactionData as ReactionRow[]) ?? [];
    }

    const updatedStories: ApprovedStory[] = await Promise.all(
      data.map(async (story) => {
        let signedImageUrl: string | null = null;
        let signedVideoUrl: string | null = null;

        if (story.image_url) {
          const storagePath = getPhotoStoragePath(story.image_url);

          if (storagePath) {
            const { data: signedData, error: signedError } =
              await supabase.storage
                .from(STORY_IMAGE_BUCKET)
                .createSignedUrl(storagePath, 60 * 60);

            if (signedError) {
              console.error("Could not create signed photo URL:", signedError);
            }

            signedImageUrl = signedData?.signedUrl ?? null;
          } else if (story.image_url.startsWith("http")) {
            signedImageUrl = story.image_url;
          }
        }

        if (story.video_url) {
          const storagePath = getVideoStoragePath(story.video_url);

          if (storagePath) {
            const { data: signedData, error: signedError } =
              await supabase.storage
                .from("story-videos")
                .createSignedUrl(storagePath, 60 * 60);

            if (signedError) {
              console.error("Could not create signed video URL:", signedError);
            }

            signedVideoUrl = signedData?.signedUrl ?? null;
          } else if (story.video_url.startsWith("http")) {
            signedVideoUrl = story.video_url;
          }
        }

        const storyReactions = reactions.filter(
          (reaction) => reaction.story_id === story.id
        );

        const userReactions = storyReactions
          .filter((reaction) => reaction.user_id === currentUserId)
          .map((reaction) => reaction.reaction_type)
          .filter(
            (reaction): reaction is ReactionType =>
              reaction === "amen" ||
              reaction === "praise_god" ||
              reaction === "encouraged" ||
              reaction === "praying"
          );

        const captionStyle = getCaptionStyle(story.caption_style);

        return {
          id: story.id,
          user_id: story.user_id,
          name: story.name,
          location: story.location,
          story_type: story.story_type,
          story_text: story.story_text,
          overlay_text: story.overlay_text ?? null,
          overlay_x: readNumber(story.overlay_x),
          overlay_y: readNumber(story.overlay_y),
          caption_style: captionStyle,
          caption_font: getCaptionFont(story.caption_font, captionStyle),
          caption_background: getCaptionBackground(
            story.caption_background,
            captionStyle
          ),
          caption_template: getCaptionTemplate(story.caption_template),
          caption_color: getCaptionColor(story.caption_color),
          caption_size: getCaptionSize(story.caption_size),
          caption_align: getCaptionAlign(story.caption_align),
          video_template: getVideoTemplate(story.video_template),
          htbf_watermark_enabled: story.htbf_watermark_enabled !== false,
          silhouette_watermark_enabled:
            story.silhouette_watermark_enabled === true,
          shared_htbf_intro_enabled:
            story.shared_htbf_intro_enabled === true,
          image_url: story.image_url,
          signed_image_url: signedImageUrl,
          video_url: story.video_url,
          signed_video_url: signedVideoUrl,
          status: story.status,
          created_at: story.created_at,
          prayer_status: story.prayer_status ?? "active",
          answered_at: story.answered_at,
          answered_text: story.answered_text,
          ai_suggestions: story.ai_suggestions ?? null,
          reaction_counts: {
            amen: storyReactions.filter(
              (reaction) => reaction.reaction_type === "amen"
            ).length,
            praise_god: storyReactions.filter(
              (reaction) => reaction.reaction_type === "praise_god"
            ).length,
            encouraged: storyReactions.filter(
              (reaction) => reaction.reaction_type === "encouraged"
            ).length,
            praying: storyReactions.filter(
              (reaction) => reaction.reaction_type === "praying"
            ).length,
          },
          user_reactions: userReactions,
        };
      })
    );

    setStories(updatedStories);
  }

  const filteredStories = useMemo(() => {
    const visibleStories = stories.filter(
      (story) =>
        !story.user_id || !blockedUserIds.includes(story.user_id)
    );

    if (activeFilter === "all") return visibleStories;

    if (activeFilter === "videos") {
      return visibleStories.filter(
        (story) => story.signed_video_url || story.video_url
      );
    }

    if (activeFilter === "testimony") {
      return visibleStories.filter((story) =>
        story.story_type?.toLowerCase().includes("testimony")
      );
    }

    if (activeFilter === "praise") {
      return visibleStories.filter((story) =>
        story.story_type?.toLowerCase().includes("praise")
      );
    }

    if (activeFilter === "prayer") {
      return visibleStories.filter((story) =>
        story.story_type?.toLowerCase().includes("prayer")
      );
    }

    if (activeFilter === "answered") {
      return visibleStories.filter(
        (story) =>
          story.story_type?.toLowerCase().includes("prayer") &&
          story.prayer_status === "answered"
      );
    }

    return visibleStories;
  }, [activeFilter, blockedUserIds, stories]);

  const miniReelStories = useMemo(
    () =>
      stories
        .filter(
          (story) =>
            Boolean(story.signed_video_url) &&
            (!story.user_id || !blockedUserIds.includes(story.user_id))
        )
        .slice(0, 12),
    [blockedUserIds, stories]
  );

  const showMiniReelsInFeed =
    !lockedFilter && activeFilter === "all" && miniReelStories.length > 0;

  useEffect(() => {
    if (restoredReturnPositionRef.current || filteredStories.length === 0) {
      return;
    }

    if (!readFreedomFeedReturnState()) return;

    restoredReturnPositionRef.current = true;
    restoreFreedomFeedReturnPosition();
  }, [filteredStories.length]);

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
    setReactionMessage("");

    if (!userId || !story.user_id) {
      setReactionMessage("Please sign in to block users.");
      return;
    }

    if (story.user_id === userId) return;

    const { error } = await supabase.from("blocked_users").upsert(
      {
        blocker_user_id: userId,
        blocked_user_id: story.user_id,
      },
      { onConflict: "blocker_user_id,blocked_user_id" }
    );

    if (error) {
      setReactionMessage(`Could not block user: ${error.message}`);
      return;
    }

    setBlockedUserIds((current) =>
      current.includes(story.user_id as string)
        ? current
        : [...current, story.user_id as string]
    );
    setReactionMessage("User blocked. Their content is now hidden.");
  }

  async function toggleReaction(storyId: string, reactionType: ReactionType) {
    setReactionMessage("");

    if (!userId) {
      setReactionMessage("Please sign in to react to stories.");
      return;
    }

    const story = stories.find((item) => item.id === storyId);
    const alreadyReacted = story?.user_reactions.includes(reactionType);

    if (alreadyReacted) {
      const { error } = await supabase
        .from("story_reactions")
        .delete()
        .eq("story_id", storyId)
        .eq("user_id", userId)
        .eq("reaction_type", reactionType);

      if (error) {
        setReactionMessage(`Could not remove reaction: ${error.message}`);
        return;
      }

      updateLocalReaction(storyId, reactionType, "remove");
      return;
    }

    const { error } = await supabase.from("story_reactions").insert({
      story_id: storyId,
      user_id: userId,
      reaction_type: reactionType,
    });

    if (error) {
      setReactionMessage(`Could not add reaction: ${error.message}`);
      return;
    }

    updateLocalReaction(storyId, reactionType, "add");
  }

  function updateLocalReaction(
    storyId: string,
    reactionType: ReactionType,
    action: "add" | "remove"
  ) {
    setStories((currentStories) =>
      currentStories.map((story) => {
        if (story.id !== storyId) return story;

        const nextCount =
          action === "add"
            ? story.reaction_counts[reactionType] + 1
            : Math.max(story.reaction_counts[reactionType] - 1, 0);

        const nextUserReactions =
          action === "add"
            ? [...story.user_reactions, reactionType]
            : story.user_reactions.filter(
                (reaction) => reaction !== reactionType
              );

        return {
          ...story,
          reaction_counts: {
            ...story.reaction_counts,
            [reactionType]: nextCount,
          },
          user_reactions: nextUserReactions,
        };
      })
    );
  }

  function closeAnsweredPrayerModal() {
    setAnsweringPrayerStory(null);
    setAnsweredPrayerText("");
    setReactionMessage("");
  }

  async function markPrayerAnswered(storyId: string, answeredText: string) {
    setReactionMessage("");

    if (!userId) {
      setReactionMessage("Please sign in to mark a prayer request answered.");
      return;
    }

    const story = stories.find((item) => item.id === storyId);

    if (!story) {
      setReactionMessage("Could not find this prayer request.");
      return;
    }

    if (story.user_id !== userId) {
      setReactionMessage(
        "Only the person who shared this prayer request can mark it answered."
      );
      return;
    }

    const cleanAnsweredText = answeredText.trim();

    if (!cleanAnsweredText) {
      setReactionMessage(
        "Please add a short answered prayer update before marking this answered."
      );
      return;
    }

    const answeredAt = new Date().toISOString();

    const { error } = await supabase
      .from("stories")
      .update({
        prayer_status: "answered",
        answered_at: answeredAt,
        answered_text: cleanAnsweredText,
      })
      .eq("id", storyId)
      .eq("user_id", userId);

    if (error) {
      setReactionMessage(`Could not mark prayer answered: ${error.message}`);
      return;
    }

    setStories((currentStories) =>
      currentStories.map((currentStory) =>
        currentStory.id === storyId
          ? {
              ...currentStory,
              prayer_status: "answered",
              answered_at: answeredAt,
              answered_text: cleanAnsweredText,
            }
          : currentStory
      )
    );

    closeAnsweredPrayerModal();
    setReactionMessage("Praise shared with the community.");
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

  function closeReportModal() {
    setReportStory(null);
    setReportReason("inappropriate");
    setReportDetails("");
    setSendingReport(false);
  }

  async function submitReport() {
    if (!userId || !reportStory) {
      setPhotoViewerMessage("Please sign in to report a post.");
      return;
    }

    setSendingReport(true);
    setPhotoViewerMessage("");

    const cleanDetails = reportDetails.trim();

    const { error } = await supabase.from("content_reports").insert({
      story_id: reportStory.id,
      reporter_user_id: userId,
      reported_user_id: reportStory.user_id,
      reason: reportReason,
      details: cleanDetails || null,
      status: "open",
    });

    setSendingReport(false);

    if (error) {
      setPhotoViewerMessage(`Could not report post: ${error.message}`);
      return;
    }

    closeReportModal();
    setPhotoViewerMessage(
      "Report submitted. Thank you for helping keep HTBF safe."
    );
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

  return (
    <section
      id="stories"
      className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-10"
    >
      <div className="mx-auto max-w-3xl">
        {!lockedFilter && (
          <div className="mb-6 rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#0b63ce]">
                <Sparkles className="h-6 w-6" />
              </div>

              <Link
                href="/share-your-story"
                className="flex min-h-12 flex-1 items-center rounded-full bg-slate-100 px-5 text-left text-base font-semibold text-slate-500 hover:bg-slate-200"
              >
                What has God done?
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-sm font-bold text-slate-600">
              <Link
                href="/share-your-story"
                className="flex items-center justify-center gap-2 rounded-2xl px-2 py-2 hover:bg-blue-50 hover:text-[#0b63ce]"
              >
                <Plus className="h-4 w-4" />
                Story
              </Link>

              <Link
                href="/videos"
                className="flex items-center justify-center gap-2 rounded-2xl px-2 py-2 hover:bg-blue-50 hover:text-[#0b63ce]"
              >
                <Video className="h-4 w-4" />
                Videos
              </Link>

              <Link
                href="/prayer"
                className="flex items-center justify-center gap-2 rounded-2xl px-2 py-2 hover:bg-blue-50 hover:text-[#0b63ce]"
              >
                <MessageCircleHeart className="h-4 w-4" />
                Prayer
              </Link>
            </div>
          </div>
        )}

        <div className="mb-6">
          <div className="mb-4">
            <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
              {feedLabel}
            </div>

            <h2 className="mt-1 text-3xl font-black tracking-tight text-[#062a57] sm:text-4xl">
              {feedHeading}
            </h2>
          </div>

          {!lockedFilter && (
            <div className="flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
          )}
        </div>

        {reactionMessage && (
          <div className="mb-5 rounded-2xl bg-blue-50 p-4 text-sm font-semibold text-[#082f63]">
            {reactionMessage}
          </div>
        )}

        <div className="space-y-5">
          {filteredStories.length === 0 ? (
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
              {emptyMessage}
            </div>
          ) : (
            filteredStories.map((story, index) => {
              const prayerStory = isPrayerStory(story);
              const originalPoster = isOriginalPoster(story);
              const prayerAnswered = story.prayer_status === "answered";
              const captionStyle = getCaptionStyle(story.caption_style);
              const hasVideoMedia = Boolean(
                story.signed_video_url || story.video_url
              );
              const hasImageMedia = Boolean(story.signed_image_url);
              const overlayText = story.overlay_text?.trim() ?? "";
              const creationTemplate = getCreationTemplateMetadata(
                story.ai_suggestions
              );
              const showCreationTemplateCard = Boolean(
                creationTemplate &&
                  story.story_text &&
                  !hasVideoMedia &&
                  !hasImageMedia
              );
              const showInlineStoryText =
                Boolean(story.story_text) &&
                !showCreationTemplateCard &&
                !hasVideoMedia &&
                (!hasImageMedia || captionStyle === "classic-caption");
              const showVideoCaptionText =
                Boolean(story.story_text) && hasVideoMedia;
              const miniReelAnchorId = `freedom-feed-mini-reels-${index + 1}`;
              const shouldShowMiniReels =
                showMiniReelsInFeed &&
                (index + 1) % 12 === 0 &&
                index < filteredStories.length - 1;

              return (
                <Fragment key={story.id}>
                <article
                  id={`freedom-feed-story-${story.id}`}
                  className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm"
                >
                  <div className="p-5">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-lg font-black text-[#0b63ce]">
                        {(story.name || "H").charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <div className="min-w-0 max-w-full break-words font-black text-slate-900">
                            {story.name || "HTBF Community"}
                          </div>

                          {prayerStory && prayerAnswered && (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                              Answered
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-sm font-medium text-slate-500">
                          <Globe2 className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 break-words">
                            {story.location || "Location not shared"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {story.signed_image_url && (
                      <button
                        type="button"
                        onClick={() => openStoryDetail(story)}
                        className="mt-4 block w-full max-w-full cursor-pointer overflow-hidden rounded-[1.5rem] bg-slate-100 text-left ring-1 ring-slate-200 transition hover:ring-blue-200 focus:outline-none focus:ring-4 focus:ring-blue-100"
                        aria-label="Open post"
                      >
                        <ComposedFeedPostVisual
                          captionStyle={captionStyle}
                          story={story}
                        />
                      </button>
                    )}

                    {showCreationTemplateCard && creationTemplate && (
                      <ComposedFeedPostButton
                        onOpen={() => openStoryDetail(story)}
                        captionStyle={captionStyle}
                        story={story}
                        template={creationTemplate}
                      />
                    )}

                    {showInlineStoryText && (
                      <CollapsibleStoryText
                        onOpen={() => openStoryDetail(story)}
                        text={story.story_text}
                      />
                    )}
                  </div>

                  {story.signed_video_url && (
                    <button
                      type="button"
                      onClick={() => openStoryDetail(story)}
                      className="relative flex aspect-[4/5] max-h-[60vh] w-full cursor-pointer items-center justify-center overflow-hidden rounded-[1.5rem] bg-black text-left focus:outline-none focus:ring-4 focus:ring-blue-200 md:aspect-[16/10] md:max-h-[560px]"
                      aria-label="Open video in Video Feed"
                    >
                      <FreedomFeedVideoMediaFrame
                        stamp={story.video_template}
                        videoUrl={story.signed_video_url}
                      >
                        {overlayText && (
                          <FeedCaptionOverlay
                            alignment={story.caption_align}
                            background={story.caption_background}
                            color={story.caption_color}
                            font={story.caption_font}
                            overlayX={story.overlay_x}
                            overlayY={story.overlay_y}
                            reserveBottomAction
                            size={story.caption_size}
                            style={captionStyle}
                            text={overlayText}
                          />
                        )}
                      </FreedomFeedVideoMediaFrame>

                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                        <span className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-black text-slate-950 shadow-sm">
                          Watch in Video Feed
                        </span>
                      </div>
                    </button>
                  )}

                  {!story.signed_video_url && story.video_url && (
                    <button
                      type="button"
                      onClick={() => openStoryDetail(story)}
                      className="mx-5 mb-5 flex h-48 w-[calc(100%-2.5rem)] cursor-pointer items-center justify-center rounded-[1.5rem] border border-blue-100 bg-blue-50 p-4 text-center text-sm font-bold text-[#082f63] transition hover:bg-blue-100 focus:outline-none focus:ring-4 focus:ring-blue-100"
                    >
                      Video found, but the secure video link could not be
                      created. Tap to open in Video Feed.
                    </button>
                  )}

                  {showVideoCaptionText && (
                    <div className="px-5 pt-4">
                      <CollapsibleStoryText
                        className="mt-0"
                        text={story.story_text}
                      />
                    </div>
                  )}

                  <div className="border-t border-slate-100 px-5 py-3">
                    {prayerStory ? (
                      <>
                        {prayerAnswered ? (
                          <div className="mb-3 rounded-2xl bg-emerald-50 p-4">
                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
                              <CheckCircle2 className="h-4 w-4" />
                              Answered Prayer
                            </div>

                            {story.story_text && (
                              <div className="mt-4">
                                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                                  Original Prayer Request
                                </div>

                                <div
                                  className="mt-2 rounded-2xl bg-white p-4 text-sm leading-6 text-slate-700 ring-1 ring-emerald-100"
                                  style={{
                                    overflowWrap: "anywhere",
                                    wordBreak: "break-word",
                                    whiteSpace: "pre-wrap",
                                  }}
                                >
                                  {story.story_text}
                                </div>
                              </div>
                            )}

                            {story.reaction_counts.praying > 0 && (
                              <div className="mt-4 inline-flex rounded-full bg-emerald-100 px-3.5 py-2 text-sm font-black text-emerald-800 ring-1 ring-emerald-200">
                                🙏{" "}
                                {story.reaction_counts.praying === 1
                                  ? "1 believer prayed with this request"
                                  : `${story.reaction_counts.praying} believers prayed with this request`}
                              </div>
                            )}

                            <div className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                              How God Answered
                            </div>

                            {story.answered_text ? (
                              <div
                                className="mt-2 rounded-2xl bg-white p-4 text-sm leading-6 text-slate-700 ring-1 ring-emerald-100"
                                style={{
                                  overflowWrap: "anywhere",
                                  wordBreak: "break-word",
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                {story.answered_text}
                              </div>
                            ) : (
                              <p className="mt-2 text-sm leading-6 text-slate-600">
                                This prayer request was marked answered by the
                                person who shared it.
                              </p>
                            )}

                            <button
                              onClick={() => shareStory(story)}
                              className="mt-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-emerald-700 ring-1 ring-emerald-100 transition hover:bg-emerald-100"
                            >
                              <Share2 className="h-4 w-4" />
                              Share Testimony
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="mb-3 rounded-2xl bg-blue-50 p-4">
                              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                                Prayer Chain
                              </div>

                              <div className="mt-1 text-base font-black text-[#062a57]">
                                {story.reaction_counts.praying === 0
                                  ? "Be the first to pray"
                                  : story.reaction_counts.praying === 1
                                    ? "1 person is praying"
                                    : `${story.reaction_counts.praying} people are praying`}
                              </div>

                              <p className="mt-2 text-sm leading-6 text-slate-600">
                                Stand with this prayer request and let them know
                                they are not praying alone.
                              </p>
                            </div>

                            <div className="flex flex-col gap-2 sm:flex-row">
                              <ReactionButton
                                active={story.user_reactions.includes("praying")}
                                label={
                                  story.user_reactions.includes("praying")
                                    ? "Praying"
                                    : "I’m Praying"
                                }
                                onClick={() =>
                                  toggleReaction(story.id, "praying")
                                }
                              />

                              <button
                                onClick={() => shareStory(story)}
                                className="inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 text-sm font-black text-slate-600 transition hover:bg-blue-50 hover:text-[#0b63ce]"
                              >
                                <Share2 className="h-4 w-4 shrink-0" />
                                Share
                              </button>

                              {originalPoster && (
                                <button
                                  onClick={() => {
                                    setAnsweringPrayerStory(story);
                                    setAnsweredPrayerText("");
                                    setReactionMessage("");
                                  }}
                                  className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700"
                                >
                                  God Did It
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="mb-3 grid grid-cols-3 gap-2 text-center text-sm font-semibold text-slate-500 sm:flex sm:flex-wrap sm:items-center sm:gap-4 sm:text-left">
                          <span className="min-w-0 break-words">
                            {story.reaction_counts.amen} Amen
                          </span>
                          <span className="min-w-0 break-words">
                            {story.reaction_counts.praise_god} Praise God
                          </span>
                          <span className="min-w-0 break-words">
                            {story.reaction_counts.encouraged} Encouraged
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <ReactionButton
                            active={story.user_reactions.includes("amen")}
                            label="Amen"
                            onClick={() => toggleReaction(story.id, "amen")}
                          />

                          <ReactionButton
                            active={story.user_reactions.includes("praise_god")}
                            label={
                              <>
                                <span className="sm:hidden">Praise</span>
                                <span className="hidden sm:inline">
                                  Praise God
                                </span>
                              </>
                            }
                            onClick={() =>
                              toggleReaction(story.id, "praise_god")
                            }
                          />

                          <ReactionButton
                            active={story.user_reactions.includes("encouraged")}
                            label="Encouraged"
                            onClick={() =>
                              toggleReaction(story.id, "encouraged")
                            }
                          />

                          <button
                            onClick={() => shareStory(story)}
                            className="inline-flex min-w-0 items-center justify-center gap-1 rounded-2xl bg-slate-50 px-3 py-2.5 text-xs font-black text-slate-600 transition hover:bg-blue-50 hover:text-[#0b63ce] sm:text-sm"
                          >
                            <Share2 className="h-4 w-4 shrink-0" />
                            Share
                          </button>
                        </div>
                      </>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => toggleSavedStory(story)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-black ring-1 transition ${
                          savedStoryIds.includes(story.id)
                            ? "bg-blue-50 text-[#0b63ce] ring-blue-100"
                            : "bg-white text-slate-600 ring-slate-200 hover:bg-blue-50"
                        }`}
                      >
                        <Bookmark
                          className={`h-4 w-4 ${
                            savedStoryIds.includes(story.id)
                              ? "fill-current"
                              : ""
                          }`}
                        />
                        {savedStoryIds.includes(story.id) ? "Saved" : "Save"}
                      </button>

                      {!originalPoster && story.user_id && (
                        <button
                          type="button"
                          onClick={() => blockStoryUser(story)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-black text-red-700 ring-1 ring-red-100 transition hover:bg-red-50"
                        >
                          <UserX className="h-4 w-4" />
                          Block User
                        </button>
                      )}
                    </div>
                  </div>
                </article>
                {shouldShowMiniReels && (
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
                )}
                </Fragment>
              );
            })
          )}
        </div>

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
                    captionStyle={photoViewerStory.caption_style}
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

            {reportStory && (
              <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/60 p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:pb-4">
                <div className="w-full max-w-lg rounded-[1.5rem] bg-white p-5 text-slate-900 shadow-2xl">
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                    HYPER TO BE FREE
                  </div>

                  <h3 className="mt-2 text-2xl font-black text-[#062a57]">
                    Report Post
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Reports help keep HTBF safe and send this story to the admin
                    review queue.
                  </p>

                  <label className="mt-4 block text-sm font-black text-[#062a57]">
                    Why are you reporting this?
                  </label>
                  <select
                    value={reportReason}
                    onChange={(event) =>
                      setReportReason(event.target.value as ReportReason)
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
                  >
                    {reportReasons.map((reason) => (
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

                  <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={closeReportModal}
                      className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-200"
                    >
                      Not Yet
                    </button>

                    <button
                      type="button"
                      disabled={sendingReport}
                      onClick={submitReport}
                      className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {sendingReport ? "Submitting..." : "Submit Report"}
                    </button>
                  </div>
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
                  className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-200"
                >
                  Not Yet
                </button>

                <button
                  type="button"
                  onClick={() =>
                    markPrayerAnswered(
                      answeringPrayerStory.id,
                      answeredPrayerText
                    )
                  }
                  className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700"
                >
                  Share Praise
                </button>
              </div>
            </div>
          </div>
        )}
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
      onClick={onClick}
      className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-black transition ${
        active
          ? "bg-[#0b63ce] text-white shadow-sm"
          : "bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-blue-50 hover:text-[#0b63ce]"
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
      onClick={onClick}
      className={`min-w-0 rounded-2xl px-2 py-2.5 text-xs font-black transition sm:px-3 sm:text-sm ${
        active
          ? "bg-[#0b63ce] text-white"
          : "bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-[#0b63ce]"
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
            Community Reels
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
                  <video
                    src={story.signed_video_url}
                    muted
                    playsInline
                    preload="metadata"
                    className="pointer-events-none h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
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

  if (onOpen) {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={onOpen}
          className="block w-full cursor-pointer rounded-[1.25rem] bg-slate-50 p-4 text-left ring-1 ring-slate-200 transition hover:bg-blue-50 hover:ring-blue-200 focus:outline-none focus:ring-4 focus:ring-blue-100"
          aria-label="Open story"
        >
          <p
            className="max-w-full overflow-hidden whitespace-pre-wrap break-words text-[17px] leading-7 text-slate-800"
            style={{
              overflowWrap: "anywhere",
              wordBreak: "break-word",
            }}
          >
            {visibleText}
          </p>

          {isLong && (
            <span className="mt-3 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100">
              Open full post
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <p
        className="max-w-full overflow-hidden whitespace-pre-wrap break-words text-[17px] leading-7 text-slate-800"
        style={{
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {visibleText}
      </p>

      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-2 inline-flex rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100"
        >
          {expanded ? "See less" : "See more"}
        </button>
      )}
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
      className="mt-4 block w-full cursor-pointer overflow-hidden rounded-[1.5rem] bg-[#062a57] text-left shadow-sm ring-1 ring-blue-100 transition hover:ring-blue-200 focus:outline-none focus:ring-4 focus:ring-blue-100"
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
  const cleanText = story.story_text?.trim() ?? "";
  const isTemplateLong = cleanText.length > 260;
  const visibleTemplateText =
    variant === "feed" && isTemplateLong
      ? `${cleanText.slice(0, 260).trim()}...`
      : cleanText;
  const templateFrameClass =
    variant === "detail"
      ? "relative min-h-[68dvh] overflow-hidden rounded-[1.5rem] bg-[#062a57] p-4 text-white sm:min-h-[42rem] sm:p-6"
      : "relative min-h-[22rem] overflow-hidden rounded-[1.5rem] bg-[#062a57] p-5 text-white sm:min-h-[25rem] sm:p-6";
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
      : "relative overflow-hidden rounded-[1.5rem] bg-slate-100 ring-1 ring-slate-200";
  const imageClass =
    variant === "detail"
      ? "pointer-events-none block max-h-[74dvh] w-full max-w-full rounded-[1.5rem] object-contain"
      : "pointer-events-none block max-h-[520px] w-full max-w-full rounded-[1.5rem] object-cover";

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

        <StoryMediaStamp stamp={story.video_template} />

        {cleanText && captionStyle !== "classic-caption" && (
          <FeedCaptionOverlay
            alignment={story.caption_align}
            background={story.caption_background}
            color={story.caption_color}
            font={story.caption_font}
            size={story.caption_size}
            style={captionStyle}
            text={cleanText}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="max-w-full whitespace-pre-wrap break-words rounded-[1.5rem] bg-slate-50 p-5 text-[18px] leading-8 text-slate-800 ring-1 ring-slate-200"
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
}: {
  children?: ReactNode;
  stamp: VideoTemplate;
  videoUrl: string;
}) {
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const frameStyle = aspectRatio
    ? {
        aspectRatio: `${aspectRatio}`,
        height: aspectRatio < 1 ? "100%" : "auto",
        width: aspectRatio >= 1 ? "100%" : "auto",
      }
    : undefined;

  return (
    <div
      className="relative flex h-full max-h-full max-w-full items-center justify-center overflow-hidden bg-black"
      style={frameStyle}
    >
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className="pointer-events-none block h-full w-full bg-black object-contain object-center"
        src={videoUrl}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;

          if (video.videoWidth > 0 && video.videoHeight > 0) {
            setAspectRatio(video.videoWidth / video.videoHeight);
          }
        }}
      >
        Your browser does not support the video tag.
      </video>

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
