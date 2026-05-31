"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Globe2,
  HandHeart,
  HeartHandshake,
  MessageCircleHeart,
  Play,
  Send,
  Share2,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

type ReactionType = "amen" | "praise_god" | "encouraged" | "praying";

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

export default function VideoFeedPage() {
  const [checkingUser, setCheckingUser] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [stories, setStories] = useState<VideoStory[]>([]);
  const [message, setMessage] = useState("");
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [replyStory, setReplyStory] = useState<VideoStory | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

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
        {
          event: "*",
          schema: "public",
          table: "story_reactions",
        },
        async () => {
          await loadVideoStories(currentUserId);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "story_video_replies",
        },
        async () => {
          await loadVideoStories(currentUserId);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stories",
        },
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
      .limit(40);

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
    <main className="min-h-screen bg-black text-white">
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
        <div className="fixed left-4 right-4 top-20 z-50 rounded-2xl bg-white/90 p-4 text-sm font-bold text-slate-900">
          {message}
        </div>
      )}

      {orderedStories.length === 0 ? (
        <div className="flex min-h-screen items-center justify-center px-6 text-center">
          <div>
            <Video className="mx-auto mb-4 h-10 w-10 text-white/70" />
            <div className="text-xl font-black">No videos yet</div>
            <p className="mt-2 text-sm text-white/60">
              Approved video testimonies will appear here after review.
            </p>
          </div>
        </div>
      ) : (
        <section className="h-screen snap-y snap-mandatory overflow-y-scroll">
          {orderedStories.map((story) => {
            if (!story.signed_video_url) return null;

            return (
              <article
                key={story.id}
                className="relative flex h-screen snap-start items-center justify-center overflow-hidden bg-black"
              >
                <AutoPlayReelVideo videoUrl={story.signed_video_url} />

                <div className="absolute right-2 top-1/2 z-50 flex -translate-y-1/2 flex-col gap-3">
                  <VideoActionButton
                    label="Amen"
                    count={story.reaction_counts.amen}
                    active={story.user_reactions.includes("amen")}
                    onClick={() => toggleReaction(story.id, "amen")}
                    icon={<HeartHandshake className="h-5 w-5" />}
                  />

                  <VideoActionButton
                    label="Praying"
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
                </div>

                <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-5 pb-10 pr-20">
                  <div className="mb-2 flex items-center gap-2 text-sm font-bold text-white/85">
                    <Globe2 className="h-4 w-4" />
                    {story.location || "HTBF Community"}
                  </div>

                  <div className="text-xs font-black uppercase tracking-[0.2em] text-blue-200">
                    {story.story_type || "Video Testimony"}
                  </div>

                  {story.story_text && (
                    <h1 className="mt-2 max-w-xl text-xl font-black leading-tight">
                      {story.story_text}
                    </h1>
                  )}

                  {story.name && (
                    <p className="mt-2 text-sm font-bold text-white/70">
                      Shared by {story.name}
                    </p>
                  )}
                </div>
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
    </main>
  );
}

function AutoPlayReelVideo({ videoUrl }: { videoUrl: string }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [paused, setPaused] = useState(true);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const video = videoRef.current;

    if (!wrapper || !video) return;

    video.muted = true;
    video.playsInline = true;
    video.load();

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
          video
            .play()
            .then(() => setPaused(false))
            .catch(() => setPaused(true));
        } else {
          video.pause();
          setPaused(true);
        }
      },
      {
        threshold: [0, 0.25, 0.65, 1],
      }
    );

    observer.observe(wrapper);

    return () => {
      observer.disconnect();
    };
  }, [videoUrl]);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video
        .play()
        .then(() => setPaused(false))
        .catch(() => setPaused(true));
    } else {
      video.pause();
      setPaused(true);
    }
  }

  return (
    <div ref={wrapperRef} className="relative h-full w-full bg-black">
      <video
        ref={videoRef}
        key={videoUrl}
        src={videoUrl}
        muted
        loop
        playsInline
        preload="auto"
        className="h-full w-full bg-black object-contain"
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
      />

      <button
        type="button"
        onClick={togglePlay}
        className="absolute bottom-24 right-3 z-40 flex h-8 w-8 items-center justify-center rounded-full bg-white/75 text-slate-900 shadow-md backdrop-blur transition hover:bg-white"
        aria-label="Play or pause video"
      >
        <Play className="h-3.5 w-3.5 fill-slate-900" />
      </button>

      {paused && (
        <div className="pointer-events-none absolute bottom-24 right-3 z-30 h-8 w-8 rounded-full ring-2 ring-white/40" />
      )}
    </div>
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
      onClick={onClick}
      className="group flex flex-col items-center gap-1 text-white"
      aria-label={label}
      title={label}
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-full ring-1 backdrop-blur-md transition ${
          active
            ? "bg-white text-[#0b63ce] ring-white"
            : "bg-white/15 text-white ring-white/20 group-hover:bg-white/25"
        }`}
      >
        {icon}
      </span>

      {count !== null && (
        <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-black leading-none text-white/90 backdrop-blur">
          {count}
        </span>
      )}

      <span className="text-[10px] font-black leading-none text-white/80 drop-shadow">
        {label}
      </span>
    </button>
  );
}
