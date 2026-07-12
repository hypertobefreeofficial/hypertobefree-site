"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Globe2,
  HandHeart,
  List,
  Map as MapIcon,
  MapPin,
  Navigation,
  Sparkles,
  X,
} from "lucide-react";
import LoggedInBottomNav from "../LoggedInBottomNav";
import { MAP_FILTER_OPTIONS, getCategoryLabel } from "../../lib/testimonyMap/categories";
import { loadMapStories } from "../../lib/testimonyMap/loadMapStories";
import type { MapFilterId, MapStoryRecord } from "../../lib/testimonyMap/types";
import { supabase } from "../../lib/supabaseClient";
import "./testimony-map.css";

const TestimonyMapLeaflet = dynamic(
  () => import("./TestimonyMapLeaflet"),
  {
    ssr: false,
    loading: () => (
      <div className="htbf-testimony-map__surface flex min-h-[420px] items-center justify-center rounded-[1.75rem] bg-[#e8f3ff] text-sm font-semibold text-[#062a57] lg:min-h-[560px]">
        Loading interactive map...
      </div>
    ),
  }
);

function storyTitle(story: MapStoryRecord) {
  const text = story.storyText?.trim();
  if (!text) return story.storyType || "HTBF Story";
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}

function storyExcerpt(story: MapStoryRecord) {
  const text = story.storyText?.trim();
  if (!text) return "A public testimony shared on Hyper to Be Free.";
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

function encouragementTotal(story: MapStoryRecord) {
  const summary = story.reactionSummary;
  if (!summary) return 0;
  return summary.amen + summary.praiseGod + summary.encouraged + summary.praying;
}

export default function TestimonyMapExperience() {
  const [checkingUser, setCheckingUser] = useState(true);
  const [loadState, setLoadState] = useState<
    "loading" | "ready" | "empty" | "error" | "offline"
  >("loading");
  const [loadMessage, setLoadMessage] = useState("");
  const [stories, setStories] = useState<MapStoryRecord[]>([]);
  const [activeFilter, setActiveFilter] = useState<MapFilterId>("all");
  const [sortMode, setSortMode] = useState<"recent" | "encouraged">("recent");
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [selectedStory, setSelectedStory] = useState<MapStoryRecord | null>(null);
  const [nearMeActive, setNearMeActive] = useState(false);
  const [nearMeMessage, setNearMeMessage] = useState("");
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );

  useEffect(() => {
    async function bootstrap() {
      setCheckingUser(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.href = "/login";
          return;
        }
      } catch {
        setLoadState("error");
        setLoadMessage("Could not verify your session. Please sign in again.");
        setCheckingUser(false);
        return;
      }

      setCheckingUser(false);
      setLoadState("loading");

      const result = await loadMapStories();

      if (result.ok === false) {
        setLoadState(result.reason === "offline" ? "offline" : "error");
        setLoadMessage(result.message);
        setStories([]);
        return;
      }

      setStories(result.stories);
      setLoadState(result.stories.length > 0 ? "ready" : "empty");
      setLoadMessage("");
    }

    void bootstrap();
  }, []);

  const filteredStories = useMemo(() => {
    let results = stories;

    if (activeFilter !== "all") {
      results = results.filter((story) => story.category === activeFilter);
    }

    if (nearMeActive && userCoords) {
      results = [...results].sort((a, b) => {
        const distanceA = Math.hypot(a.lat - userCoords.lat, a.lng - userCoords.lng);
        const distanceB = Math.hypot(b.lat - userCoords.lat, b.lng - userCoords.lng);
        return distanceA - distanceB;
      });
      return results;
    }

    if (sortMode === "encouraged") {
      return [...results].sort(
        (a, b) => encouragementTotal(b) - encouragementTotal(a)
      );
    }

    return [...results].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [activeFilter, nearMeActive, sortMode, stories, userCoords]);

  async function handleNearMe() {
    setNearMeMessage("");

    if (!navigator.geolocation) {
      setNearMeMessage("Location is not available on this device.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setNearMeActive(true);
        setNearMeMessage("Showing stories nearest to you.");
      },
      () => {
        setNearMeActive(false);
        setNearMeMessage(
          "Location access was denied. You can still browse the full map."
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }

  if (checkingUser) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-5xl rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          Loading testimony map...
        </div>
      </main>
    );
  }

  return (
    <main className="htbf-testimony-map min-h-screen bg-[#f8fbff] pb-[calc(6.5rem+env(safe-area-inset-bottom))] text-slate-900 lg:pb-10">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <Link
            href="/journey"
            className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-sm font-black text-[#082f63] transition hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to Journey
          </Link>

          <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
            Testimony Map
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-[#0b63ce]">
            <Globe2 className="h-4 w-4" aria-hidden />
            Testimonies around the world
          </div>

          <h1 className="text-3xl font-black tracking-tight text-[#062a57] sm:text-4xl">
            See what God is doing across the world.
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
            Explore approved HTBF stories by approximate public location. Each pin
            represents a testimony, prayer, praise report, or answered prayer
            shared with the community.
          </p>

          <p className="mt-2 text-sm font-semibold text-slate-500">
            Locations are approximate and respect each member&apos;s privacy.
          </p>

          {(loadMessage || nearMeMessage) && (
            <div
              role="status"
              className={`mt-5 rounded-2xl p-4 text-sm font-semibold ${
                loadState === "error" || loadState === "offline"
                  ? "bg-amber-50 text-amber-800"
                  : "bg-blue-50 text-[#062a57]"
              }`}
            >
              {loadMessage || nearMeMessage}
            </div>
          )}
        </section>

        <section className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            {MAP_FILTER_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={activeFilter === option.id}
                onClick={() => setActiveFilter(option.id)}
                className={`rounded-full px-3 py-2 text-xs font-black transition focus:outline-none focus:ring-4 focus:ring-blue-100 sm:text-sm ${
                  activeFilter === option.id
                    ? "bg-[#0b63ce] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-[#0b63ce]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleNearMe}
              className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-blue-50 hover:text-[#0b63ce] focus:outline-none focus:ring-4 focus:ring-blue-100 sm:text-sm"
            >
              <Navigation className="h-4 w-4" aria-hidden />
              Near me
            </button>

            <button
              type="button"
              aria-pressed={sortMode === "recent"}
              onClick={() => setSortMode("recent")}
              className={`rounded-full px-4 py-2 text-xs font-black transition focus:outline-none focus:ring-4 focus:ring-blue-100 sm:text-sm ${
                sortMode === "recent"
                  ? "bg-[#062a57] text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              Recent
            </button>

            <button
              type="button"
              aria-pressed={sortMode === "encouraged"}
              onClick={() => setSortMode("encouraged")}
              className={`rounded-full px-4 py-2 text-xs font-black transition focus:outline-none focus:ring-4 focus:ring-blue-100 sm:text-sm ${
                sortMode === "encouraged"
                  ? "bg-[#062a57] text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              Most encouraged
            </button>

            <div className="ml-auto flex gap-2">
              <button
                type="button"
                aria-pressed={viewMode === "map"}
                onClick={() => setViewMode("map")}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black transition focus:outline-none focus:ring-4 focus:ring-blue-100 sm:text-sm ${
                  viewMode === "map"
                    ? "bg-[#0b63ce] text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                <MapIcon className="h-4 w-4" aria-hidden />
                Map
              </button>

              <button
                type="button"
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black transition focus:outline-none focus:ring-4 focus:ring-blue-100 sm:text-sm ${
                  viewMode === "list"
                    ? "bg-[#0b63ce] text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                <List className="h-4 w-4" aria-hidden />
                List
              </button>
            </div>
          </div>
        </section>

        {loadState === "loading" && (
          <section className="rounded-[2rem] bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-semibold text-slate-600">
              Loading approved stories with public locations...
            </p>
          </section>
        )}

        {loadState === "empty" && (
          <section className="rounded-[2rem] bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
            <MapPin className="mx-auto h-10 w-10 text-[#0b63ce]" aria-hidden />
            <h2 className="mt-4 text-2xl font-black text-[#062a57]">
              No public locations yet
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-600">
              Approved stories will appear here when members share an approximate
              location and keep location visibility enabled.
            </p>
          </section>
        )}

        {loadState === "ready" && filteredStories.length === 0 && (
          <section className="rounded-[2rem] bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
            <h2 className="text-2xl font-black text-[#062a57]">
              No stories match this filter
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-600">
              Try another category or reset filters to browse the full testimony
              map.
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveFilter("all");
                setNearMeActive(false);
              }}
              className="mt-5 rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white hover:bg-[#084f9f] focus:outline-none focus:ring-4 focus:ring-blue-100"
            >
              Reset filters
            </button>
          </section>
        )}

        {loadState === "ready" && filteredStories.length > 0 && viewMode === "map" && (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <TestimonyMapLeaflet
              stories={filteredStories}
              onSelect={setSelectedStory}
              focusStoryId={selectedStory?.id ?? null}
            />

            <aside className="hidden lg:block">
              {selectedStory ? (
                <StoryPreviewCard
                  story={selectedStory}
                  onClose={() => setSelectedStory(null)}
                />
              ) : (
                <div className="htbf-testimony-map__preview rounded-[1.5rem] p-5 ring-1 ring-slate-200">
                  <Sparkles className="h-5 w-5 text-[#0b63ce]" aria-hidden />
                  <h2 className="mt-3 text-xl font-black text-[#062a57]">
                    Select a testimony
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Choose a marker or cluster item to preview the story, location,
                    and encouragement summary.
                  </p>
                </div>
              )}
            </aside>
          </section>
        )}

        {loadState === "ready" && filteredStories.length > 0 && viewMode === "list" && (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredStories.map((story) => (
              <button
                key={story.id}
                type="button"
                onClick={() => setSelectedStory(story)}
                className="rounded-[1.5rem] bg-white p-5 text-left shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:ring-blue-200 focus:outline-none focus:ring-4 focus:ring-blue-100"
              >
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#0b63ce]">
                  {getCategoryLabel(story.category)}
                </div>
                <h3 className="mt-2 text-lg font-black text-[#062a57]">
                  {storyTitle(story)}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {storyExcerpt(story)}
                </p>
                <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-500">
                  <MapPin className="h-4 w-4 text-[#0b63ce]" aria-hidden />
                  {story.locationLabel}
                </div>
              </button>
            ))}
          </section>
        )}
      </div>

      {selectedStory && (
        <div className="htbf-testimony-map__sheet lg:hidden">
          <StoryPreviewCard
            story={selectedStory}
            onClose={() => setSelectedStory(null)}
          />
        </div>
      )}

      <LoggedInBottomNav />
    </main>
  );
}

function StoryPreviewCard({
  story,
  onClose,
}: {
  story: MapStoryRecord;
  onClose: () => void;
}) {
  const encouragement = encouragementTotal(story);
  const isPrayer =
    story.category === "prayer" || story.category === "answered";

  return (
    <article className="htbf-testimony-map__preview ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3 p-5">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-[#0b63ce]">
            {getCategoryLabel(story.category)}
          </div>
          <h2 className="mt-1 text-xl font-black text-[#062a57]">
            {storyTitle(story)}
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {story.name || "HTBF Member"} · {story.locationLabel}
          </p>
        </div>

        <button
          type="button"
          aria-label="Close story preview"
          onClick={onClose}
          className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-100"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {(story.imageUrl || story.videoUrl) && (
        <div className="px-5">
          <div className="overflow-hidden rounded-[1.25rem] bg-slate-100 ring-1 ring-slate-200">
            {story.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={story.imageUrl}
                alt=""
                className="aspect-[16/10] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[16/10] items-center justify-center bg-[#062a57] text-sm font-black text-white">
                Video testimony
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3 p-5">
        <p className="text-sm leading-7 text-slate-600">{storyExcerpt(story)}</p>

        {encouragement > 0 && (
          <p className="text-sm font-semibold text-slate-500">
            {encouragement} encouragement response
            {encouragement === 1 ? "" : "s"}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/feed?story=${encodeURIComponent(story.id)}`}
            className="inline-flex rounded-full bg-[#0b63ce] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#084f9f] focus:outline-none focus:ring-4 focus:ring-blue-100"
          >
            View Story
          </Link>

          {isPrayer && (
            <Link
              href="/prayer"
              className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-800 ring-1 ring-amber-100 transition hover:bg-amber-100 focus:outline-none focus:ring-4 focus:ring-amber-100"
            >
              <HandHeart className="h-4 w-4" aria-hidden />
              Pray
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
