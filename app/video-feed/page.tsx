"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Globe2,
  HeartHandshake,
  MessageCircleHeart,
  Share2,
  Sparkles,
  Video,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

type StoryRow = {
  id: string;
  user_id?: string | null;
  name: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  status: string | null;
  created_at?: string | null;
};

type ReactionType = "amen" | "praise" | "encouraged";

type ReactionCounts = {
  amen: number;
  praise: number;
  encouraged: number;
};

type ReactionRow = {
  id?: string;
  story_id: string;
  reaction_type: ReactionType;
};

export default function VideoFeedPage() {
  const [checkingUser, setCheckingUser] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [reactionCounts, setReactionCounts] = useState<Record<string, ReactionCounts>>({});
  const [message, setMessage] = useState("");
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);

  useEffect(() => {
    async function loadVideos() {
      setCheckingUser(true);
      setMessage("");

      const params = new URLSearchParams(window.location.search);
      const storyParam = params.get("story");
      setSelectedStoryId(storyParam);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setCurrentUserId(user.id);

      const { data, error } = await supabase
        .from("stories")
        .select("*")
        .not("video_url", "is", null)
        .order("created_at", { ascending: false });

      if (error) {
        setMessage(`Could not load videos: ${error.message}`);
        setCheckingUser(false);
        return;
      }

      const videoStories = (data as StoryRow[]) ?? [];
      setStories(videoStories);

      await loadReactionCounts(videoStories.map((story) => story.id));

      setCheckingUser(false);
    }

    loadVideos();
  }, []);

  async function loadReactionCounts(storyIds: string[]) {
    if (storyIds.length === 0) return;

    const { data, error } = await supabase
      .from("story_reactions")
      .select("story_id, reaction_type")
      .in("story_id", storyIds);

    if (error) {
      setMessage(error.message);
      return;
    }

    const nextCounts: Record<string, ReactionCounts> = {};

    storyIds.forEach((storyId) => {
      nextCounts[storyId] = {
        amen: 0,
        praise: 0,
        encouraged: 0,
      };
    });

    ((data as ReactionRow[]) ?? []).forEach((reaction) => {
      if (!nextCounts[reaction.story_id]) {
        nextCounts[reaction.story_id] = {
          amen: 0,
          praise: 0,
          encouraged: 0,
        };
      }

      nextCounts[reaction.story_id][reaction.reaction_type] += 1;
    });

    setReactionCounts(nextCounts);
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

  function getVideoSource(videoUrl: string | null) {
    if (!videoUrl) return null;

    if (videoUrl.startsWith("http://") || videoUrl.startsWith("https://")) {
      return videoUrl;
    }

    const storagePath = getVideoStoragePath(videoUrl);

    if (!storagePath) return null;

    const { data } = supabase.storage
      .from("story-videos")
      .getPublicUrl(storagePath);

    return data.publicUrl;
  }

  const orderedStories = useMemo(() => {
    if (!selectedStoryId) return stories;

    const selected = stories.find((story) => story.id === selectedStoryId);
    const rest = stories.filter((story) => story.id !== selectedStoryId);

    return selected ? [selected, ...rest] : stories;
  }, [stories, selectedStoryId]);

  function getTitle(story: StoryRow) {
    return story.story_text || "Video testimony";
  }

  async function toggleReaction(storyId: string, reactionType: ReactionType) {
    if (!currentUserId) {
      setMessage("Please sign in to react.");
      return;
    }

    setMessage("");

    const { data: existing, error: existingError } = await supabase
      .from("story_reactions")
      .select("id")
      .eq("story_id", storyId)
      .eq("user_id", currentUserId)
      .eq("reaction_type", reactionType)
      .maybeSingle();

    if (existingError) {
      setMessage(existingError.message);
      return;
    }

    if (existing?.id) {
      const { error } = await supabase
        .from("story_reactions")
        .delete()
        .eq("id", existing.id);

      if (error) {
        setMessage(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("story_reactions").insert({
        story_id: storyId,
        user_id: currentUserId,
        reaction_type: reactionType,
      });

      if (error) {
        setMessage(error.message);
        return;
      }
    }

    await loadReactionCounts(stories.map((story) => story.id));
  }

  async function shareVideo(story: StoryRow) {
    const shareUrl = `${window.location.origin}/video-feed?story=${story.id}&from=share`;
    const text = story.story_text || "Watch this HTBF video testimony.";

    if (navigator.share) {
      await navigator.share({
        title: "HTBF Video Testimony",
        text,
        url: shareUrl,
      });
      return;
    }

    await navigator.clipboard.writeText(`${text}\n${shareUrl}`);
    setMessage("Video link copied.");
  }

  if (checkingUser) {
    return (
      <main className="min-h-screen bg-black px-6 py-12 text-white">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white/10 p-8">
          Loading videos...
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
              Video testimonies will appear here after they are shared.
            </p>
          </div>
        </div>
      ) : (
        <section className="h-screen snap-y snap-mandatory overflow-y-scroll">
          {orderedStories.map((story) => {
            const videoSource = getVideoSource(story.video_url);
            const counts = reactionCounts[story.id] || {
              amen: 0,
              praise: 0,
              encouraged: 0,
            };

            if (!videoSource) return null;

            return (
              <article
                key={story.id}
                className="relative flex h-screen snap-start items-center justify-center bg-black"
              >
                <ReelVideoPlayer
                  videoSource={videoSource}
                  poster={story.thumbnail_url}
                />

                <div className="absolute right-2 top-1/2 z-50 flex -translate-y-1/2 flex-col gap-3">
                  <VideoActionButton
                    label="Amen"
                    count={counts.amen}
                    onClick={() => toggleReaction(story.id, "amen")}
                    icon={<HeartHandshake className="h-5 w-5" />}
                  />

                  <VideoActionButton
                    label="Praise"
                    count={counts.praise}
                    onClick={() => toggleReaction(story.id, "praise")}
                    icon={<Sparkles className="h-5 w-5" />}
                  />

                  <VideoActionButton
                    label="Encouraged"
                    count={counts.encouraged}
                    onClick={() => toggleReaction(story.id, "encouraged")}
                    icon={<MessageCircleHeart className="h-5 w-5" />}
                  />

                  <VideoActionButton
                    label="Share"
                    count={null}
                    onClick={() => shareVideo(story)}
                    icon={<Share2 className="h-5 w-5" />}
                  />
                </div>

                <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-5 pb-10 pr-20">
                  <div className="mb-2 flex items-center gap-2 text-sm font-bold text-white/85">
                    <Globe2 className="h-4 w-4" />
                    {story.location || "HTBF Community"}
                  </div>

                  <div className="text-xs font-black uppercase tracking-[0.2em] text-blue-200">
                    {story.story_type || "Video Testimony"}
                  </div>

                  <h1 className="mt-2 max-w-xl text-xl font-black leading-tight">
                    {getTitle(story)}
                  </h1>

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
    </main>
  );
}

function ReelVideoPlayer({
  videoSource,
  poster,
}: {
  videoSource: string;
  poster: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;

    const playPromise = video.play();

    if (playPromise) {
      playPromise.catch(() => {
        // Browser blocked autoplay. User can still press play with controls.
      });
    }
  }, [videoSource]);

  return (
    <video
      ref={videoRef}
      key={videoSource}
      src={videoSource}
      poster={poster || undefined}
      controls
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      className="h-full w-full object-contain"
    />
  );
}

function VideoActionButton({
  label,
  count,
  icon,
  onClick,
}: {
  label: string;
  count: number | null;
  icon: ReactNode;
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
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/20 backdrop-blur-md transition group-hover:bg-white/25">
        {icon}
      </span>

      {count !== null && (
        <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-black leading-none text-white/90 backdrop-blur">
          {count}
        </span>
      )}
    </button>
  );
}
