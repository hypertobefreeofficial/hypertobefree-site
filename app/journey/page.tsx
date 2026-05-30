import Link from "next/link";
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
  ShieldCheck,
  MessageCircleHeart,
  Globe2,
  Star,
  Target,
  Lightbulb,
  HandHeart,
  Map,
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
            This is your role in the movement.
          </h1>

          <p className="mt-3 leading-7 text-blue-100">
            Journey is not another feed. It is where HTBF helps you pray,
            encourage, reflect, testify, and see how your story can strengthen
            someone else.
          </p>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <MiniStat number="01" label="Notice" />
            <MiniStat number="02" label="Respond" />
            <MiniStat number="03" label="Testify" />
          </div>
        </section>

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

          <p className="leading-7 text-slate-600">
            Instead of endless scrolling, Journey gives you a simple mission:
            pray for someone, encourage someone, or share what God has done.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MissionButton
              href="/prayer"
              icon={<HeartHandshake className="h-5 w-5" />}
              title="Pray"
              text="Join one prayer chain"
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
                The HTBF journey path
              </h2>
            </div>
          </div>

          <div className="space-y-4">
            <JourneyPathStep
              number="01"
              icon={<Lightbulb className="h-5 w-5" />}
              title="God moved"
              text="Something happened — peace, healing, help, restoration, a door opening, or a moment worth remembering."
            />

            <JourneyPathStep
              number="02"
              icon={<Send className="h-5 w-5" />}
              title="You shared"
              text="You shared a testimony, praise report, prayer request, or video story."
            />

            <JourneyPathStep
              number="03"
              icon={<Users className="h-5 w-5" />}
              title="Others responded"
              text="People prayed, encouraged, said Amen, or stood with your story."
            />

            <JourneyPathStep
              number="04"
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="God Did It"
              text="A prayer was marked answered by the original person who shared it."
            />

            <JourneyPathStep
              number="05"
              icon={<Flame className="h-5 w-5" />}
              title="Someone else was strengthened"
              text="Your testimony became encouragement for another person’s journey."
            />
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <UniqueJourneyCard
            icon={<Users className="h-6 w-6" />}
            eyebrow="Coming Soon"
            title="My Prayer Watchlist"
            text="A private place to see the people and requests you said you are praying for."
          />

          <UniqueJourneyCard
            icon={<CheckCircle2 className="h-6 w-6" />}
            eyebrow="Coming Soon"
            title="My God Did It Moments"
            text="A personal record of prayers you marked answered and testimonies you shared."
          />

          <UniqueJourneyCard
            icon={<MessageCircleHeart className="h-6 w-6" />}
            eyebrow="Coming Soon"
            title="Encouragement Impact"
            text="See how your stories, prayers, and encouragement have helped strengthen others."
          />

          <UniqueJourneyCard
            icon={<Globe2 className="h-6 w-6" />}
            eyebrow="Movement View"
            title="Where Encouragement Is Spreading"
            text="Use the Testimony Map to see where stories and prayers are being shared."
            href="/map"
            button="Open Map"
          />
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <Compass className="h-6 w-6" />
            </div>

            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">
                Reflection Room
              </div>
              <h2 className="text-2xl font-black text-[#062a57]">
                Pause before you scroll.
              </h2>
            </div>
          </div>

          <p className="leading-7 text-slate-600">
            This future space can become a private reflection area where users
            write what they are praying about, what God is teaching them, and
            what they want to remember.
          </p>

          <div className="mt-5 rounded-[1.5rem] bg-slate-50 p-5 ring-1 ring-slate-100">
            <div className="text-sm font-black uppercase tracking-[0.16em] text-[#0b63ce]">
              Prompt
            </div>

            <p className="mt-2 text-lg font-black text-[#062a57]">
              What is one thing God helped you through recently?
            </p>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Later, this can become a private journal entry or a testimony
              draft.
            </p>
          </div>
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
              text="Prayer requests can become active prayer chains."
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
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
              <ShieldCheck className="h-6 w-6" />
            </div>

            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                Future Personal Journey
              </div>
              <h2 className="text-2xl font-black text-[#062a57]">
                What this can become
              </h2>
            </div>
          </div>

          <div className="space-y-3">
            <ComingSoonItem text="People I am praying for." />
            <ComingSoonItem text="Answered prayers I shared." />
            <ComingSoonItem text="Testimonies I posted." />
            <ComingSoonItem text="People encouraged by my stories." />
            <ComingSoonItem text="Locations reached by my testimony." />
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

function UniqueJourneyCard({
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
  href?: string;
  button?: string;
}) {
  const cardContent = (
    <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
        {icon}
      </div>

      <div className="text-xs font-black uppercase tracking-[0.16em] text-[#0b63ce]">
        {eyebrow}
      </div>

      <h3 className="mt-1 text-2xl font-black text-[#062a57]">{title}</h3>

      <p className="mt-2 leading-7 text-slate-600">{text}</p>

      {href && button && (
        <div className="mt-5 inline-flex rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white">
          {button}
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{cardContent}</Link>;
  }

  return cardContent;
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
