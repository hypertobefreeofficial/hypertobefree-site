"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Globe2, Video } from "lucide-react";
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

export default function VideoFeedPage() {
  const [checkingUser, setCheckingUser] = useState(true);
  const [stories, setStories] = useState<StoryRow[]>([]);
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

      setStories((data as StoryRow[]) ?? []);
      setCheckingUser(false);
    }

    loadVideos();
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
        <div className="fixed left-4 right-4 top-20 z-50 rounded-2xl bg-red-500/90 p-4 text-sm font-bold text-white">
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

            if (!videoSource) return null;

            return (
              <article
                key={story.id}
                className="relative flex h-screen snap-start items-center justify-center bg-black"
              >
                <video
                  key={videoSource}
                  src={videoSource}
                  poster={story.thumbnail_url || undefined}
                  controls
                  autoPlay
                  muted
                  playsInline
                  preload="auto"
                  className="h-full w-full object-contain"
                />

                <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-5 pb-10">
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
