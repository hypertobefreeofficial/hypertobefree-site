import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  HeartHandshake,
  Map,
  MessageCircleHeart,
  Sparkles,
  Trophy,
} from "lucide-react";
import FreedomFeed from "../../components/FreedomFeed";

export default function JourneyPage() {
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
        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-[#0b63ce]">
            <Sparkles className="h-4 w-4" />
            Freedom Journey
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57]">
            See the movement, not just the feed.
          </h1>

          <p className="mt-3 leading-7 text-slate-600">
            This is where HTBF becomes more than social media. Prayer requests
            turn into prayer chains, prayer chains become answered prayers, and
            answered prayers become testimonies that encourage others.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <JourneyCard
            icon={<HeartHandshake className="h-6 w-6" />}
            title="Prayer Chains"
            text="Stand with others in prayer and let them know they are not praying alone."
            href="/prayer"
            button="View Prayer Requests"
          />

          <JourneyCard
            icon={<CheckCircle2 className="h-6 w-6" />}
            title="God Did It"
            text="See answered prayers marked by the original person who shared the request."
            href="/answered"
            button="View Answered Prayers"
          />

          <JourneyCard
            icon={<MessageCircleHeart className="h-6 w-6" />}
            title="Share Your Story"
            text="Post a testimony, praise report, prayer request, or video testimony."
            href="/share-your-story"
            button="Share Now"
          />

<JourneyCard
  icon={<Map className="h-6 w-6" />}
  title="Testimony Map"
  text="See where testimonies, prayer requests, videos, and answered prayers are being shared from."
  href="/map"
  button="Open Map"
/>
        </section>

        <section className="rounded-[2rem] bg-gradient-to-br from-[#082f63] to-[#0b63ce] p-6 text-white shadow-sm">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-black text-blue-100">
            <Trophy className="h-4 w-4" />
            Why this matters
          </div>

          <h2 className="text-3xl font-black tracking-tight">
            Every answered prayer becomes encouragement for someone else.
          </h2>

          <p className="mt-3 leading-7 text-blue-100">
            The goal is not likes, popularity, or endless scrolling. The goal is
            testimony, prayer, encouragement, and visible reminders that God is
            still moving.
          </p>
        </section>

        <section>
          <div className="mb-4">
            <div className="text-sm font-black uppercase tracking-[0.22em] text-emerald-700">
              Answered Prayer Feed
            </div>
            <h2 className="mt-1 text-3xl font-black tracking-tight text-[#062a57]">
              God Did It
            </h2>
            <p className="mt-2 leading-7 text-slate-600">
              These are prayer requests that were marked answered by the person
              who originally shared them.
            </p>
          </div>

          <FreedomFeed defaultFilter="answered" lockedFilter />
        </section>
      </div>
    </main>
  );
}

function JourneyCard({
  icon,
  title,
  text,
  href,
  button,
}: {
  icon: React.ReactNode;
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

      <h3 className="text-2xl font-black text-[#062a57]">{title}</h3>

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
