"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Globe2,
  HeartHandshake,
  MapPin,
  Play,
  Sparkles,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

type MapStory = {
  id: string;
  name: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  video_url: string | null;
  status: string | null;
  prayer_status: string | null;
  created_at: string | null;
};

type LocationGroup = {
  location: string;
  total: number;
  testimonies: number;
  prayers: number;
  answered: number;
  videos: number;
};

function cleanLocation(location: string | null) {
  if (!location) return null;

  const trimmed = location.trim();

  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();

  if (lower === "buckeye") return "Buckeye, AZ";
  if (lower === "buckeye az") return "Buckeye, AZ";
  if (lower === "buckeye, az") return "Buckeye, AZ";
  if (lower === "arizona") return "Arizona";
  if (lower === "az") return "Arizona";

  return trimmed
    .split(" ")
    .map((word) =>
      word.length > 2
        ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        : word.toUpperCase()
    )
    .join(" ");
}

export default function TestimonyMapPage() {
  const [checkingUser, setCheckingUser] = useState(true);
  const [stories, setStories] = useState<MapStory[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadMap() {
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
          "id, name, location, story_type, story_text, video_url, status, prayer_status, created_at"
        )
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        setMessage(`Could not load map stories: ${error.message}`);
        setCheckingUser(false);
        return;
      }

      setStories((data as MapStory[]) ?? []);
      setCheckingUser(false);
    }

    loadMap();
  }, []);

  const locationGroups = useMemo(() => {
    const groups = new Map<string, LocationGroup>();

    stories.forEach((story) => {
      const location = cleanLocation(story.location);

      if (!location) return;

      const existing =
        groups.get(location) ??
        ({
          location,
          total: 0,
          testimonies: 0,
          prayers: 0,
          answered: 0,
          videos: 0,
        } as LocationGroup);

      const storyType = story.story_type?.toLowerCase() ?? "";
      const isPrayer = storyType.includes("prayer");
      const isAnswered = story.prayer_status === "answered";
      const hasVideo = Boolean(story.video_url);

      existing.total += 1;

      if (storyType.includes("testimony") || storyType.includes("praise")) {
        existing.testimonies += 1;
      }

      if (isPrayer) existing.prayers += 1;
      if (isAnswered) existing.answered += 1;
      if (hasVideo) existing.videos += 1;

      groups.set(location, existing);
    });

    return Array.from(groups.values()).sort((a, b) => b.total - a.total);
  }, [stories]);

  const totals = useMemo(() => {
    return {
      locations: locationGroups.length,
      stories: stories.length,
      prayers: stories.filter((story) =>
        story.story_type?.toLowerCase().includes("prayer")
      ).length,
      answered: stories.filter((story) => story.prayer_status === "answered")
        .length,
      videos: stories.filter((story) => story.video_url).length,
    };
  }, [locationGroups.length, stories]);

  if (checkingUser) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          Loading testimony map...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] pb-24 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link
            href="/journey"
            className="inline-flex items-center gap-2 text-sm font-black text-[#082f63]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Journey
          </Link>

          <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
            Map
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-[#0b63ce]">
            <Globe2 className="h-4 w-4" />
            Testimony Map
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57]">
            See where God is moving.
          </h1>

          <p className="mt-3 leading-7 text-slate-600">
            A movement view of approved testimonies, prayer requests, answered
            prayers, and video stories grouped by location.
          </p>

          {message && (
            <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
              {message}
            </div>
          )}
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Locations" value={totals.locations} />
          <StatCard label="Stories" value={totals.stories} />
          <StatCard label="Prayers" value={totals.prayers} />
          <StatCard label="Answered" value={totals.answered} />
          <StatCard label="Videos" value={totals.videos} />
        </section>

        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#061f45] via-[#0b63ce] to-[#69b7ff] p-5 text-white shadow-xl shadow-blue-950/10">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.22em] text-blue-100">
                Movement View
              </div>

              <h2 className="mt-1 text-3xl font-black tracking-tight">
                Stories around the world
              </h2>

              <p className="mt-2 text-sm leading-6 text-blue-100">
                Each pin represents a place where someone has shared testimony,
                prayer, or answered prayer.
              </p>
            </div>

            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <Globe2 className="h-7 w-7 text-white" />
            </div>
          </div>

          <div className="relative min-h-[310px] overflow-hidden rounded-[1.75rem] bg-white/10 p-4 ring-1 ring-white/15">
            <div className="absolute inset-0 opacity-25">
              <div className="absolute left-[6%] top-[25%] h-28 w-40 rounded-full border border-white/70" />
              <div className="absolute left-[34%] top-[18%] h-36 w-52 rounded-full border border-white/70" />
              <div className="absolute left-[62%] top-[30%] h-32 w-44 rounded-full border border-white/70" />
              <div className="absolute left-[48%] top-[62%] h-20 w-36 rounded-full border border-white/70" />
              <div className="absolute left-[16%] top-[68%] h-16 w-28 rounded-full border border-white/50" />
            </div>

            <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_35%,rgba(255,255,255,0.24),transparent_18%),radial-gradient(circle_at_72%_40%,rgba(255,255,255,0.18),transparent_16%),radial-gradient(circle_at_52%_70%,rgba(255,255,255,0.16),transparent_12%)]" />

            {locationGroups.slice(0, 8).map((group, index) => {
              const positions = [
                "left-[18%] top-[37%]",
                "left-[49%] top-[30%]",
                "left-[74%] top-[43%]",
                "left-[55%] top-[68%]",
                "left-[28%] top-[64%]",
                "left-[82%] top-[25%]",
                "left-[38%] top-[78%]",
                "left-[62%] top-[18%]",
              ];

              return (
                <div
                  key={group.location}
                  className={`absolute ${positions[index]} -translate-x-1/2 -translate-y-1/2`}
                >
                  <div className="flex flex-col items-center">
                    <div className="relative">
                      <div className="absolute inset-0 animate-ping rounded-full bg-white/40" />
                      <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#0b63ce] shadow-lg">
                        <MapPin className="h-6 w-6 fill-[#0b63ce]/10" />
                      </div>
                    </div>

                    <div className="mt-2 whitespace-nowrap rounded-full bg-white/95 px-3 py-1 text-xs font-black text-[#082f63] shadow-sm">
                      {group.location}
                    </div>

                    <div className="mt-1 rounded-full bg-[#082f63]/70 px-2.5 py-1 text-[10px] font-black text-white ring-1 ring-white/20">
                      {group.total} shared
                    </div>
                  </div>
                </div>
              );
            })}

            {locationGroups.length === 0 && (
              <div className="relative z-10 flex h-[260px] items-center justify-center text-center">
                <div>
                  <MapPin className="mx-auto h-10 w-10 text-blue-100" />
                  <p className="mt-3 text-sm font-semibold text-blue-100">
                    Locations will appear here when approved stories include a
                    location.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5">
            <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
              Locations
            </div>

            <h2 className="mt-1 text-3xl font-black tracking-tight text-[#062a57]">
              Where stories are being shared
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              This section shows counts by location only. The full stories stay
              in the Home and Journey feeds.
            </p>
          </div>

          {locationGroups.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-5 text-slate-600">
              No story locations are available yet. When approved stories include
              a location, they will appear here.
            </div>
          ) : (
            <div className="space-y-4">
              {locationGroups.map((group) => (
                <LocationCard key={group.location} group={group} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.5rem] bg-white p-4 text-center shadow-sm ring-1 ring-slate-200">
      <div className="text-2xl font-black text-[#062a57]">{value}</div>
      <div className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
    </div>
  );
}

function LocationCard({ group }: { group: LocationGroup }) {
  return (
    <div className="rounded-[1.5rem] bg-slate-50 p-5 ring-1 ring-slate-100">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-[#0b63ce]" />
            <h3 className="text-xl font-black text-[#062a57]">
              {group.location}
            </h3>
          </div>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            {group.total === 1
              ? "1 approved HTBF story has been shared from this location."
              : `${group.total} approved HTBF stories have been shared from this location.`}
          </p>
        </div>

        <div className="rounded-full bg-white px-3 py-1 text-sm font-black text-[#0b63ce] ring-1 ring-slate-200">
          {group.total}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
        {group.testimonies > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-[#0b63ce]">
            <Sparkles className="h-3.5 w-3.5" />
            {group.testimonies} Testimony
          </span>
        )}

        {group.prayers > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-amber-700">
            <HeartHandshake className="h-3.5 w-3.5" />
            {group.prayers} Prayer
          </span>
        )}

        {group.answered > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {group.answered} Answered
          </span>
        )}

        {group.videos > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
            <Play className="h-3.5 w-3.5" />
            {group.videos} Video
          </span>
        )}
      </div>
    </div>
  );
}
