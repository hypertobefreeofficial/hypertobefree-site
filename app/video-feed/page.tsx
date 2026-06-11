"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Flag,
  Globe2,
  HandHeart,
  HeartHandshake,
  MessageCircleHeart,
  Pause,
  Play,
  Send,
  Share2,
  Sparkles,
  Trash2,
  Video,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

type ReactionType = "amen" | "praise_god" | "encouraged" | "praying";

type ReportReason =
  | "inappropriate"
  | "harassment_hate"
  | "violence_harm"
  | "sexual_content"
  | "spam_scam"
  | "copyright"
  | "privacy"
  | "not_aligned"
  | "other";

type StoryRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  video_url: string | null;
  status: string | null;
  created_at: string | null;
  prayer_status?: string | null;
  answered_at?: string | null;
  answered_text?: string | null;
};

type ReactionRow = {
  story_id: string | null;
  user_id: string | null;
  reaction_type: string | null;
};

type VideoReplyRow = {
  story_id: string | null;
};

type VideoStory = StoryRow & {
  signed_video_url: string | null;
  reaction_counts: {
    amen: number;
    praise_god: number;
    encouraged: number;
    praying: number;
  };
  user_reactions: ReactionType[];
  reply_count: number;
};

const reportReasons: {
  label: string;
  value: ReportReason;
}[] = [
  { label: "Inappropriate content", value: "inappropriate" },
  { label: "Harassment or hate", value: "harassment_hate" },
  { label: "Violence or harmful content", value: "violence_harm" },
  { label: "Sexual content", value: "sexual_content" },
  { label: "Spam or scam", value: "spam_scam" },
  { label: "Copyright issue", value: "copyright" },
  { label: "Privacy concern", value: "privacy" },
  { label: "Not aligned with HTBF community", value: "not_aligned" },
  { label: "Other", value: "other" },
];

