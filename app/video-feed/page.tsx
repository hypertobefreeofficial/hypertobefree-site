"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Captions,
  Eye,
  EyeOff,
  Flag,
  Gauge,
  Globe2,
  HandHeart,
  HeartHandshake,
  MessageCircleHeart,
  MoreVertical,
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

const playbackSpeeds = [0.5, 0.75, 1, 1.25, 1.5, 2];

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

  const [soundOn, setSoundOn] = useState(false);
  const [cleanView, setCleanView] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    if (!message) return;

    const timer = window.setTimeout(() => {
      setMessage("");
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (cleanView || optionsOpen) return;

    const timer = window.setTimeout(() => {
      setControlsVisible(false);
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [controlsVisible, cleanView, optionsOpen]);

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

  function revealControls() {
    setControlsVisible(true);

    if (cleanView) {
      setCleanView(false);
    }
  }

  function enterCleanView() {
    setOptionsOpen(false);
    setControlsVisible(false);
    setCleanView(true);
  }

  function isPrayerVideo(story: VideoStory) {
    const type = story.story_type?.toLowerCase() ?? "";
    const text = story.story_text?.toLowerCase() ?? "";

    return (
      type.includes("prayer") ||
      text.includes("pray") ||
      text.includes("prayer")
    );
  }

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
    setMessage("Report submitted.");
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
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white/80 backdrop-blur transition hover:bg-black/60 hover:text-white"
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
            const showUi = controlsVisible && !cleanView;
            const prayerVideo = isPrayerVideo(story);
            const userIsPraying = story.user_reactions.includes("praying");

            return (
              <article
                key={story.id}
                onClick={revealControls}
                className="relative flex h-[100dvh] snap-start items-center justify-center overflow-hidden bg-black"
              >
                <AutoPlayReelVideo
                  videoUrl={story.signed_video_url}
                  soundOn={soundOn}
                  onSoundChange={setSoundOn}
                  eagerLoad={index === 0}
                  playbackRate={playbackRate}
                  showMiniControls={showUi}
                />

                {cleanView && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setCleanView(false);
                      setControlsVisible(true);
                    }}
                    className="fixed right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white/80 backdrop-blur transition hover:bg-black/60 hover:text-white"
                    aria-label="Show controls"
                  >
                    <Eye className="h-5 w-5" />
                  </button>
                )}

                {showUi && (
                  <div className="absolute right-4 top-4 z-50">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOptionsOpen((current) => !current);
                        setControlsVisible(true);
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white/85 backdrop-blur transition hover:bg-black/60 hover:text-white"
                      aria-label="More video controls"
                    >
                      <MoreVertical className="h-5 w-5" />
                    </button>

                    {optionsOpen && (
                      <VideoOptionsPanel
                        playbackRate={playbackRate}
                        setPlaybackRate={setPlaybackRate}
                        onCleanView={enterCleanView}
                        onShare={() => shareStory(story)}
                        onReport={() => openReportModal(story)}
                        onClose={() => setOptionsOpen(false)}
                        prayerVideo={prayerVideo}
                        prayerCount={story.reaction_counts.praying}
                        userIsPraying={userIsPraying}
                        onPray={() => toggleReaction(story.id, "praying")}
                      />
                    )}
                  </div>
                )}

                {showUi && (
                  <div className="absolute right-2 top-[18dvh] z-40 flex max-h-[58dvh] flex-col items-center justify-start gap-2 overflow-hidden sm:top-1/2 sm:-translate-y-1/2 sm:gap-3">
                    <VideoActionButton
                      label="Amen"
                      count={story.reaction_counts.amen}
                      active={story.user_reactions.includes("amen")}
                      onClick={() => toggleReaction(story.id, "amen")}
                      icon={<HeartHandshake className="h-5 w-5" />}
                    />

                    <VideoActionButton
                      label={
                        prayerVideo
                          ? userIsPraying
                            ? "Praying"
                            : "Pray Now"
                          : "Praying"
                      }
                      count={story.reaction_counts.praying}
                      active={userIsPraying}
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

                    {isOwner && (
                      <RemoveVideoButton onClick={() => removeMyVideo(story)} />
                    )}
                  </div>
                )}

                {showUi && prayerVideo && (
                  <PrayerCircleOverlay
                    prayerCount={story.reaction_counts.praying}
                    userIsPraying={userIsPraying}
                  />
                )}

                {showUi && <VideoInfoOverlay story={story} />}
              </article>
            );
          })}
        </section>
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
                  Reports help keep HTBF safe. This sends the video to the admin
                  review queue.
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

