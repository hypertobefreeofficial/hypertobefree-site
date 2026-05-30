"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  HeartHandshake,
  Sparkles,
  Trophy,
  Flame,
  Send,
  Users,
  Footprints,
  Compass,
  MessageCircleHeart,
  Globe2,
  Target,
  Lightbulb,
  HandHeart,
  Map,
  NotebookPen,
  Play,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

type StoryRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  video_url: string | null;
  status: string | null;
  prayer_status: string | null;
  answered_text: string | null;
  created_at: string | null;
};

type ReactionRow = {
  story_id: string | null;
  user_id: string | null;
  reaction_type: string | null;
};

export default function JourneyPage() {
  const [checkingUser, setCheckingUser] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [reactions, setReactions] = useState<ReactionRow[]>([]);
  const [reflection, setReflection] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadJourney() {
      setCheckingUser(true);
      setMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setUserId(user.id);

      const savedReflection = window.localStorage.getItem(
        `htbf-reflection-${user.id}`
      );

      if (savedReflection) {
        setReflection(savedReflection);
      }

      const { data: storyData, error: storyError } = await supabase
        .from("stories")
        .select(
          "id, user_id, name, location, story_type, story_text, video_url, status, prayer_status, answered_text, created_at"
        )
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(100);

      if (storyError) {
        setMessage(`Could not load Journey data: ${storyError.message}`);
        setCheckingUser(false);
        return;
      }

      const approvedStories = (storyData as StoryRow[]) ?? [];
      setStories(approvedStories);

      const storyIds = approvedStories.map((story) => story.id);

      if (storyIds.length > 0) {
        const { data: reactionData, error: reactionError } = await supabase
          .from("story_reactions")
          .select("story_id, user_id, reaction_type")
          .in("story_id", storyIds);

        if (reactionError) {
          setMessage(
            `Could not load Journey reactions: ${reactionError.message}`
          );
        } else {
          setReactions((reactionData as ReactionRow[]) ?? []);
        }
      }

      setCheckingUser(false);
    }

    loadJourney();
  }, []);

  function saveReflection(nextReflection: string) {
    setReflection(nextReflection);

    if (userId) {
      window.localStorage.setItem(
        `htbf-reflection-${userId}`,
        nextReflection
      );
    }
  }

  const myStories = useMemo(() => {
    return stories.filter((story) => story.user_id === userId);
  }, [stories, userId]);

  const myPrayerWatchlist = useMemo(() => {
    const storyIdsIPrayedFor = reactions
      .filter(
        (reaction) =>
          reaction.user_id === userId && reaction.reaction_type === "praying"
      )
      .map((reaction) => reaction.story_id)
      .filter(Boolean);

    return stories.filter(
      (story) =>
        storyIdsIPrayedFor.includes(story.id) &&
        story.story_type?.toLowerCase().includes("prayer")
    );
  }, [reactions, stories, userId]);

  const myGodDidItMoments = useMemo(() => {
    return myStories.filter(
      (story) =>
        story.story_type?.toLowerCase().includes("prayer") &&
        story.prayer_status === "answered"
    );
  }, [myStories]);

  const encouragementImpact = useMemo(() => {
    const myStoryIds = myStories.map((story) => story.id);

    const reactionsOnMyStories = reactions.filter((reaction) =>
      myStoryIds.includes(reaction.story_id ?? "")
    );

    return {
      total: reactionsOnMyStories.length,
      amen: reactionsOnMyStories.filter(
        (reaction) => reaction.reaction_type === "amen"
      ).length,
      praiseGod: reactionsOnMyStories.filter(
        (reaction) => reaction.reaction_type === "praise_god"
      ).length,
      encouraged: reactionsOnMyStories.filter(
        (reaction) => reaction.reaction_type === "encouraged"
      ).length,
      praying: reactionsOnMyStories.filter(
        (reaction) => reaction.reaction_type === "praying"
      ).length,
    };
  }, [myStories, reactions]);

  const journeyTotals = useMemo(() => {
    return {
      storiesShared: myStories.length,
      prayersJoined: myPrayerWatchlist.length,
      godDidIt: myGodDidItMoments.length,
      encouragements: encouragementImpact.total,
    };
  }, [
    myStories.length,
    myPrayerWatchlist.length,
    myGodDidItMoments.length,
    encouragementImpact.total,
  ]);

  if (checkingUser) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          Loading your Journey...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] pb-24 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link
            href="/feed"
            className="inline-flex items-center gap-2 text-sm font-black text-[#082f63]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Feed
          </Link>

          <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
            Journey
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#082f63] via-[#0b63ce] to-[#69b7ff] p-6 text-white shadow-xl shadow-blue-950/10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-black text-blue-100 ring-1 ring-white/15">
            <Sparkles className="h-4 w-4" />
            Freedom Journey
          </div>

          <h1 className="text-4xl font-black tracking-tight">
            This is your role in the movement.
          </h1>

          <p className="mt-3 leading-7 text-blue-100">
            Journey helps you keep track of prayer, encouragement, answered
            prayers, personal reflection, and the stories you have shared.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat number={journeyTotals.storiesShared} label="Shared" />
            <MiniStat number={journeyTotals.prayersJoined} label="Prayers" />
            <MiniStat number={journeyTotals.godDidIt} label="God Did It" />
            <MiniStat
              number={journeyTotals.encouragements}
              label="Responses"
            />
          </div>
        </section>

        {message && (
          <section className="rounded-[2rem] bg-red-50 p-5 text-sm font-bold text-red-700 ring-1 ring-red-100">
            {message}
          </section>
        )}

        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
              <Target className="h-6 w-6" />
            </div>

            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                Today’s Mission
              </div>
              <h2 className="text-2xl font-black text-[#062a57]">
                Do one thing that brings encouragement.
              </h2>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MissionButton
              href="/prayer"
              icon={<HeartHandshake className="h-5 w-5" />}
              title="Pray"
              text="Stand with one request"
            />

            <MissionButton
              href="/feed"
              icon={<HandHeart className="h-5 w-5" />}
              title="Encourage"
              text="Respond to one story"
            />

            <MissionButton
              href="/share-your-story"
              icon={<Send className="h-5 w-5" />}
              title="Testify"
              text="Share what God did"
            />
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
              <Footprints className="h-6 w-6" />
            </div>

            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-amber-700">
                Freedom Milestones
              </div>
              <h2 className="text-2xl font-black text-[#062a57]">
                Your HTBF journey path
              </h2>
            </div>
          </div>

          <div className="space-y-4">
            <JourneyPathStep
              active={myStories.length > 0}
              number="01"
              icon={<Lightbulb className="h-5 w-5" />}
              title="God moved"
              text="Something happened that was worth remembering."
            />

            <JourneyPathStep
              active={myStories.length > 0}
              number="02"
              icon={<Send className="h-5 w-5" />}
              title="You shared"
              text={
                myStories.length > 0
                  ? `You have shared ${myStories.length} approved story ${
                      myStories.length === 1 ? "" : "ies"
                    }.`
                  : "Share a testimony, praise report, prayer request, or video."
              }
            />

            <JourneyPathStep
              active={encouragementImpact.total > 0}
              number="03"
              icon={<Users className="h-5 w-5" />}
              title="Others responded"
              text={
                encouragementImpact.total > 0
                  ? `Your stories have received ${encouragementImpact.total} response${
                      encouragementImpact.total === 1 ? "" : "s"
                    }.`
                  : "Responses to your stories will appear here."
              }
            />

            <JourneyPathStep
              active={myGodDidItMoments.length > 0}
              number="04"
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="God Did It"
              text={
                myGodDidItMoments.length > 0
                  ? `${myGodDidItMoments.length} of your prayer request${
                      myGodDidItMoments.length === 1 ? " has" : "s have"
                    } been marked answered.`
                  : "Answered prayer moments will appear here."
              }
            />

            <JourneyPathStep
              active={encouragementImpact.encouraged > 0}
              number="05"
              icon={<Flame className="h-5 w-5" />}
              title="Someone else was strengthened"
              text={
                encouragementImpact.encouraged > 0
                  ? `${encouragementImpact.encouraged} person${
                      encouragementImpact.encouraged === 1 ? " was" : "s were"
                    } encouraged by your stories.`
                  : "Encouragement impact will grow as people respond."
              }
            />
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <DashboardCard
            icon={<Users className="h-6 w-6" />}
            eyebrow="My Prayer Watchlist"
            title={`${myPrayerWatchlist.length} Prayer ${
              myPrayerWatchlist.length === 1 ? "Request" : "Requests"
            }`}
            text="These are prayer requests you joined by selecting I’m Praying."
            href="/prayer"
            button="View Prayer"
          />

          <DashboardCard
            icon={<CheckCircle2 className="h-6 w-6" />}
            eyebrow="My God Did It Moments"
            title={`${myGodDidItMoments.length} Answered`}
            text="These are your prayer requests that have been marked answered."
            href="/answered"
            button="View Answered"
          />

          <DashboardCard
            icon={<MessageCircleHeart className="h-6 w-6" />}
            eyebrow="Encouragement Impact"
            title={`${encouragementImpact.total} Responses`}
            text={`Amen: ${encouragementImpact.amen} • Praise God: ${encouragementImpact.praiseGod} • Encouraged: ${encouragementImpact.encouraged} • Praying: ${encouragementImpact.praying}`}
            href="/feed"
            button="Open Feed"
          />

          <DashboardCard
            icon={<Globe2 className="h-6 w-6" />}
            eyebrow="Movement View"
            title="Testimony Map"
            text="See where stories, prayers, videos, and answered prayers are being shared."
            href="/map"
            button="Open Map"
          />
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <NotebookPen className="h-6 w-6" />
            </div>

            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">
                Reflection Room
              </div>
              <h2 className="text-2xl font-black text-[#062a57]">
                What do you want to remember?
              </h2>
            </div>
          </div>

          <textarea
            value={reflection}
            onChange={(event) => saveReflection(event.target.value)}
            placeholder="Write a private reflection, prayer note, or testimony reminder..."
            className="min-h-40 w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-base leading-7 text-slate-700 outline-none transition focus:border-blue-200 focus:bg-white focus:ring-4 focus:ring-blue-50"
          />

          <p className="mt-3 text-sm font-semibold text-slate-500">
            Saved on this device.
          </p>
        </section>

        <section className="rounded-[2rem] bg-gradient-to-br from-[#082f63] to-[#0b63ce] p-6 text-white shadow-sm">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-black text-blue-100">
            <Trophy className="h-4 w-4" />
            Keep going
          </div>

          <h2 className="text-3xl font-black tracking-tight">
            One story can strengthen another person’s journey.
          </h2>

          <p className="mt-3 leading-7 text-blue-100">
            Share what God did, stand with someone in prayer, or write down what
            you want to remember.
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/share-your-story"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-[#082f63] hover:bg-blue-50"
            >
              Share What God Did
              <Send className="h-4 w-4" />
            </Link>

            <Link
              href="/videos"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm font-black text-white ring-1 ring-white/20 hover:bg-white/15"
            >
              Watch Testimonies
              <Play className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function MiniStat({
  number,
  label,
}: {
  number: string | number;
  label: string;
}) {
  return (
    <div className="rounded-2xl bg-white/10 p-3 text-center ring-1 ring-white/15">
      <div className="text-2xl font-black">{number}</div>
      <div className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-blue-100">
        {label}
      </div>
    </div>
  );
}

