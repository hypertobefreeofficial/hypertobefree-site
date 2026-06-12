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
  thumbnail_url: string | null;
  status: string | null;
  created_at?: string | null;
};

type FilterOption = {
  label: string;
  dynamic?: boolean;
};

const coreFilters = [
  "All",
  "Prayer",
  "Healing",
  "Deliverance",
  "Teaching",
  "Prophecy",
  "Testimony",
  "Praise",
];

const coreFilterSet = new Set(coreFilters.map(normalizeText));

const filterKeywordMap: Record<string, string[]> = {
  Prayer: ["prayer", "pray", "praying", "intercede"],
  Healing: ["heal", "healed", "healing", "restored", "restoration"],
  Deliverance: [
    "deliverance",
    "delivered",
    "freedom",
    "free",
    "breakthrough",
    "bondage",
    "addiction",
  ],
  Teaching: ["teaching", "teach", "sermon", "lesson", "bible", "scripture"],
  Prophecy: ["prophecy", "prophetic", "prophet", "vision", "dream"],
  Testimony: ["testimony", "testimonies", "story", "witness"],
  Praise: ["praise", "thank", "thankful", "worship", "god did"],
};

const dynamicKeywordFilters = [
  { label: "Answered", keywords: ["answered", "god did it", "god did"] },
  { label: "Breakthrough", keywords: ["breakthrough", "breakthroughs"] },
  { label: "Freedom", keywords: ["freedom", "free", "set free"] },
  { label: "Peace", keywords: ["peace", "calm", "comfort"] },
  { label: "Restoration", keywords: ["restore", "restored", "restoration"] },
  { label: "Provision", keywords: ["provide", "provided", "provision"] },
  { label: "Salvation", keywords: ["salvation", "saved", "born again"] },
  { label: "Family", keywords: ["family", "marriage", "husband", "wife"] },
  { label: "Anxiety", keywords: ["anxiety", "anxious", "fear", "panic"] },
];

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function getSearchableText(story: StoryRow) {
  return [
    story.story_type,
    story.story_text,
    story.name,
    story.location,
    story.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesAnyKeyword(story: StoryRow, keywords: string[]) {
  const searchableText = getSearchableText(story);

  return keywords.some((keyword) =>
    searchableText.includes(keyword.toLowerCase())
  );
}

function getStoryTypeChip(storyType: string | null) {
  const cleanType = storyType
    ?.replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanType) return null;

  const chipLabel = titleCase(cleanType.toLowerCase());

  if (!chipLabel || coreFilterSet.has(normalizeText(chipLabel))) {
    return null;
  }

  return chipLabel;
}

function storyMatchesFilter(story: StoryRow, filter: string) {
  if (filter === "All") return true;

  const coreKeywords = filterKeywordMap[filter];

  if (coreKeywords) {
    return matchesAnyKeyword(story, coreKeywords);
  }

  const searchableText = getSearchableText(story);

  return searchableText.includes(filter.toLowerCase());
}

export default function SearchPage() {
  const [checkingUser, setCheckingUser] = useState(true);
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [brokenVideoIds, setBrokenVideoIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
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
        .select(
          "id, user_id, name, location, story_type, story_text, video_url, thumbnail_url, status, created_at"
        )
        .eq("status", "approved")
        .or("video_url.not.is.null,story_text.not.is.null")
        .order("created_at", { ascending: false });

      if (error) {
        setMessage(`Could not load discovery feed: ${error.message}`);
        setCheckingUser(false);
        return;
      }

      const cleanStories = ((data as StoryRow[]) ?? []).filter((story) => {
        const hasText = Boolean(story.story_text?.trim());
        const hasVideo = Boolean(story.video_url?.trim());

        return hasText || hasVideo;
      });

      setStories(cleanStories);
      setCheckingUser(false);
    }

    loadSearch();
  }, []);

  const dynamicFilters = useMemo(() => {
    const nextFilters: FilterOption[] = [];
    const seenLabels = new Set(coreFilters.map(normalizeText));

    function addFilter(label: string) {
      const normalizedLabel = normalizeText(label);

      if (!normalizedLabel || seenLabels.has(normalizedLabel)) return;

      seenLabels.add(normalizedLabel);
      nextFilters.push({ label, dynamic: true });
    }

    dynamicKeywordFilters.forEach((filter) => {
      if (stories.some((story) => matchesAnyKeyword(story, filter.keywords))) {
        addFilter(filter.label);
      }
    });

    stories.forEach((story) => {
      const chipLabel = getStoryTypeChip(story.story_type);

      if (chipLabel) {
        addFilter(chipLabel);
      }
    });

    return nextFilters;
  }, [stories]);

  const filterOptions = useMemo<FilterOption[]>(
    () => [
      ...coreFilters.map((label) => ({ label })),
      ...dynamicFilters,
    ],
    [dynamicFilters]
  );

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
      if (brokenVideoIds.includes(story.id)) return false;

      const matchesQuery =
        !cleanQuery || getSearchableText(story).includes(cleanQuery);
      const matchesFilter = storyMatchesFilter(story, activeFilter);

      return matchesQuery && matchesFilter;
    });
  }, [stories, query, activeFilter, brokenVideoIds]);

  function markBrokenVideo(storyId: string) {
    setBrokenVideoIds((current) =>
      current.includes(storyId) ? current : [...current, storyId]
    );
  }

  function getCardTitle(story: StoryRow) {
    if (story.story_text) {
      return story.story_text.length > 90
        ? `${story.story_text.slice(0, 90)}...`
        : story.story_text;
    }

    if (story.video_url) return "Video testimony";

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
          Loading testimonies...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] pb-28 text-slate-900">
      <div className="mx-auto max-w-4xl px-3 pt-4">
        <section className="sticky top-0 z-40 -mx-3 bg-[#f8fbff]/95 px-3 pb-4 pt-2 backdrop-blur-xl">
          <div className="mb-4 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs font-black uppercase tracking-[0.22em] text-[#0b63ce]">
              HTBF Discovery
            </div>

            <h1 className="mt-2 text-3xl font-black leading-tight tracking-tight text-[#062a57]">
              Find videos and testimonies
            </h1>

            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              Search approved stories, video testimonies, prayer updates, and
              praise reports from the HTBF community.
            </p>

            <div className="mt-4 flex items-center gap-2">
              <div className="flex min-h-12 flex-1 items-center rounded-full bg-slate-100 px-4 ring-1 ring-slate-200">
                <Search className="h-5 w-5 shrink-0 text-slate-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search videos, testimonies, prayer, praise..."
                  className="w-full bg-transparent px-3 text-base font-semibold text-slate-800 outline-none placeholder:text-slate-400"
                />
              </div>

              <Link
                href="/share-your-story"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0b63ce] text-white shadow-sm"
                aria-label="Share your story"
              >
                <Sparkles className="h-5 w-5" />
              </Link>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {filterOptions.map((filter) => (
              <button
                key={filter.label}
                type="button"
                onClick={() => setActiveFilter(filter.label)}
                className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-black transition ${
                  activeFilter === filter.label
                    ? "bg-[#0b63ce] text-white shadow-sm"
                    : filter.dynamic
                      ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
                      : "bg-white text-slate-700 ring-1 ring-slate-200"
                }`}
              >
                {filter.label}
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
          <div className="mb-3 flex items-center justify-between px-1">
            <div className="text-sm font-black text-[#062a57]">
              {filteredStories.length}{" "}
              {filteredStories.length === 1 ? "result" : "results"}
            </div>

            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
              {activeFilter}
            </div>
          </div>

          {filteredStories.length === 0 ? (
            <div className="rounded-[2rem] bg-white p-6 text-slate-600 shadow-sm ring-1 ring-slate-200">
              No videos or testimonies found. Try another search or filter.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filteredStories.map((story, index) => {
                const videoSource = getVideoSource(story.video_url);
                const isLarge = index % 7 === 0;

                if (videoSource) {
                  return (
                    <VideoDiscoveryTile
                      key={story.id}
                      storyId={story.id}
                      videoSource={videoSource}
                      thumbnailUrl={story.thumbnail_url}
                      title={getCardTitle(story)}
                      storyType={getStoryType(story)}
                      location={story.location || "Video testimony"}
                      isLarge={isLarge}
                      onBrokenVideo={markBrokenVideo}
                    />
                  );
                }

                return (
                  <Link
                    key={story.id}
                    href="/feed"
                    className={`relative overflow-hidden rounded-[1.5rem] bg-white shadow-sm ring-1 ring-slate-200 ${
                      isLarge
                        ? "col-span-2 min-h-72 sm:row-span-2"
                        : "min-h-52"
                    }`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-emerald-50" />

                    <div className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-sm font-black text-[#0b63ce] shadow-sm">
                      {getInitial(story)}
                    </div>

                    <div className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#0b63ce]">
                      Testimony
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#062a57]/95 via-[#062a57]/45 to-transparent p-4 text-white">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/80">
                        {getStoryType(story)}
                      </div>

                      <p className="mt-1 line-clamp-4 text-sm font-black leading-snug">
                        {getCardTitle(story)}
                      </p>

                      <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-black text-white backdrop-blur">
                        {getStoryType(story).toLowerCase().includes("prayer") ? (
                          <HeartHandshake className="h-3.5 w-3.5" />
                        ) : (
                          <Globe2 className="h-3.5 w-3.5" />
                        )}
                        Open in feed
                      </div>
                    </div>
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

function VideoDiscoveryTile({
  storyId,
  videoSource,
  thumbnailUrl,
  title,
  storyType,
  location,
  isLarge,
  onBrokenVideo,
}: {
  storyId: string;
  videoSource: string;
  thumbnailUrl: string | null;
  title: string;
  storyType: string;
  location: string;
  isLarge: boolean;
  onBrokenVideo: (storyId: string) => void;
}) {
  return (
    <Link
      href={`/video-feed?story=${storyId}&from=search`}
      className={`relative block overflow-hidden rounded-[1.5rem] bg-black shadow-sm ring-1 ring-slate-200 ${
        isLarge ? "col-span-2 min-h-72 sm:row-span-2" : "min-h-52"
      }`}
    >
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={title}
          onError={() => onBrokenVideo(storyId)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <video
          src={videoSource}
          muted
          autoPlay
          loop
          playsInline
          preload="metadata"
          onError={() => onBrokenVideo(storyId)}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white backdrop-blur">
        <Video className="h-3.5 w-3.5" />
        Video
      </div>

      <div className="absolute bottom-0 left-0 right-9 p-4 text-white">
        <div className="mb-1 flex items-center gap-1 text-[10px] font-bold text-white/80">
          <Globe2 className="h-3 w-3" />
          {location}
        </div>

        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/80">
          {storyType}
        </div>

        <div className="mt-1 line-clamp-3 text-sm font-black leading-snug">
          {title}
        </div>
      </div>

      <div className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-950 shadow-md">
        <Play className="h-4 w-4 fill-slate-950" />
      </div>
    </Link>
  );
}