function VideoOptionsPanel({
  playbackRate,
  setPlaybackRate,
  onCleanView,
  onShare,
  onReport,
  onClose,
  prayerVideo,
  prayerCount,
  userIsPraying,
  onPray,
}: {
  playbackRate: number;
  setPlaybackRate: (value: number) => void;
  onCleanView: () => void;
  onShare: () => void;
  onReport: () => void;
  onClose: () => void;
  prayerVideo: boolean;
  prayerCount: number;
  userIsPraying: boolean;
  onPray: () => void;
}) {
  return (
    <div
      onClick={(event) => event.stopPropagation()}
      className="absolute right-0 top-12 w-64 rounded-[1.5rem] bg-white/95 p-4 text-slate-900 shadow-2xl ring-1 ring-slate-200 backdrop-blur"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-black text-[#062a57]">
          Video Controls
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={onCleanView}
        className="mb-3 flex w-full items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 text-sm font-black text-slate-700 hover:bg-blue-50 hover:text-[#0b63ce]"
      >
        <EyeOff className="h-4 w-4" />
        Clean screen mode
      </button>

      {prayerVideo && (
        <div className="mb-3 rounded-2xl bg-blue-50 p-3 ring-1 ring-blue-100">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-[#0b63ce]">
            Prayer Circle
          </div>

          <div className="mt-1 text-sm font-black text-[#062a57]">
            {prayerCount === 0
              ? "Be the first to pray"
              : prayerCount === 1
                ? "1 person is praying"
                : `${prayerCount} people are praying`}
          </div>

          <button
            type="button"
            onClick={onPray}
            className={`mt-3 w-full rounded-2xl px-3 py-2.5 text-sm font-black ${
              userIsPraying
                ? "bg-[#0b63ce] text-white"
                : "bg-white text-[#0b63ce] ring-1 ring-blue-100"
            }`}
          >
            {userIsPraying ? "You’re Praying" : "Pray Now"}
          </button>
        </div>
      )}

      <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
        <Gauge className="h-4 w-4" />
        Playback Speed
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        {playbackSpeeds.map((speed) => (
          <button
            key={speed}
            type="button"
            onClick={() => setPlaybackRate(speed)}
            className={`rounded-xl px-2 py-2 text-xs font-black ${
              playbackRate === speed
                ? "bg-[#0b63ce] text-white"
                : "bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-[#0b63ce]"
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled
        className="mb-3 flex w-full cursor-not-allowed items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 text-sm font-black text-slate-400"
      >
        <Captions className="h-4 w-4" />
        Captions coming soon
      </button>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onShare}
          className="rounded-2xl bg-slate-50 px-3 py-2.5 text-sm font-black text-slate-700 hover:bg-blue-50 hover:text-[#0b63ce]"
        >
          Share
        </button>

        <button
          type="button"
          onClick={onReport}
          className="rounded-2xl bg-red-50 px-3 py-2.5 text-sm font-black text-red-700 hover:bg-red-100"
        >
          Report
        </button>
      </div>
    </div>
  );
}

function PrayerCircleOverlay({
  prayerCount,
  userIsPraying,
}: {
  prayerCount: number;
  userIsPraying: boolean;
}: {
  return (
    <div className="absolute left-4 top-20 z-30 max-w-[240px] rounded-2xl bg-black/45 p-3 text-white ring-1 ring-white/15 backdrop-blur-md">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-blue-100">
        <HandHeart className="h-4 w-4" />
        Prayer Circle
      </div>

      <div className="mt-1 text-sm font-black">
        {prayerCount === 0
          ? "Be the first to pray"
          : prayerCount === 1
            ? "1 person is praying"
          : `${prayerCount} people are praying`}
      </div>

      {userIsPraying && (
        <div className="mt-2 rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white">
          You’re praying with this testimony
        </div>
      )}
    </div>
  );
}
