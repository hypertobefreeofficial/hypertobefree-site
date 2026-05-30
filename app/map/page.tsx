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
  latestStory: MapStory | null;
};

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
      const rawLocation = story.location?.trim();

      if (!rawLocation) {
        return;
      }

      const location = rawLocation;

      const existing =
        groups.get(location) ??
        ({
          location,
          total: 0,
          testimonies: 0,
          prayers: 0,
          answered: 0,
          videos: 0,
          latestStory: null,
        } as LocationGroup);

      const storyType = story.story_type?.toLowerCase() ?? "";
      const isPrayer = storyType.includes("prayer");
      const isAnswered = story.prayer_status === "answered";
      const hasVideo = Boolean(story.video_url);

      existing.total += 1;

      if (storyType.includes("testimony") || storyType.includes("praise")) {
        existing.testimonies += 1;
      }

      if (isPrayer) {
        existing.prayers += 1;
      }

      if (isAnswered) {
        existing.answered += 1;
      }

      if (hasVideo) {
        existing.videos += 1;
      }

      if (!existing.latestStory) {
        existing.latestStory = story;
      }

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
            This map pulls from approved HTBF stories and groups them by the
            location shared by each person.
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

        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#082f63] via-[#0b63ce] to-[#79b9ff] p-6 text-white shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.22em] text-blue-100">
                Movement View
              </div>
              <h2 className="mt-1 text-3xl font-black tracking-tight">
                Stories around the world
              </h2>
            </div>

            <Globe2 className="h-10 w-10 text-blue-100" />
          </div>

          <div className="relative min-h-[280px] rounded-[1.5rem] bg-white/10 p-4 ring-1 ring-white/15">
            <div className="absolute inset-0 opacity-30">
              <div className="absolute left-[8%] top-[30%] h-20 w-32 rounded-full border border-white/60" />
              <div className="absolute left-[34%] top-[22%] h-28 w-44 rounded-full border border-white/60" />
              <div className="absolute left-[61%] top-[34%] h-24 w-36 rounded-full border border-white/60" />
              <div className="absolute left-[48%] top-[62%] h-14 w-28 rounded-full border border-white/60" />
            </div>

            {locationGroups.slice(0, 8).map((group, index) => {
              const positions = [
                "left-[13%] top-[35%]",
                "left-[42%] top-[30%]",
                "left-[68%] top-[40%]",
                "left-[52%] top-[65%]",
                "left-[25%] top-[58%]",
                "left-[78%] top-[24%]",
                "left-[36%] top-[72%]",
                "left-[58%] top-[18%]",
              ];

              return (
                <div
                  key={group.location}
                  className={`absolute ${positions[index]} -translate-x-1/2 -translate-y-1/2`}
                >
                  <div className="flex flex-col items-center">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#0b63ce] shadow-lg">
                      <MapPin className="h-5 w-5 fill-[#0b63ce]/10" />
                    </div>

                    <div className="mt-2 rounded-full bg-white/95 px-3 py-1 text-xs font-black text-[#082f63] shadow-sm">
                      {group.location}
                    </div>
                  </div>
                </div>
              );
            })}
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
            {group.latestStory?.story_text
              ? group.latestStory.story_text.slice(0, 120)
              : "Stories, prayer, and encouragement are being shared from this location."}
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
