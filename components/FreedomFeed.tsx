"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
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
  X,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
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
  reaction_counts: {
    amen: number;
    praise_god: number;
    encouraged: number;
    praying: number;
  };
  user_reactions: ReactionType[];
};

const STORY_IMAGE_BUCKET = "story-images";
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
  const currentUserIdRef = useRef<string | null>(null);
  const feedReloadInFlightRef = useRef(false);
  const feedReloadQueuedRef = useRef(false);
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

  async function loadApprovedStories(currentUserId: string | null) {
    const { data, error } = await supabase
      .from("stories")
      .select(
        "id, user_id, name, location, story_type, story_text, overlay_text, overlay_x, overlay_y, caption_style, caption_font, caption_background, caption_template, caption_color, caption_size, caption_align, video_template, htbf_watermark_enabled, silhouette_watermark_enabled, shared_htbf_intro_enabled, image_url, video_url, status, created_at, prayer_status, answered_at, answered_text"
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

          if (storagePath)
