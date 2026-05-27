import React from "react";
import Link from "next/link";
import {
  Play,
  HeartHandshake,
  Globe2,
  MessageCircleHeart,
  ShieldCheck,
  Sparkles,
  Send,
  Search,
} from "lucide-react";
import FreedomFeed from "../components/FreedomFeed";

export default function Home() {
  const categories = [
    "Freedom",
    "Healing",
    "Answered Prayer",
    "Restoration",
    "Peace",
    "Encouragement",
  ];

  return (
    <div className="min-h-screen bg-[#f8fbff] text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <img
                src="/images/htbf-logo.png"
                alt="Hyper to Be Free logo"
                className="h-full w-full object-contain p-1"
              />
            </div>

            <div>
              <div className="text-xl font-black tracking-tight text-[#082f63]">
                HTBF
              </div>
              <div className="-mt-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Hyper to Be Free
              </div>
            </div>
          </div>

          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <a className="hover:text-[#0b63ce]" href="#">
              Home
            </a>
            <a className="hover:text-[#0b63ce]" href="#stories">
              Stories
            </a>
            <a className="hover:text-[#0b63ce]" href="#praise">
              Praise Reports
            </a>
            <a className="hover:text-[#0b63ce]" href="#prayer">
              Prayer
            </a>
            <a className="hover:text-[#0b63ce]" href="#about">
              About
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/account"
              className="hidden rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 sm:block"
            >
              My Account
            </Link>

            <Link
              href="/share-your-story"
              className="rounded-full bg-[#0b63ce] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#084f9f]"
            >
              Share Your Story
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(255,196,87,0.42),transparent_32%),linear-gradient(120deg,#f8fbff_0%,#eaf5ff_48%,#fff5dd_100%)]" />
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#f8fbff] to-transparent" />

          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 py-20 md:grid-cols-2 md:py-28">
            <div className="max-w-2xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-4 py-2 text-sm font-semibold text-[#0b63ce] shadow-sm">
                <Sparkles className="h-4 w-4" />
                Stories of freedom, hope, and praise
              </div>

              <h1 className="text-5xl font-black leading-[1.02] tracking-tight text-[#062a57] md:text-7xl">
                See what God is doing in lives around the world.
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600 md:text-xl">
                A faith-centered space for testimonies, praise reports, prayer
                encouragement, and stories of freedom through God, Jesus, and
                the Holy Spirit.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/share-your-story"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#082f63] px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-blue-950/10 hover:bg-[#0b3f80]"
                >
                  Share Your Story <Send className="h-4 w-4" />
                </Link>

                <a
                  href="#stories"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3.5 text-base font-bold text-[#082f63] shadow-sm hover:bg-slate-50"
                >
                  Explore Testimonies <Search className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div className="relative min-h-[470px]">
              <div className="absolute right-0 top-2 h-[440px] w-full overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-sky-200 via-amber-100 to-orange-200 shadow-2xl shadow-blue-950/10 md:w-[560px]">
                <img
                  src="/images/hero-freedom.png"
                  alt="Silhouette of a girl jumping in freedom"
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="absolute left-0 top-12 w-[330px] rounded-3xl border border-white/70 bg-white/90 p-4 shadow-xl shadow-blue-950/10 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
                    <Play className="h-5 w-5 fill-[#0b63ce]" />
                  </div>

                  <div>
                    <div className="text-sm font-black text-slate-900">
                      Latest Video Story
                    </div>
                    <div className="text-xs font-medium text-slate-500">
                      Freedom • Testimony
                    </div>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-600">
                  “Your story may be the encouragement someone else needs
                  today.”
                </p>

                <div className="mt-4 flex gap-2 text-xs font-bold text-slate-500">
                  <span className="rounded-full bg-slate-100 px-3 py-1">
                    Amen
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1">
                    Praise God
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1">
                    Encouraged
                  </span>
                </div>
              </div>

              <div className="absolute bottom-2 left-10 w-[300px] rounded-3xl border border-white/70 bg-white/90 p-4 shadow-xl shadow-blue-950/10 backdrop-blur-xl">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-black text-slate-900">
                    From Around the World
                  </div>
                  <Globe2 className="h-4 w-4 text-[#0b63ce]" />
                </div>

                <div className="space-y-2 text-sm text-slate-600">
                  <div className="flex justify-between rounded-2xl bg-slate-50 px-3 py-2">
                    <span>USA</span>
                    <span>Praise Report</span>
                  </div>
                  <div className="flex justify-between rounded-2xl bg-slate-50 px-3 py-2">
                    <span>Nigeria</span>
                    <span>Testimony</span>
                  </div>
                  <div className="flex justify-between rounded-2xl bg-slate-50 px-3 py-2">
                    <span>Philippines</span>
                    <span>Prayer</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <FreedomFeed />

        <section id="praise" className="mx-auto max-w-7xl px-6 py-14">
          <div className="rounded-[2.5rem] bg-[#082f63] p-8 text-white shadow-2xl shadow-blue-950/10 md:p-12">
            <div className="grid gap-10 md:grid-cols-[0.85fr_1.15fr] md:items-center">
              <div>
                <div className="mb-4 inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-blue-100">
                  Praise Reports
                </div>
                <h2 className="text-4xl font-black tracking-tight">
                  Small reminders. Real hope.
                </h2>
                <p className="mt-5 text-lg leading-8 text-blue-100">
                  Short posts that help people see encouragement throughout the
                  day — answered prayer, renewed peace, a door opening, a heart
                  restored.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ["Answered Prayer", "God made a way when I could not see one."],
                  ["Healing", "Thankful for renewed strength and peace today."],
                  ["Restoration", "God is restoring something I thought was lost."],
                  ["Peace", "I woke up today with a calm heart."],
                ].map(([title, body]) => (
                  <div
                    key={title}
                    className="rounded-3xl bg-white/10 p-5 ring-1 ring-white/10 backdrop-blur"
                  >
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[#0b63ce]">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="font-black">{title}</div>
                    <p className="mt-2 text-sm leading-6 text-blue-100">
                      {body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="prayer" className="mx-auto max-w-7xl px-6 py-14">
          <div className="grid gap-6 md:grid-cols-3">
            <InfoCard
              icon={<HeartHandshake className="h-9 w-9 text-[#0b63ce]" />}
              title="Encouraging responses"
              text="Simple response options keep the focus on prayer, praise, and encouragement."
            />

            <InfoCard
              icon={<MessageCircleHeart className="h-9 w-9 text-[#0b63ce]" />}
              title="Prayer support"
              text="A quiet place for people to share prayer needs and receive encouragement."
            />

            <InfoCard
              icon={<ShieldCheck className="h-9 w-9 text-[#0b63ce]" />}
              title="Protected space"
              text="Reporting and review tools help keep the community focused and safe."
            />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-14">
          <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm md:p-12">
            <div className="mb-7 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold uppercase tracking-[0.22em] text-[#0b63ce]">
                  Browse
                </div>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-[#062a57]">
                  Find stories by category
                </h2>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {categories.map((cat) => (
                <button
                  key={cat}
                  className="rounded-full border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-[#0b63ce]"
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section id="about" className="mx-auto max-w-7xl px-6 pb-20 pt-10">
          <div className="grid gap-8 rounded-[2.5rem] bg-gradient-to-br from-[#fff7e6] to-[#eaf5ff] p-8 md:grid-cols-[1fr_0.85fr] md:p-12">
            <div>
              <h2 className="text-4xl font-black tracking-tight text-[#062a57]">
                Your story may be the encouragement someone else needs today.
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
                Whether your story is big or small, recent or years in the
                making, it matters. Share what God has done, read stories from
                others, and be part of a community centered on freedom, hope,
                prayer, and encouragement.
              </p>

              <Link
                href="/share-your-story"
                className="mt-8 inline-flex rounded-full bg-[#0b63ce] px-6 py-3.5 text-base font-bold text-white shadow-sm hover:bg-[#084f9f]"
              >
                Join Hyper to Be Free
              </Link>
            </div>

            <div className="rounded-[2rem] bg-white/70 p-6 shadow-sm ring-1 ring-white">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                  <img
                    src="/images/htbf-logo.png"
                    alt="HTBF logo"
                    className="h-full w-full object-contain p-1"
                  />
                </div>
                <div>
                  <div className="font-black text-[#062a57]">HTBF</div>
                  <div className="text-sm text-slate-500">
                    Hyper to Be Free
                  </div>
                </div>
              </div>
              <p className="leading-7 text-slate-600">
                Inspired by a dream of a place filled with people from all over
                the world sharing the good things God has done in their lives.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm">
      <div className="mb-5">{icon}</div>
      <h3 className="text-2xl font-black text-[#062a57]">{title}</h3>
      <p className="mt-3 leading-7 text-slate-600">{text}</p>
    </div>
  );
}
