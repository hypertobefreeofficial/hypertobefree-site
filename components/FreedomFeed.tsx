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
    if (activeFilter === "all") return stories;

    if (activeFilter === "videos") {
      return stories.filter((story) => story.signed_video_url || story.video_url);
    }

    if (activeFilter === "testimony") {
      return stories.filter((story) =>
        story.story_type?.toLowerCase().includes("testimony")
      );
    }

    if (activeFilter === "praise") {
      return stories.filter((story) =>
        story.story_type?.toLowerCase().includes("praise")
      );
    }

    if (activeFilter === "prayer") {
      return stories.filter((story) =>
        story.story_type?.toLowerCase().includes("prayer")
      );
    }

    if (activeFilter === "answered") {
      return stories.filter(
        (story) =>
          story.story_type?.toLowerCase().includes("prayer") &&
          story.prayer_status === "answered"
      );
    }

    return stories;
  }, [activeFilter, stories]);

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

  function openPhotoViewer(story: ApprovedStory) {
    if (!story.signed_image_url) return;

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
    setPhotoViewerStory(null);
  }

  function closePhotoActionSheet() {
    setPhotoActionSheetOpen(false);
  }

  function openPhotoDetails(story: ApprovedStory) {
    setPhotoActionSheetOpen(false);
    setPhotoDetailsStory(story);
  }

  function openVideoStory(storyId: string) {
    window.location.href = `/video-feed?story=${encodeURIComponent(storyId)}`;
  }

  async function copyPhotoLink(story: ApprovedStory) {
    setPhotoViewerMessage("");

    if (!story.signed_image_url) {
      setPhotoViewerMessage("This photo link is not ready yet.");
      return;
    }

    try {
      if (!navigator.clipboard) {
        setPhotoViewerMessage("Copy is not available in this browser.");
        return;
      }

      await navigator.clipboard.writeText(story.signed_image_url);
      setPhotoViewerMessage("Photo link copied.");
      setPhotoActionSheetOpen(false);
    } catch (error) {
      console.error("Could not copy photo link:", error);
      setPhotoViewerMessage("Could not copy the photo link.");
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
      setPhotoViewerMessage("This photo is not ready to share yet.");
      return;
    }

    const shareData = {
      title: `Hyper to Be Free - ${story.story_type || "Photo Story"}`,
      text: story.story_text
        ? story.story_text.slice(0, 140)
        : "See this photo story on Hyper to Be Free.",
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
      console.error("Could not share photo:", error);
      setPhotoViewerMessage("Could not share this photo.");
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
      setPhotoViewerMessage("Please sign in to report a photo.");
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
      setPhotoViewerMessage("Please sign in to report a photo.");
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
      setPhotoViewerMessage(`Could not report photo: ${error.message}`);
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
            filteredStories.map((story) => {
              const prayerStory = isPrayerStory(story);
              const originalPoster = isOriginalPoster(story);
              const prayerAnswered = story.prayer_status === "answered";
              const captionStyle = getCaptionStyle(story.caption_style);
              const hasVideoMedia = Boolean(
                story.signed_video_url || story.video_url
              );
              const hasImageMedia = Boolean(story.signed_image_url);
              const overlayText = story.overlay_text?.trim() ?? "";
              const showInlineStoryText =
                Boolean(story.story_text) &&
                !hasVideoMedia &&
                (!hasImageMedia || captionStyle === "classic-caption");
              const showVideoCaptionText =
                Boolean(story.story_text) && hasVideoMedia;

              return (
                <article
                  key={story.id}
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

                          <span className="text-sm text-slate-400">•</span>

                          <span className="max-w-full break-words rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-[#0b63ce]">
                            {story.story_type || "Story"}
                          </span>

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
                        onClick={() => openPhotoViewer(story)}
                        className="mt-4 block w-full max-w-full overflow-hidden rounded-[1.5rem] bg-slate-100 text-left ring-1 ring-slate-200 transition hover:ring-blue-200 focus:outline-none focus:ring-4 focus:ring-blue-100"
                        aria-label="Open photo"
                      >
                        <div className="relative">
                          <img
                            src={story.signed_image_url}
                            alt={story.story_type || "HTBF photo story"}
                            className="block w-full max-w-full max-h-[520px] rounded-[1.5rem] object-cover"
                          />

                          <FeedMediaStampLayer stamp={story.video_template} />

                          {story.story_text &&
                            captionStyle !== "classic-caption" && (
                              <FeedCaptionOverlay
                                align={story.caption_align}
                                background={story.caption_background}
                                color={story.caption_color}
                                font={story.caption_font}
                                size={story.caption_size}
                                style={captionStyle}
                                text={story.story_text}
                              />
                            )}
                        </div>
                      </button>
                    )}

                    {showInlineStoryText && (
                      <CollapsibleStoryText text={story.story_text} />
                    )}
                  </div>

                  {story.signed_video_url && (
                    <button
                      type="button"
                      onClick={() => openVideoStory(story.id)}
                      className="relative block aspect-[4/5] max-h-[60vh] w-full overflow-hidden rounded-[1.5rem] bg-black text-left focus:outline-none focus:ring-4 focus:ring-blue-200 md:aspect-[16/10] md:max-h-[560px]"
                      aria-label="Open video in Video Feed"
                    >
                      <video
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        className="pointer-events-none block h-full w-full bg-black object-contain object-center md:h-full md:w-full md:max-h-full md:max-w-none md:object-contain"
                        style={{
                          objectFit: "contain",
                          objectPosition: "center center",
                        }}
                        src={story.signed_video_url}
                      >
                        Your browser does not support the video tag.
                      </video>

                      <FeedMediaStampLayer stamp={story.video_template} />

                      {overlayText && (
                        <FeedCaptionOverlay
                          align={story.caption_align}
                          background={story.caption_background}
                          color={story.caption_color}
                          font={story.caption_font}
                          limitLines
                          overlayX={story.overlay_x}
                          overlayY={story.overlay_y}
                          reserveBottomAction
                          size={story.caption_size}
                          style={captionStyle}
                          text={overlayText}
                        />
                      )}

                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                        <span className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-black text-slate-950 shadow-sm">
                          Watch in Video Feed
                        </span>
                      </div>
                    </button>
                  )}

                  {!story.signed_video_url && story.video_url && (
                    <button
                      type="button"
                      onClick={() => openVideoStory(story.id)}
                      className="mx-5 mb-5 flex h-48 w-[calc(100%-2.5rem)] items-center justify-center rounded-[1.5rem] border border-blue-100 bg-blue-50 p-4 text-center text-sm font-bold text-[#082f63] transition hover:bg-blue-100 focus:outline-none focus:ring-4 focus:ring-blue-100"
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
                  </div>
                </article>
              );
            })
          )}
        </div>

        {photoViewerStory?.signed_image_url && (
          <div className="fixed inset-0 z-[90] flex flex-col overflow-hidden bg-black text-white">
            <div className="fixed left-4 right-4 top-[calc(1rem+env(safe-area-inset-top))] z-[100] flex items-center justify-between">
              <button
                type="button"
                onClick={closePhotoViewer}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-black/60"
                aria-label="Close photo viewer"
              >
                <X className="h-6 w-6" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setPhotoActionSheetOpen(true);
                  setPhotoViewerMessage("");
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-black/60"
                aria-label="Open photo actions"
              >
                <MoreHorizontal className="h-6 w-6" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center px-0 py-20 sm:px-6">
              <img
                src={photoViewerStory.signed_image_url}
                alt={photoViewerStory.story_type || "HTBF photo story"}
                className="max-h-full max-w-full object-contain"
              />
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
                    Story Details
                  </h3>

                  <div className="mt-4 grid gap-3 text-sm">
                    <DetailRow
                      label="Author"
                      value={photoDetailsStory.name || "HTBF Community"}
                    />
                    <DetailRow
                      label="Story Type"
                      value={photoDetailsStory.story_type || "Photo Story"}
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
                    Report Photo
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
                    Photo Options
                  </div>

                  <PhotoActionButton
                    icon={<Info className="h-5 w-5" />}
                    label="View Story Details"
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
                  <PhotoActionButton
                    icon={<Download className="h-5 w-5" />}
                    label="Save Photo"
                    onClick={() => savePhoto(photoViewerStory)}
                  />
                  <PhotoActionButton
                    icon={<Copy className="h-5 w-5" />}
                    label="Copy Photo Link"
                    onClick={() => copyPhotoLink(photoViewerStory)}
                  />
                  <PhotoActionButton
                    icon={<Share2 className="h-5 w-5" />}
                    label="Share"
                    onClick={() => sharePhoto(photoViewerStory)}
                  />
                  <PhotoActionButton
                    icon={<Flag className="h-5 w-5" />}
                    label="Report Photo"
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

function CollapsibleStoryText({
  className = "mt-4",
  text,
}: {
  className?: string;
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

function FeedMediaStampLayer({ stamp }: { stamp: VideoTemplate }) {
  if (stamp === "none") return null;

  return (
    <>
      {stamp === "htbf-logo" && (
        <img
          src="/images/htbf-logo.png"
          alt=""
          className="pointer-events-none absolute right-4 top-4 z-[3] h-9 w-9 rounded-full object-contain opacity-65 drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
        />
      )}
      {stamp === "freedom-silhouette" && (
        <img
          src="/images/hero-freedom.png"
          alt=""
          className="pointer-events-none absolute bottom-16 right-4 z-[3] h-20 w-16 object-contain opacity-20 mix-blend-screen"
        />
      )}
      {stamp === "shared-through-htbf" && <FeedSharedStampBadge />}
      {stamp === "freedom-story" && (
        <FeedTextStamp className="bottom-16 left-4" label="Freedom Story" />
      )}
      {stamp === "prayer-moment" && (
        <FeedTextStamp
          className="left-4 top-4 bg-blue-950/45 text-blue-50/80 ring-blue-100/20"
          label="Prayer Moment"
        />
      )}
      {stamp === "praise-report" && (
        <FeedTextStamp
          className="right-4 top-4 bg-amber-300/20 text-amber-50/85 ring-amber-100/25"
          label="Praise Report"
        />
      )}
      {stamp === "god-did-it" && (
        <FeedTextStamp
          className="bottom-16 right-4 bg-emerald-300/20 text-emerald-50/85 ring-emerald-100/25"
          label="God Did It"
        />
      )}
    </>
  );
}

function FeedTextStamp({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <div
      className={`pointer-events-none absolute z-[3] rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/75 ring-1 ring-white/20 backdrop-blur-sm ${className}`}
    >
      {label}
    </div>
  );
}

function FeedSharedStampBadge() {
    return (
      <div className="pointer-events-none absolute left-4 top-4 z-[4] rounded-full bg-black/35 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/70 ring-1 ring-white/20 backdrop-blur-sm">
        Shared Through HTBF
      </div>
    );
}

function FeedCaptionOverlay({
  align,
  background,
  color,
  font,
  limitLines = false,
  overlayX,
  overlayY,
  reserveBottomAction = false,
  size,
  style,
  text,
}: {
  align?: CaptionAlign;
  background?: CaptionBackground;
  color?: CaptionColor;
  font?: CaptionFont;
  limitLines?: boolean;
  overlayX?: number | null;
  overlayY?: number | null;
  reserveBottomAction?: boolean;
  size?: CaptionSize;
  style: CaptionStyle;
  text: string;
}) {
  const hasCustomPosition =
    typeof overlayX === "number" && typeof overlayY === "number";
  const positionClass = hasCustomPosition
    ? ""
    : getFeedCaptionPositionClass(style, reserveBottomAction);
  const legacyStyleClass = !background ? getFeedCaptionStyleClass(style) : "";
  const backgroundClass = background
    ? getFeedCaptionBackgroundClass(background)
    : "";
  const fontClass = font ? getFeedCaptionFontClass(font) : "";
  const colorClass = color ? getFeedCaptionColorClass(color) : "";
  const sizeClass = getFeedCaptionSizeClass(size);
  const alignClass = getFeedCaptionAlignClass(align);
  const inlineColor = color ? getFeedCaptionInlineColor(color) : undefined;
  const textShadow = color ? getFeedCaptionTextShadow(color) : undefined;
  const quoteText =
    font === "testimony" || style === "testimony-quote" ? `“${text}”` : text;
  const limitClass = limitLines
    ? "max-h-[45%] max-w-[80%]"
    : "max-h-36 max-w-[80%] sm:max-h-44";

  return (
    <div
      className={`pointer-events-none absolute z-10 overflow-hidden whitespace-pre-wrap break-words px-4 py-3 leading-snug ${limitClass} ${sizeClass} ${positionClass} ${legacyStyleClass} ${backgroundClass} ${fontClass} ${colorClass} ${alignClass}`}
      style={{
        left: hasCustomPosition
          ? `${clampOverlayPercent(overlayX, 10, 90)}%`
          : undefined,
        top: hasCustomPosition
          ? `${clampOverlayPercent(overlayY, 10, 90)}%`
          : undefined,
        transform: hasCustomPosition
          ? getBoundedOverlayTransform(overlayX, overlayY)
          : undefined,
        display: limitLines ? "-webkit-box" : undefined,
        WebkitLineClamp: limitLines ? 3 : undefined,
        WebkitBoxOrient: limitLines ? "vertical" : undefined,
        textOverflow: limitLines ? "ellipsis" : undefined,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        color: inlineColor,
        textShadow,
      }}
    >
      {quoteText}
    </div>
  );
}

function getFeedCaptionPositionClass(
  style: CaptionStyle,
  reserveBottomAction: boolean
) {
  if (style === "bold-center" || style === "testimony-quote") {
    return "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center";
  }

  if (style === "scripture-card") {
    return "left-1/2 top-4 -translate-x-1/2 text-center";
  }

  if (style === "minimal-white" || style === "black-outline") {
    return "left-1/2 top-4 -translate-x-1/2 text-center";
  }

  return reserveBottomAction
    ? "bottom-20 left-1/2 -translate-x-1/2 text-center"
    : "bottom-5 left-1/2 -translate-x-1/2 text-center";
}

function getFeedCaptionStyleClass(style: CaptionStyle) {
  if (style === "bold-center") {
    return "rounded-[1.5rem] bg-black/45 font-black text-white backdrop-blur";
  }
  if (style === "bottom-banner") {
    return "rounded-2xl bg-black/75 font-bold text-white backdrop-blur";
  }
  if (style === "highlight-box") {
    return "rounded-[1.5rem] bg-yellow-300/95 font-black text-yellow-950 ring-1 ring-white/70";
  }
  if (style === "scripture-card") {
    return "rounded-[1.5rem] bg-blue-50/90 font-serif italic text-[#082f63] ring-1 ring-white/70 backdrop-blur";
  }
  if (style === "praise-glow") {
    return "rounded-[1.5rem] bg-amber-300/90 font-black text-amber-950 ring-1 ring-white/70 shadow-amber-300/30";
  }
  if (style === "testimony-quote") {
    return "rounded-[1.5rem] bg-white/90 font-black text-[#062a57] ring-1 ring-white/70 backdrop-blur";
  }
  if (style === "minimal-white") {
    return "font-black text-white shadow-none [text-shadow:0_2px_12px_rgba(0,0,0,0.85)]";
  }
  if (style === "black-outline") {
    return "font-black text-white shadow-none [text-shadow:2px_2px_0_#000,-2px_2px_0_#000,2px_-2px_0_#000,-2px_-2px_0_#000]";
  }
  if (style === "soft-gradient") {
    return "rounded-[1.5rem] bg-gradient-to-r from-black/70 via-[#0b63ce]/60 to-black/50 font-bold text-white backdrop-blur";
  }
  if (style === "elegant-script") {
    return "rounded-[1.75rem] bg-white/20 font-serif text-lg font-black italic tracking-wide text-white ring-1 ring-white/60 backdrop-blur-md sm:text-2xl";
  }
  return "rounded-2xl bg-white/90 font-semibold text-slate-900 ring-1 ring-white/70";
}

function getFeedCaptionFontClass(font: CaptionFont) {
  if (font === "bold") return "font-sans font-black tracking-tight";
  if (font === "scripture") return "font-serif font-semibold italic";
  if (font === "praise") return "font-serif font-black italic tracking-wide";
  if (font === "testimony") return "font-sans font-black";
  if (font === "minimal") return "font-sans font-semibold";
  if (font === "grace-script") {
    return "font-[cursive] italic tracking-wide";
  }

  return "font-sans font-semibold";
}

function getFeedCaptionBackgroundClass(background: CaptionBackground) {
  if (background === "none") return "px-0 py-0 shadow-none";
  if (background === "glass-blur") {
    return "rounded-[1.5rem] bg-white/20 shadow-lg ring-1 ring-white/50 backdrop-blur-md";
  }
  if (background === "dark-banner") {
    return "rounded-2xl bg-black/75 shadow-lg ring-1 ring-white/10 backdrop-blur";
  }
  if (background === "glow-box") {
    return "rounded-[1.5rem] bg-gradient-to-r from-[#0b63ce]/75 via-amber-300/60 to-[#0b63ce]/70 shadow-lg shadow-amber-300/30 ring-1 ring-white/50 backdrop-blur";
  }
  if (background === "scripture-card") {
    return "rounded-[1.5rem] bg-[#fff4d6]/95 shadow-lg ring-1 ring-white/70 backdrop-blur";
  }

  return "rounded-2xl bg-white/90 shadow-lg ring-1 ring-white/70 backdrop-blur";
}

function getFeedCaptionColorClass(color: CaptionColor) {
  if (color.startsWith("#")) return "";
  if (color === "black") return "!text-slate-950";
  if (color === "deep-navy") return "!text-[#062a57]";
  if (color === "soft-gold") return "!text-amber-200";
  if (color === "prayer-blue") return "!text-blue-200";
  if (color === "warm-cream") return "!text-[#fff4d6]";
  if (color === "praise-green") return "!text-emerald-200";
  return "!text-white";
}

function getFeedCaptionInlineColor(color: CaptionColor) {
  if (color.startsWith("#")) return color;

  return undefined;
}

function getFeedCaptionAlignClass(align?: CaptionAlign) {
  if (align === "left") return "text-left";
  if (align === "right") return "text-right";
  return "text-center";
}

function getFeedCaptionSizeClass(size?: CaptionSize) {
  if (size === "small") return "text-[clamp(0.75rem,2.5vw,0.875rem)]";
  if (size === "large") return "text-[clamp(1rem,4.5vw,1.35rem)]";
  if (size === "extra-large") {
    return "text-[clamp(1.125rem,5.5vw,1.875rem)]";
  }
  return "text-[clamp(0.875rem,3.5vw,1rem)]";
}

function getFeedCaptionTextShadow(color: CaptionColor) {
  if (color === "black" || color === "deep-navy" || isDarkCaptionColor(color)) {
    return "0 1px 10px rgba(255,255,255,0.72)";
  }

  return "0 2px 12px rgba(0,0,0,0.62)";
}

function isDarkCaptionColor(color: CaptionColor) {
  if (!color.startsWith("#") || color.length !== 7) return false;

  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;

  return brightness < 100;
}

function clampOverlayPercent(
  value: number | null | undefined,
  min: number,
  max: number
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 50;
  }

  return Math.min(Math.max(value, min), max);
}

function getBoundedOverlayTransform(
  x: number | null | undefined,
  y: number | null | undefined
) {
  const safeX = clampOverlayPercent(x, 0, 100);
  const safeY = clampOverlayPercent(y, 0, 100);
  const translateX = safeX <= 25 ? "0%" : safeX >= 75 ? "-100%" : "-50%";
  const translateY = safeY <= 20 ? "0%" : safeY >= 80 ? "-100%" : "-50%";

  return `translate(${translateX}, ${translateY})`;
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
