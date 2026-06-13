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
  | "soft-gradient";

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
  caption_style: CaptionStyle | null;
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
      value === "soft-gradient"
    ) {
      return value;
    }

    return "classic-caption";
  }

  async function loadApprovedStories(currentUserId: string | null) {
    const { data, error } = await supabase
      .from("stories")
      .select(
        "id, user_id, name, location, story_type, story_text, caption_style, image_url, video_url, status, created_at, prayer_status, answered_at, answered_text"
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

        return {
          id: story.id,
          user_id: story.user_id,
          name: story.name,
          location: story.location,
          story_type: story.story_type,
          story_text: story.story_text,
          caption_style: getCaptionStyle(story.caption_style),
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
              const hasMedia = Boolean(
                story.signed_image_url || story.signed_video_url
              );
              const showClassicStoryText =
                Boolean(story.story_text) &&
                (!hasMedia || captionStyle === "classic-caption");

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

                          {story.story_text &&
                            captionStyle !== "classic-caption" && (
                              <FeedCaptionOverlay
                                style={captionStyle}
                                text={story.story_text}
                              />
                            )}
                        </div>
                      </button>
                    )}

                    {showClassicStoryText && (
                      <p
                        className="mt-4 max-w-full overflow-hidden whitespace-pre-wrap break-words text-[17px] leading-7 text-slate-800"
                        style={{
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                        }}
                      >
                        {story.story_text}
                      </p>
                    )}
                  </div>

                  {story.signed_video_url && (
                    <button
                      type="button"
                      onClick={() => openVideoStory(story.id)}
                      className="relative block w-full overflow-hidden bg-black text-left focus:outline-none focus:ring-4 focus:ring-blue-200"
                      aria-label="Open video in Video Feed"
                    >
                      <video
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        className="pointer-events-none block h-auto w-full max-w-full bg-black"
                        src={story.signed_video_url}
                      >
                        Your browser does not support the video tag.
                      </video>

                      {story.story_text &&
                        captionStyle !== "classic-caption" && (
                          <FeedCaptionOverlay
                            reserveBottomAction
                            style={captionStyle}
                            text={story.story_text}
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

function FeedCaptionOverlay({
  reserveBottomAction = false,
  style,
  text,
}: {
  reserveBottomAction?: boolean;
  style: CaptionStyle;
  text: string;
}) {
  const positionClass = getFeedCaptionPositionClass(style, reserveBottomAction);
  const styleClass = getFeedCaptionStyleClass(style);
  const quoteText = style === "testimony-quote" ? `“${text}”` : text;

  return (
    <div
      className={`pointer-events-none absolute max-h-36 w-[min(80%,520px)] overflow-hidden whitespace-pre-wrap break-words px-4 py-3 text-sm leading-snug shadow-lg sm:max-h-44 sm:text-base ${positionClass} ${styleClass}`}
      style={{
        overflowWrap: "anywhere",
        wordBreak: "break-word",
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
  return "rounded-2xl bg-white/90 font-semibold text-slate-900 ring-1 ring-white/70";
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
