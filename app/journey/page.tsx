import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  HeartHandshake,
  Map,
  MessageCircleHeart,
  Sparkles,
  Trophy,
  Flame,
  Send,
  Users,
  Footprints,
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
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#082f63] via-[#0b63ce] to-[#69b7ff] p-6 text-white shadow-xl shadow-blue-950/10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-black text-blue-100 ring-1 ring-white/15">
            <Sparkles className="h-4 w-4" />
            Freedom Journey
          </div>

          <h1 className="text-4xl font-black tracking-tight">
            This is more than a feed.
          </h1>

          <p className="mt-3 leading-7 text-blue-100">
            Prayer requests become prayer chains. Prayer chains become answered
            prayers. Answered prayers become testimonies that encourage someone
            else.
          </p>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <MiniStat number="1" label="Pray" />
            <MiniStat number="2" label="God Did It" />
            <MiniStat number="3" label="Testify" />
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <JourneyFeatureCard
            icon={<Users className="h-6 w-6" />}
            eyebrow="Live Prayer Movement"
            title="Prayer Chains"
            text="See where people are standing together in prayer. This is not just a prayer page — it is the start of a living chain of support."
            href="/prayer"
            button="Join a Prayer Chain"
            color="blue"
          />

          <JourneyFeatureCard
            icon={<CheckCircle2 className="h-6 w-6" />}
            eyebrow="Answered Prayer"
            title="God Did It"
            text="Answered prayers are marked by the original person who shared the request, turning prayer into public testimony."
            href="/answered"
            button="See God Did It"
            color="emerald"
          />

          <JourneyFeatureCard
            icon={<Footprints className="h-6 w-6" />}
            eyebrow="Start Here"
            title="Start Your Freedom Journey"
            text="Share a testimony, praise report, prayer request, or video story. This is how your journey becomes encouragement for someone else."
            href="/share-your-story"
            button="Start My Journey"
            color="amber"
          />

          <JourneyFeatureCard
            icon={<Map className="h-6 w-6" />}
            eyebrow="Movement Map"
            title="Testimony Map"
            text="See where testimonies, prayer requests, videos, and answered prayers are being shared from around the world."
            href="/map"
            button="Open Map"
            color="sky"
          />
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
              <Flame className="h-6 w-6" />
            </div>

            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                Your Role
              </div>
              <h2 className="text-2xl font-black text-[#062a57]">
                Encourage. Pray. Testify.
              </h2>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <RoleStep
              number="01"
              title="Encourage"
              text="Respond with faith-filled encouragement instead of empty likes."
            />
            <RoleStep
              number="02"
              title="Pray"
              text="Join prayer chains and let people know they are not alone."
            />
            <RoleStep
              number="03"
              title="Testify"
              text="Share what God did so someone else can be strengthened."
            />
          </div>
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

          <div className="mt-5">
            <Link
              href="/share-your-story"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-[#082f63] hover:bg-blue-50"
            >
              Share What God Did
              <Send className="h-4 w-4" />
            </Link>
          </div>
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

function MiniStat({ number, label }: { number: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-3 text-center ring-1 ring-white/15">
      <div className="text-2xl font-black">{number}</div>
      <div className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-blue-100">
        {label}
      </div>
    </div>
  );
}

function JourneyFeatureCard({
  icon,
  eyebrow,
  title,
  text,
  href,
  button,
  color,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  text: string;
  href: string;
  button: string;
  color: "blue" | "emerald" | "amber" | "sky";
}) {
  const styles = {
    blue: {
      icon: "bg-blue-50 text-[#0b63ce]",
      eyebrow: "text-[#0b63ce]",
      button: "bg-[#0b63ce] hover:bg-[#084f9f]",
    },
    emerald: {
      icon: "bg-emerald-50 text-emerald-700",
      eyebrow: "text-emerald-700",
      button: "bg-emerald-600 hover:bg-emerald-700",
    },
    amber: {
      icon: "bg-amber-50 text-amber-700",
      eyebrow: "text-amber-700",
      button: "bg-amber-600 hover:bg-amber-700",
    },
    sky: {
      icon: "bg-sky-50 text-sky-700",
      eyebrow: "text-sky-700",
      button: "bg-sky-600 hover:bg-sky-700",
    },
  }[color];

  return (
    <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div
        className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${styles.icon}`}
      >
        {icon}
      </div>

      <div
        className={`text-xs font-black uppercase tracking-[0.16em] ${styles.eyebrow}`}
      >
        {eyebrow}
      </div>

      <h3 className="mt-1 text-2xl font-black text-[#062a57]">{title}</h3>

      <p className="mt-2 leading-7 text-slate-600">{text}</p>

      <Link
        href={href}
        className={`mt-5 inline-flex rounded-full px-5 py-3 text-sm font-black text-white ${styles.button}`}
      >
        {button}
      </Link>
    </div>
  );
}

function RoleStep({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
      <div className="text-xs font-black text-[#0b63ce]">{number}</div>
      <div className="mt-1 font-black text-[#062a57]">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}