function MissionButton({
  href,
  icon,
  title,
  text,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-100 transition hover:bg-blue-50"
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#0b63ce] shadow-sm ring-1 ring-slate-100">
        {icon}
      </div>

      <div className="font-black text-[#062a57]">{title}</div>
      <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
    </Link>
  );
}

function JourneyPathStep({
  active,
  number,
  icon,
  title,
  text,
}: {
  active: boolean;
  number: string;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div
      className={`flex gap-4 rounded-[1.5rem] p-4 ring-1 ${
        active
          ? "bg-blue-50 ring-blue-100"
          : "bg-slate-50 ring-slate-100"
      }`}
    >
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ring-1 ${
          active
            ? "bg-[#0b63ce] text-white ring-blue-200"
            : "bg-white text-[#0b63ce] ring-slate-100"
        }`}
      >
        {icon}
      </div>

      <div>
        <div className="text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
          {number}
        </div>
        <div className="mt-1 font-black text-[#062a57]">{title}</div>
        <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
      </div>
    </div>
  );
}

function DashboardCard({
  icon,
  eyebrow,
  title,
  text,
  href,
  button,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  text: string;
  href: string;
  button: string;
}) {
  return (
    <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
        {icon}
      </div>

      <div className="text-xs font-black uppercase tracking-[0.16em] text-[#0b63ce]">
        {eyebrow}
      </div>

      <h3 className="mt-1 text-2xl font-black text-[#062a57]">{title}</h3>

      <p className="mt-2 leading-7 text-slate-600">{text}</p>

      <Link
        href={href}
        className="mt-5 inline-flex rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white hover:bg-[#084f9f]"
      >
        {button}
      </Link>
    </div>
  );
}