export default function VideoFeedPage() {
  const [checkingUser, setCheckingUser] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [stories, setStories] = useState<VideoStory[]>([]);
  const [message, setMessage] = useState("");
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);

  const [replyStory, setReplyStory] = useState<VideoStory | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  const [reportStory, setReportStory] = useState<VideoStory | null>(null);
  const [reportReason, setReportReason] =
    useState<ReportReason>("inappropriate");
  const [reportDetails, setReportDetails] = useState("");
  const [sendingReport, setSendingReport] = useState(false);

  const [, setSoundOn] = useState(false);
  const [beStillMode, setBeStillMode] = useState(false);

  useEffect(() => {
    if (!message) return;

    const timer = window.setTimeout(() => {
      setMessage("");
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
  let currentUserId: string | null = null;

    async function loadPage() {
      setCheckingUser(true);
      setMessage("");

      const params = new URLSearchParams(window.location.search);
      setSelectedStoryId(params.get("story"));

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      currentUserId = user.id;
      setUserId(user.id);

      await loadVideoStories(user.id);
      setCheckingUser(false);
    }

    loadPage();

    const channel = supabase
      .channel("video-feed-live-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "story_reactions" },
        async () => {
          await loadVideoStories(currentUserId);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "story_video_replies" },
        async () => {
          await loadVideoStories(currentUserId);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stories" },
        async () => {
          await loadVideoStories(currentUserId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function getVideoStoragePath(videoUrl: string | null) {
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

  async function loadVideoStories(currentUserId: string | null) {
    const { data, error } = await supabase
      .from("stories")
      .select(
        "id, user_id, name, location, story_type, story_text, video_url, status, created_at, prayer_status, answered_at, answered_text"
      )
      .eq("status", "approved")
      .not("video_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(15);

    if (error || !data) {
      setMessage(`Could not load videos: ${error?.message ?? "Unknown error"}`);
      return;
    }

    const storyIds = data.map((story) => story.id);

    let reactions: ReactionRow[] = [];
    let replies: VideoReplyRow[] = [];

    if (storyIds.length > 0) {
      const { data: reactionData } = await supabase
        .from("story_reactions")
        .select("story_id, user_id, reaction_type")
        .in("story_id", storyIds);

      reactions = (reactionData as ReactionRow[]) ?? [];

      const { data: replyData } = await supabase
        .from("story_video_replies")
        .select("story_id")
        .in("story_id", storyIds);

      replies = (replyData as VideoReplyRow[]) ?? [];
    }

    const nextStories: VideoStory[] = await Promise.all(
      (data as StoryRow[]).map(async (story) => {
        let signedVideoUrl: string | null = null;

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

        const storyReplies = replies.filter(
          (reply) => reply.story_id === story.id
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
          ...story,
          signed_video_url: signedVideoUrl,
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
          reply_count: storyReplies.length,
        };
      })
    );

    setStories(nextStories);
  }

  const orderedStories = useMemo(() => {
    if (!selectedStoryId) return stories;

    const selected = stories.find((story) => story.id === selectedStoryId);
    const rest = stories.filter((story) => story.id !== selectedStoryId);

    return selected ? [selected, ...rest] : stories;
  }, [stories, selectedStoryId]);

  async function toggleReaction(storyId: string, reactionType: ReactionType) {
    setMessage("");

    if (!userId) {
      setMessage("Please sign in to react.");
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
        setMessage(`Could not remove reaction: ${error.message}`);
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
      setMessage(`Could not add reaction: ${error.message}`);
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

  async function sendVideoReply() {
    if (!userId || !replyStory) {
      setMessage("Please sign in to respond.");
      return;
    }

    const cleanReply = replyText.trim();

    if (!cleanReply) {
      setMessage("Please write a response first.");
      return;
    }

    setSendingReply(true);
    setMessage("");

    const { error } = await supabase.from("story_video_replies").insert({
      story_id: replyStory.id,
      user_id: userId,
      recipient_user_id: replyStory.user_id,
      message: cleanReply,
    });

    if (error) {
      setMessage(`Could not send response: ${error.message}`);
      setSendingReply(false);
      return;
    }

    setStories((currentStories) =>
      currentStories.map((story) =>
        story.id === replyStory.id
          ? {
              ...story,
              reply_count: story.reply_count + 1,
            }
          : story
      )
    );

    setReplyText("");
    setReplyStory(null);
    setSendingReply(false);
    setMessage("Response sent.");
  }

  async function removeMyVideo(story: VideoStory) {
    setMessage("");

    if (!userId) {
      setMessage("Please sign in to remove your video.");
      return;
    }

    if (story.user_id !== userId) {
      setMessage("You can only remove your own videos.");
      return;
    }

    const confirmed = window.confirm(
      "Remove this video from HTBF? It will no longer appear in the video feed, search, or your public posts."
    );

    if (!confirmed) return;

    const { error } = await supabase.rpc("remove_my_video_story", {
      story_id: story.id,
    });

    if (error) {
      setMessage(`Could not remove video: ${error.message}`);
      return;
    }

    setStories((currentStories) =>
      currentStories.filter((item) => item.id !== story.id)
    );

    if (selectedStoryId === story.id) {
      setSelectedStoryId(null);
    }

    if (replyStory?.id === story.id) {
      setReplyStory(null);
      setReplyText("");
    }

    setMessage("Video removed from public view.");
  }

  function openReportModal(story: VideoStory) {
    setReportStory(story);
    setReportReason("inappropriate");
    setReportDetails("");
    setMessage("");
  }

  async function submitReport() {
    if (!userId || !reportStory) {
      setMessage("Please sign in to report a video.");
      return;
    }

    setSendingReport(true);
    setMessage("");

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
      setMessage(`Could not submit report: ${error.message}`);
      return;
    }

    setReportStory(null);
    setReportReason("inappropriate");
    setReportDetails("");
    setMessage("Report submitted. Thank you for helping keep HTBF safe.");
  }

  async function shareStory(story: VideoStory) {
    setMessage("");

    const shareText = story.story_text
      ? `Watch this video testimony: ${story.story_text.slice(0, 140)}`
      : "Watch this video testimony on Hyper to Be Free.";

    const shareUrl = `${window.location.origin}/video-feed?story=${story.id}&from=share`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "HTBF Video Testimony",
          text: shareText,
          url: shareUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      setMessage("Share link copied.");
    } catch (error) {
      console.error("Share failed:", error);
    }
  }

  if (checkingUser) {
    return (
      <main className="min-h-screen bg-black px-6 py-12 text-white">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white/10 p-8">
          Loading video feed...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-black text-white">
      <div className="fixed left-4 top-4 z-50">
        <Link
          href="/search"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur"
          aria-label="Back to search"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
      </div>

{message && (
  <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/95 px-4 py-2 text-sm font-black text-slate-900 shadow-lg ring-1 ring-slate-200 backdrop-blur">
    {message}
  </div>
)}

      {orderedStories.length === 0 ? (
        <div className="flex min-h-[100dvh] items-center justify-center px-6 text-center">
          <div>
            <Video className="mx-auto mb-4 h-10 w-10 text-white/70" />
            <div className="text-xl font-black">No videos yet</div>
            <p className="mt-2 text-sm text-white/60">
              Approved video testimonies will appear here after review.
            </p>
          </div>
        </div>
      ) : (
        <section className="h-[100dvh] snap-y snap-mandatory overflow-y-scroll">
          {orderedStories.map((story, index) => {
            if (!story.signed_video_url) return null;

            const isOwner = Boolean(userId && story.user_id === userId);

            return (
              <article
                key={story.id}
                className="relative flex h-[100dvh] snap-start items-center justify-center overflow-hidden bg-black"
              >
                <AutoPlayReelVideo
                  videoUrl={story.signed_video_url}
                  soundOn={soundOn}
                  onSoundChange={setSoundOn}
                  eagerLoad={index === 0}
                />
{!beStillMode && (
  <div className="absolute right-2 top-[12dvh] z-50 flex max-h-[64dvh] flex-col items-center justify-start gap-2 overflow-hidden sm:top-1/2 sm:-translate-y-1/2 sm:gap-3">
    <VideoActionButton
      label="Amen"
      count={story.reaction_counts.amen}
      active={story.user_reactions.includes("amen")}
      onClick={() => toggleReaction(story.id, "amen")}
      icon={<HeartHandshake className="h-5 w-5" />}
    />

    <VideoActionButton
      label="Pray Now"
      count={story.reaction_counts.praying}
      active={story.user_reactions.includes("praying")}
      onClick={() => toggleReaction(story.id, "praying")}
      icon={<HandHeart className="h-5 w-5" />}
    />

    <VideoActionButton
      label="Praise"
      count={story.reaction_counts.praise_god}
      active={story.user_reactions.includes("praise_god")}
      onClick={() => toggleReaction(story.id, "praise_god")}
      icon={<Sparkles className="h-5 w-5" />}
    />

    <VideoActionButton
      label="Respond"
      count={story.reply_count}
      active={false}
      onClick={() => {
        setReplyStory(story);
        setReplyText("");
        setMessage("");
      }}
      icon={<MessageCircleHeart className="h-5 w-5" />}
    />

    <VideoActionButton
      label="Share"
      count={null}
      active={false}
      onClick={() => shareStory(story)}
      icon={<Share2 className="h-5 w-5" />}
    />

    <VideoActionButton
      label="Report"
      count={null}
      active={false}
      onClick={() => openReportModal(story)}
      icon={<Flag className="h-5 w-5" />}
    />

    <VideoActionButton
      label="Be Still"
      count={null}
      active={beStillMode}
      onClick={() => setBeStillMode(true)}
      icon={<EyeOff className="h-5 w-5" />}
    />

    {isOwner && (
      <RemoveVideoButton onClick={() => removeMyVideo(story)} />
    )}
  </div>
)}

{!beStillMode && <VideoInfoOverlay story={story} />}

{beStillMode && (
  <button
    type="button"
    onClick={() => setBeStillMode(false)}
    className="absolute bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-full bg-black/40 px-4 py-2 text-xs font-black text-white backdrop-blur"
  >
    Tap to Exit Be Still Mode
  </button>
)}
      {replyStory && (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/60 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                  Respond with encouragement
                </div>

                <h2 className="mt-1 text-xl font-black text-[#062a57]">
                  Send a message
                </h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  setReplyStory(null);
                  setReplyText("");
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                aria-label="Close response box"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <textarea
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              rows={5}
              placeholder="Write a kind response, prayer, or encouragement..."
              className="w-full resize-none rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-base leading-7 text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
            />

            <button
              type="button"
              disabled={sendingReply}
              onClick={sendVideoReply}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-5 py-3 text-base font-black text-white shadow-sm hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingReply ? "Sending..." : "Send Response"}
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {reportStory && (
        <div className="fixed inset-0 z-[90] flex items-end bg-black/60 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-red-600">
                  Report Video
                </div>

                <h2 className="mt-1 text-xl font-black text-[#062a57]">
                  Flag for moderator review
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Reports help keep HTBF safe. This does not automatically
                  remove the video, but it sends it to the admin review queue.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setReportStory(null);
                  setReportReason("inappropriate");
                  setReportDetails("");
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                aria-label="Close report box"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="block">
              <div className="mb-2 text-sm font-black text-[#062a57]">
                Why are you reporting this?
              </div>

              <select
                value={reportReason}
                onChange={(event) =>
                  setReportReason(event.target.value as ReportReason)
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
              >
                {reportReasons.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 block">
              <div className="mb-2 text-sm font-black text-[#062a57]">
                Details, optional
              </div>

              <textarea
                value={reportDetails}
                onChange={(event) => setReportDetails(event.target.value)}
                rows={4}
                placeholder="Add any details that may help the moderator..."
                className="w-full resize-none rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-base leading-7 text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
              />
            </label>

            <button
              type="button"
              disabled={sendingReport}
              onClick={submitReport}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-3 text-base font-black text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingReport ? "Submitting..." : "Submit Report"}
              <Flag className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function AutoPlayReelVideo({
  videoUrl,
  soundOn,
  onSoundChange,
  eagerLoad,
}: {
  videoUrl: string;
  soundOn: boolean;
  onSoundChange: (nextValue: boolean) => void;
  eagerLoad: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [paused, setPaused] = useState(true);
  const [userPaused, setUserPaused] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [shouldLoadVideo, setShouldLoadVideo] = useState(eagerLoad);

  const pinchStartDistanceRef = useRef<number | null>(null);
  const wheelZoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerInsideRef = useRef(false);
  const pressPausedRef = useRef(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;

    if (!wrapper) return;

    const loadObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoadVideo(true);
        }
      },
      {
        rootMargin: "700px 0px",
        threshold: 0.01,
      }
    );

    loadObserver.observe(wrapper);

    return () => {
      loadObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const video = videoRef.current;

    if (!wrapper || !video || !shouldLoadVideo) return;

    video.muted = !soundOn;
    video.playsInline = true;

    const playObserver = new IntersectionObserver(
      ([entry]) => {
        if (!video) return;

        const isMostlyVisible =
          entry.isIntersecting && entry.intersectionRatio >= 0.65;

        if (isMostlyVisible) {
          if (!userPaused) {
            video.muted = !soundOn;

            video
              .play()
              .then(() => {
                setPaused(false);
              })
              .catch(() => {
                video.muted = true;
                onSoundChange(false);

                video
                  .play()
                  .then(() => setPaused(false))
                  .catch(() => setPaused(true));
              });
          }
        } else {
          video.pause();
          setPaused(true);
        }
      },
      {
        threshold: [0, 0.25, 0.65, 1],
      }
    );

    playObserver.observe(wrapper);

    return () => {
      playObserver.disconnect();
      video.pause();
    };
  }, [videoUrl, soundOn, userPaused, shouldLoadVideo, onSoundChange]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) return;

    video.muted = !soundOn;

    if (soundOn) {
      video.volume = 1;
    }
  }, [soundOn]);

  useEffect(() => {
    const wrapper = wrapperRef.current;

    if (!wrapper) return;

    function getDistance(touches: TouchList) {
      const firstTouch = touches[0];
      const secondTouch = touches[1];

      const xDistance = firstTouch.clientX - secondTouch.clientX;
      const yDistance = firstTouch.clientY - secondTouch.clientY;

      return Math.sqrt(xDistance * xDistance + yDistance * yDistance);
    }

    function handleTouchStart(event: TouchEvent) {
      if (event.touches.length === 2) {
        event.preventDefault();
        pinchStartDistanceRef.current = getDistance(event.touches);
      }
    }

    function handleTouchMove(event: TouchEvent) {
      if (event.touches.length === 2 && pinchStartDistanceRef.current) {
        event.preventDefault();

        const currentDistance = getDistance(event.touches);
        const rawScale = currentDistance / pinchStartDistanceRef.current;
        const limitedScale = Math.min(Math.max(rawScale, 1), 3);

        setZoomScale(limitedScale);
      }
    }

    function handleTouchEnd(event: TouchEvent) {
      if (event.touches.length < 2) {
        pinchStartDistanceRef.current = null;
        setZoomScale(1);
      }
    }

    function handlePointerEnter() {
      pointerInsideRef.current = true;
    }

    function handlePointerLeave() {
      pointerInsideRef.current = false;
      setZoomScale(1);
      releasePause();
    }

    wrapper.addEventListener("touchstart", handleTouchStart, {
      passive: false,
    });

    wrapper.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });

    wrapper.addEventListener("touchend", handleTouchEnd, {
      passive: false,
    });

    wrapper.addEventListener("touchcancel", handleTouchEnd, {
      passive: false,
    });

    wrapper.addEventListener("pointerenter", handlePointerEnter);
    wrapper.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      wrapper.removeEventListener("touchstart", handleTouchStart);
      wrapper.removeEventListener("touchmove", handleTouchMove);
      wrapper.removeEventListener("touchend", handleTouchEnd);
      wrapper.removeEventListener("touchcancel", handleTouchEnd);
      wrapper.removeEventListener("pointerenter", handlePointerEnter);
      wrapper.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, []);

  useEffect(() => {
    function handleWheelZoom(event: WheelEvent) {
      const wrapper = wrapperRef.current;

      if (!wrapper) return;

      const target = event.target as Node | null;
      const eventStartedInsideVideo = target ? wrapper.contains(target) : false;
      const isTrackpadPinchOrBrowserZoom = event.ctrlKey || event.metaKey;

      if (!eventStartedInsideVideo && !pointerInsideRef.current) return;
      if (!isTrackpadPinchOrBrowserZoom) return;

      event.preventDefault();
      event.stopPropagation();

      setZoomScale((currentScale) => {
        const zoomChange = event.deltaY < 0 ? 0.12 : -0.12;
        const nextScale = currentScale + zoomChange;

        return Math.min(Math.max(nextScale, 1), 3);
      });

      if (wheelZoomTimeoutRef.current) {
        clearTimeout(wheelZoomTimeoutRef.current);
      }

      wheelZoomTimeoutRef.current = setTimeout(() => {
        setZoomScale(1);
      }, 220);
    }

    window.addEventListener("wheel", handleWheelZoom, {
      passive: false,
      capture: true,
    });

    return () => {
      window.removeEventListener("wheel", handleWheelZoom, {
        capture: true,
      } as AddEventListenerOptions);

      if (wheelZoomTimeoutRef.current) {
        clearTimeout(wheelZoomTimeoutRef.current);
      }
    };
  }, []);

  function isControlClick(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;

    return Boolean(target.closest("button, a, textarea, input"));
  }

  function pressPause(target: EventTarget | null) {
    if (isControlClick(target)) return;

    const video = videoRef.current;

    if (!video) return;

    if (!video.paused) {
      pressPausedRef.current = true;
      video.pause();
      setPaused(true);
    }
  }

  function releasePause() {
    const video = videoRef.current;

    if (!video) return;

    if (pressPausedRef.current) {
      pressPausedRef.current = false;
      setUserPaused(false);
      video.muted = !soundOn;

      video
        .play()
        .then(() => setPaused(false))
        .catch(() => {
          video.muted = true;
          onSoundChange(false);

          video
            .play()
            .then(() => setPaused(false))
            .catch(() => setPaused(true));
        });
    }
  }

  function togglePlayButton() {
    const video = videoRef.current;

    if (!video) return;

    if (video.paused) {
      setUserPaused(false);
      video.muted = !soundOn;

      video
        .play()
        .then(() => setPaused(false))
        .catch(() => {
          video.muted = true;
          onSoundChange(false);

          video
            .play()
            .then(() => setPaused(false))
            .catch(() => setPaused(true));
        });
    } else {
      setUserPaused(true);
      video.pause();
      setPaused(true);
    }
  }

  function toggleSound() {
    const video = videoRef.current;

    if (!video) return;

    const nextSoundOn = !soundOn;

    onSoundChange(nextSoundOn);
    video.muted = !nextSoundOn;

    if (nextSoundOn) {
      video.volume = 1;

      video
        .play()
        .then(() => {
          setPaused(false);
          setUserPaused(false);
        })
        .catch(() => {
          video.muted = true;
          onSoundChange(false);
          setPaused(true);
        });
    }
  }

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full overflow-hidden bg-black [touch-action:pan-y]"
      onPointerDown={(event) => pressPause(event.target)}
      onPointerUp={releasePause}
      onPointerCancel={releasePause}
      onMouseLeave={releasePause}
    >
      {shouldLoadVideo ? (
        <video
          ref={videoRef}
          key={videoUrl}
          src={videoUrl}
          muted={!soundOn}
          loop
          playsInline
          preload="metadata"
          className="h-full w-full bg-black object-cover transition-transform duration-150 ease-out will-change-transform md:object-contain"
          style={{
            transform: `scale(${zoomScale})`,
            transformOrigin: "center center",
          }}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-black text-xs font-black uppercase tracking-[0.18em] text-white/40">
          Loading video
        </div>
      )}
<div className="absolute bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3 z-40 flex flex-col gap-2 sm:bottom-28">
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            toggleSound();
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-slate-900 shadow-md backdrop-blur transition hover:bg-white"
          aria-label={soundOn ? "Turn sound off" : "Turn sound on"}
        >
          {soundOn ? (
            <Volume2 className="h-4 w-4" />
          ) : (
            <VolumeX className="h-4 w-4" />
          )}
        </button>

        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            togglePlayButton();
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-slate-900 shadow-md backdrop-blur transition hover:bg-white"
          aria-label={paused ? "Play video" : "Pause video"}
        >
          {paused ? (
            <Play className="h-4 w-4 fill-slate-900" />
          ) : (
            <Pause className="h-4 w-4 fill-slate-900" />
          )}
        </button>
      </div>

      {zoomScale > 1 && (
        <div className="pointer-events-none absolute left-1/2 top-6 z-40 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-xs font-black text-white backdrop-blur">
          Zoom {zoomScale.toFixed(1)}x
        </div>
      )}

      {!soundOn && (
    <div className="pointer-events-none absolute left-1/2 bottom-[calc(7.75rem+env(safe-area-inset-bottom))] z-30 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-xs font-black text-white backdrop-blur">
  Tap speaker for sound
</div>
      )}
    </div>
  );
}

function VideoInfoOverlay({ story }: { story: VideoStory }) {
  const [hidden, setHidden] = useState(false);
  const [expanded, setExpanded] = useState(false);

const rawStoryText = story.story_text?.trim() || "";
const storyText =
  rawStoryText.toLowerCase() === "none" ? "" : rawStoryText;
  const isLongText = storyText.length > 70;

  if (hidden) {
    return (
      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setHidden(false);
        }}
      className="absolute bottom-[calc(8.5rem+env(safe-area-inset-bottom))] left-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white shadow-md ring-1 ring-white/15 backdrop-blur-md"
        aria-label="Show video details"
        title="Show video details"
      >
        <Eye className="h-4 w-4" />
      </button>
    );
  }

  return (
    <>
<div className="absolute bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-0 z-30 w-[min(72vw,420px)] overflow-hidden bg-gradient-to-t from-black/90 via-black/45 to-transparent p-4 pb-4">
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setHidden(true);
          }}
          className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white/90 ring-1 ring-white/15 backdrop-blur-md"
          aria-label="Hide video details"
          title="Hide video details"
        >
          <EyeOff className="h-4 w-4" />
        </button>

        <div className="pointer-events-none max-w-full overflow-hidden">
          <div className="mb-1 flex min-w-0 items-center gap-2 text-xs font-bold text-white/85 md:text-sm">
            <Globe2 className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" />
            <span className="min-w-0 truncate">
              {story.location || "HTBF Community"}
            </span>
          </div>

          <div className="max-w-full truncate text-[10px] font-black uppercase tracking-[0.18em] text-blue-200 md:text-xs">
            {story.story_type || "Video Testimony"}
          </div>

          {storyText && (
            <div className="relative mt-1.5 max-w-full overflow-hidden">
<h1
  className="mt-1.5 line-clamp-3 max-w-full text-sm font-black leading-snug text-white md:text-base"
  style={{
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    textOverflow: "ellipsis",
    overflowWrap: "anywhere",
    wordBreak: "break-all",
  }}
>
  {storyText}
</h1>

              {isLongText && (
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-7 bg-gradient-to-t from-black/90 to-transparent" />
              )}
            </div>
          )}

          {story.name && (
            <p className="mt-1.5 max-w-full truncate text-xs font-bold text-white/70 md:text-sm">
              Shared by {story.name}
            </p>
          )}
{story.story_type?.toLowerCase().includes("prayer") &&
  story.reaction_counts.praying > 0 && (
    <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white backdrop-blur">
      <HeartHandshake className="h-3.5 w-3.5" />
      {story.reaction_counts.praying} people praying
    </div>
)}
        </div>

        {isLongText && (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(true);
            }}
            className="mt-2 inline-flex rounded-full bg-white/90 px-3 py-1 text-[11px] font-black text-slate-900 shadow-md backdrop-blur md:text-xs"
          >
            More
          </button>
        )}
      </div>

      {expanded && (
        <div className="fixed inset-0 z-[90] flex items-end bg-black/60 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="max-h-[75dvh] w-full max-w-lg overflow-hidden rounded-[2rem] bg-white text-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                  {story.story_type || "Video Testimony"}
                </div>

                <h2 className="mt-1 text-xl font-black text-[#062a57]">
                  Video Details
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                aria-label="Close video details"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[55dvh] overflow-y-auto p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-500">
                <Globe2 className="h-4 w-4" />
                {story.location || "HTBF Community"}
              </div>

              <p
                className="whitespace-pre-line text-base font-bold leading-7 text-slate-800"
                style={{
                  overflowWrap: "anywhere",
                  wordBreak: "break-word",
                }}
              >
                {storyText}
              </p>

              {story.name && (
                <p className="mt-5 text-sm font-bold text-slate-500">
                  Shared by {story.name}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function VideoActionButton({
  label,
  count,
  icon,
  active,
  onClick,
}: {
  label: string;
  count: number | null;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="group flex flex-col items-center gap-1 text-white"
      aria-label={label}
      title={label}
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-full ring-1 backdrop-blur-md transition ${
          active
            ? "bg-white text-[#0b63ce] ring-white"
            : "bg-white/20 text-white ring-white/25 group-hover:bg-white/30"
        }`}
      >
        {icon}
      </span>

      {count !== null && (
        <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-black leading-none text-white/90 backdrop-blur">
          {count}
        </span>
      )}

      <span className="text-[10px] font-black leading-none text-white/85 drop-shadow">
        {label}
      </span>
    </button>
  );
}

function RemoveVideoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="group flex flex-col items-center gap-1 text-white"
      aria-label="Remove video"
      title="Remove video"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/80 text-white ring-1 ring-white/25 backdrop-blur-md transition group-hover:bg-red-600">
        <Trash2 className="h-5 w-5" />
      </span>

      <span className="text-[10px] font-black leading-none text-white/90 drop-shadow">
        Remove
      </span>
    </button>
  );
}
