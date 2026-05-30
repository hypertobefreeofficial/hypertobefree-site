"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Globe2,
  HeartHandshake,
  Play,
  Search,
  Sparkles,
  Video,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import LoggedInBottomNav from "../../components/LoggedInBottomNav";

type StoryRow = {
  id: string;
  user_id?: string | null;
  name: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  video_url: string | null;
  status: string | null;
  created_at?: string | null;
};

const categories = [
  "For you",
  "Testimonies",
  "Videos",
  "Prayer",
  "Praise",
  "Answered",
  "Healing",
  "Freedom",
  "Peace",
];

export default function SearchPage() {
  const [checkingUser, setCheckingUser] = useState(true);
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("For you");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadSearch() {
      setCheckingUser(true);
      setMessage("");

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
        .order("created_at", { ascending: false });

      if (error) {
        setMessage(`Could not load search feed: ${error.message}`);
        setCheckingUser(false);
        return;
      }

      setStories((data as StoryRow[]) ?? []);
      setCheckingUser(false);
    }

    loadSearch();
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

  const filteredStories = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();

    return stories.filter((story) => {
      const type = story.story_type?.toLowerCase() ?? "";
      const text = story.story_text?.toLowerCase() ?? "";
      const name = story.name?.toLowerCase() ?? "";
      const location = story.location?.toLowerCase() ?? "";
      const status = story.status?.toLowerCase() ?? "";

      const matchesQuery =
        !cleanQuery ||
        type.includes(cleanQuery) ||
        text.includes(cleanQuery) ||
        name.includes(cleanQuery) ||
        location.includes(cleanQuery) ||
        status.includes(cleanQuery);

      let matchesCategory = true;

      if (activeCategory === "Testimonies") {
        matchesCategory =
          type.includes("testimony") ||
          type.includes("story") ||
          type.includes("praise") ||
          type.includes("answered");
      }

      if (activeCategory === "Videos") {
        matchesCategory = !!story.video_url || type.includes("video");
      }

      if (activeCategory === "Prayer") {
        matchesCategory =
          type.includes("prayer") ||
          text.includes("pray") ||
          text.includes("prayer");
      }

      if (activeCategory === "Praise") {
        matchesCategory =
          type.includes("praise") ||
          text.includes("praise") ||
          text.includes("thankful") ||
          text.includes("thank") ||
          text.includes("god did");
      }

      if (activeCategory === "Answered") {
        matchesCategory =
          status.includes("answered") ||
          type.includes("answered") ||
          text.includes("answered") ||
          text.includes("god did it");
      }

      if (activeCategory === "Healing") {
        matchesCategory =
          text.includes("heal") ||
          text.includes("healing") ||
          text.includes("restored") ||
          text.includes("restoration") ||
          type.includes("healing");
      }

      if (activeCategory === "Freedom") {
        matchesCategory =
          text.includes("freedom") ||
          text.includes("free") ||
          text.includes("delivered") ||
          text.includes("breakthrough") ||
          type.includes("freedom");
      }

      if (activeCategory === "Peace") {
        matchesCategory =
          text.includes("peace") ||
          text.includes("calm") ||
          text.includes("comfort") ||
          type.includes("peace");
      }

      return matchesQuery && matchesCategory;
    });
  }, [stories, query, activeCategory]);

  function getCardTitle(story: StoryRow) {
    if (story.story_text) {
      return story.story_text.length > 70
        ? `${story.story_text.slice(0, 70)}...`
        : story.story_text;
    }

    if (story.video_url) {
      return "Video testimony";
    }

    return "Story of encouragement";
  }

  function getStoryType(story: StoryRow) {
    return story.story_type || "Testimony";
  }

  function getInitial(story: StoryRow) {
    return story.name?.trim()?.charAt(0)?.toUpperCase() || "H";
  }

  if (checkingUser) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-8 shadow-sm ring-1 ring-slate-200">
          Loading Search...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] pb-28 text-slate-900">
      <div className="mx-auto max-w-3xl px-4 pt-5">
        <section className="sticky top-0 z-40 -mx-4 bg-[#f8fbff]/95 px-4 pb-4 pt-3 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex min-h-12 flex-1 items-center rounded-full bg-slate-100 px-4 ring-1 ring-slate-200">
              <Search className="h-5 w-5 text-slate-500" />

              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search testimonies, prayer, praise..."
                className="w-full bg-transparent px-3 text-base font-semibold text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>

            <Link
              href="/share-your-story"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[#0b63ce] shadow-sm ring-1 ring-slate-200"
            >
              <Sparkles className="h-5 w-5" />
            </Link>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-black transition ${
                  activeCategory === category
                    ? "bg-[#0b63ce] text-white"
                    : "bg-white text-slate-700 ring-1 ring-slate-200"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </section>

        {message && (
          <div className="mb-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
            {message}
          </div>
        )}

        <section className="mt-3">
          {filteredStories.length === 0 ? (
            <div className="rounded-[2rem] bg-white p-6 text-slate-600 shadow-sm ring-1 ring-slate-200">
              No results yet. Try another search or category.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {filteredStories.map((story, index) => {
                const isLarge = index % 7 === 0;
                const videoSource = getVideoSource(story.video_url);

                return (
                  <Link
                    key={story.id}
                    href="/feed"
                    className={`group relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 ${
                      isLarge ? "col-span-2 row-span-2 min-h-64" : "min-h-32"
                    }`}
                  >
                    {videoSource ? (
                      <div className="relative flex h-full min-h-32 items-center justify-center overflow-hidden bg-gradient-to-br from-[#082f63] via-[#0b63ce] to-[#f5b84b]">
                        <video
                          src={videoSource}
                          preload="metadata"
                          muted
                          playsInline
                          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-90"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />

                        <div className="relative z-10 flex flex-col items-center justify-center px-3 text-center text-white">
                          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-white/25 backdrop-blur">
                            <Play className="h-6 w-6 fill-white" />
                          </div>

                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/85">
                            Video Testimony
                          </div>

                          <div className="mt-1 text-sm font-black leading-tight">
                            {getCardTitle(story)}
                          </div>
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/75 to-transparent p-3 text-white">
                          <div className="flex items-center gap-1 text-[11px] font-bold">
                            <Video className="h-3.5 w-3.5" />
                            {story.location || "Video testimony"}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full min-h-32 flex-col justify-between bg-gradient-to-br from-blue-50 via-white to-amber-50 p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-black text-[#0b63ce] shadow-sm">
                            {getInitial(story)}
                          </div>

                          {story.status === "answered" ||
                          story.story_type?.toLowerCase().includes("answered") ? (
                            <div className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">
                              Answered
                            </div>
                          ) : null}
                        </div>

                        <div>
                          <div className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                            {getStoryType(story)}
                          </div>

                          <p
                            className={`font-black leading-tight text-[#062a57] ${
                              isLarge ? "text-xl" : "text-xs"
                            }`}
                          >
                            {getCardTitle(story)}
                          </p>
                        </div>
                      </div>
                    )}

                    {!videoSource && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white opacity-0 transition group-hover:opacity-100">
                        <div className="flex items-center gap-1 text-[11px] font-bold">
                          {getStoryType(story)
                            .toLowerCase()
                            .includes("prayer") ? (
                            <HeartHandshake className="h-3.5 w-3.5" />
                          ) : (
                            <Globe2 className="h-3.5 w-3.5" />
                          )}

                          {story.location || "HTBF Community"}
                        </div>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <LoggedInBottomNav />
    </main>
  );
}
