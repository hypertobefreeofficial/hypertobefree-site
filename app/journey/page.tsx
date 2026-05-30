import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  HeartHandshake,
  Map,
  Sparkles,
  Trophy,
  Flame,
  Send,
  Users,
  Footprints,
  Compass,
  ShieldCheck,
  MessageCircleHeart,
  Globe2,
  Star,
} from "lucide-react";

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
            HTBF is built around a spiritual movement: people share what God is
            doing, others stand with them in prayer, and answered prayers become
            encouragement for someone else.
          </p>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <MiniStat number="1" label="Share" />
            <MiniStat number="2" label="Pray" />
            <MiniStat number="3" label="Testify" />
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
              <Compass className="h-6 w-6" />
            </div>

            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                Journey Path
              </div>
              <h2 className="text-2xl font-black text-[#062a57]">
                How a story moves through HTBF
              </h2>
            </div>
          </div>

          <div className="space-y-4">
            <JourneyPathStep
              number="01"
              icon={<Send className="h-5 w-5" />}
              title="Someone shares"
              text="A person shares a testimony, praise report, prayer request, or video story."
            />

            <JourneyPathStep
              number="02"
              icon={<Users className="h-5 w-5" />}
              title="The community responds"
              text="Others respond with prayer, encouragement, Amen, Praise God, or support."
            />

            <JourneyPathStep
              number="03"
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="God Did It"
              text="When a prayer is answered, the original poster can mark it answered and share what happened."
            />

            <JourneyPathStep
              number="04"
              icon={<Flame className="h-5 w-5" />}
              title="The testimony strengthens others"
              text="Answered prayers and testimonies become reminders that God is still moving."
            />
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <JourneyFeatureCard
            icon={<HeartHandshake className="h-6 w-6" />}
            eyebrow="Prayer Movement"
            title="Prayer Chains"
            text="Not just a list of prayer requests. Prayer Chains show people that others are actively standing with them."
            href="/prayer"
            button="Join a Prayer Chain"
            color="blue"
          />

          <JourneyFeatureCard
            icon={<CheckCircle2 className="h-6 w-6" />}
            eyebrow="Answered Prayer"
            title="God Did It"
            text="Answered prayers are marked by the original person who shared the request, turning prayer into testimony."
            href="/answered"
            button="See God Did It"
            color="emerald"
          />

          <JourneyFeatureCard
            icon={<Footprints className="h-6 w-6" />}
            eyebrow="Personal Step"
            title="Start Your Journey"
            text="Your story may be the exact encouragement someone else needs. Share a testimony, prayer, praise report, or video."
            href="/share-your-story"
            button="Start My Journey"
            color="amber"
          />

          <JourneyFeatureCard
            icon={<Map className="h-6 w-6" />}
            eyebrow="Movement Map"
            title="Testimony Map"
            text="See where testimonies, prayer requests, videos, and answered prayers are being shared from."
            href="/map"
            button="Open Map"
            color="sky"
          />
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
              <Star className="h-6 w-6" />
            </div>

            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-amber-700">
                What Makes HTBF Different
              </div>
              <h2 className="text-2xl font-black text-[#062a57]">
                This is not built around likes.
              </h2>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <DifferenceCard
              icon={<MessageCircleHeart className="h-5 w-5" />}
              title="Faith-filled responses"
              text="Responses are centered on prayer, praise, testimony, and encouragement."
            />

            <DifferenceCard
              icon={<HeartHandshake className="h-5 w-5" />}
              title="Prayer support"
              text="Prayer requests are not passive posts. They can become active prayer chains."
            />

            <DifferenceCard
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="Answered prayer flow"
              text="Only the original poster can mark their prayer answered with God Did It."
            />

            <DifferenceCard
              icon={<Globe2 className="h-5 w-5" />}
              title="Movement view"
              text="The map and Journey page show the bigger picture of what God is doing."
            />
          </div>
        </section>

        <section className="rounded-[2rem] bg-gradient-to-br from-[#082f63] to-[#0b63ce] p-6 text-white shadow-sm">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-black text-blue-100">
            <Trophy className="h-4 w-4" />
            Why this matters
          </div>

          <h2 className="text-3xl font-black tracking-tight">
            Every answered prayer can become encouragement for someone else.
          </h2>

          <p className="mt-3 leading-7 text-blue-100">
            The goal is not popularity, endless scrolling, or empty reactions.
            The goal is testimony, prayer, encouragement, and visible reminders
            that God is still moving.
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
              href="/map"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm font-black text-white ring-1 ring-white/20 hover:bg-white/15"
            >
              View Testimony Map
              <Map className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <ShieldCheck className="h-6 w-6" />
            </div>

            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">
                Coming Next
              </div>
              <h2 className="text-2xl font-black text-[#062a57]">
                Future Journey features
              </h2>
            </div>
          </div>

          <div className="space-y-3">
            <ComingSoonItem text="My Prayer Chains — people I am praying for." />
            <ComingSoonItem text="My God Did It moments — answered prayers I shared." />
            <ComingSoonItem text="Encouragement impact — people encouraged by my stories." />
            <ComingSoonItem text="Countries reached — where my testimonies have been viewed." />
          </div>
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

function JourneyPathStep({
  number,
  icon,
  title,
  text,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-4 rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-100">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#0b63ce] shadow-sm ring-1 ring-slate-100">
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

function DifferenceCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#0b63ce] shadow-sm ring-1 ring-slate-100">
        {icon}
      </div>

      <div className="font-black text-[#062a57]">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function ComingSoonItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-100">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#0b63ce]">
        <Sparkles className="h-4 w-4" />
      </div>
      {text}
    </div>
  );
}
