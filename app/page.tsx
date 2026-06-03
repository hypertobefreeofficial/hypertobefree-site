import React from "react";

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

export default function HomePage() {

  const stories = [

    {

      type: "Praise Report",

      title: "God gave me peace when I felt overwhelmed.",

      location: "Phoenix, USA",

      tag: "Peace",

    },

    {

      type: "Testimony",

      title: "Jesus restored hope in my family.",

      location: "Lagos, Nigeria",

      tag: "Restoration",

    },

    {

      type: "Video Story",

      title: "The Holy Spirit helped me forgive and move forward.",

      location: "Manila, Philippines",

      tag: "Freedom",

    },

  ];

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

            <LogoMark />

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

            <a className="hover:text-[#0b63ce]" href="#about">

              About

            </a>

          </nav>

          <div className="flex items-center gap-3">

            <a

              href="/login"

              className="hidden rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 sm:block"

            >

              Sign In

            </a>

            <a

              href="/signup"

              className="rounded-full bg-[#0b63ce] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#084f9f]"

            >

              Share Your Story

            </a>

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

                <a

                  href="/signup"

                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#082f63] px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-blue-950/10 hover:bg-[#0b3f80]"

                >

                  Share Your Story <Send className="h-4 w-4" />

                </a>

                <a

                  href="/login"

                  className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3.5 text-base font-bold text-[#082f63] shadow-sm hover:bg-slate-50"

                >

                  Explore Testimonies <Search className="h-4 w-4" />

                </a>

              </div>

            </div>

            <div className="relative min-h-[470px]">

              <div className="absolute right-0 top-2 h-[440px] w-full rounded-[2.5rem] bg-gradient-to-br from-sky-200 via-amber-100 to-orange-200 shadow-2xl shadow-blue-950/10 md:w-[560px]">

                <div className="absolute inset-0 rounded-[2.5rem] bg-[radial-gradient(circle_at_70%_28%,rgba(255,255,255,0.9),transparent_16%),radial-gradient(circle_at_72%_75%,rgba(255,176,56,0.65),transparent_18%)]" />

                <div className="absolute bottom-0 left-0 right-0 h-36 rounded-b-[2.5rem] bg-gradient-to-t from-[#082f63]/25 to-transparent" />

                <div className="absolute bottom-9 right-10 h-20 w-96 rounded-full bg-[#082f63]/15 blur-2xl" />

                <GirlSilhouette />

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

                      Freedom • 1 min watch

                    </div>

                  </div>

                </div>

                <p className="mt-4 text-sm leading-6 text-slate-600">

                  “I woke up with peace after weeks of anxiety.”

                </p>

                <div className="mt-4 flex gap-2 text-xs font-bold text-slate-500">

                  <span className="rounded-full bg-slate-100 px-3 py-1">

                    Amen

                  </span>

                  <span className="rounded-full bg-slate-100 px-3 py-1">

                    Praying

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

        <section id="stories" className="mx-auto max-w-7xl px-6 py-14">

          <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">

            <div>

              <div className="text-sm font-bold uppercase tracking-[0.22em] text-[#0b63ce]">

                Freedom Feed

              </div>

              <h2 className="mt-2 text-3xl font-black tracking-tight text-[#062a57] md:text-4xl">

                Stories being shared now

              </h2>

            </div>

            <a

              href="/login"

              className="w-fit rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-[#082f63] shadow-sm hover:bg-slate-50"

            >

              View More Stories

            </a>

          </div>

          <div className="grid gap-5 md:grid-cols-3">

            {stories.map((story) => (

              <article

                key={story.title}

                className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-950/5"

              >

                <div className="mb-5 flex items-center justify-between">

                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[#0b63ce]">

                    {story.type}

                  </span>

                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">

                    {story.tag}

                  </span>

                </div>

                <div className="mb-4 h-44 rounded-[1.5rem] bg-gradient-to-br from-[#eaf5ff] via-white to-[#fff0cf] p-4">

                  <div className="flex h-full items-center justify-center rounded-[1.2rem] border border-white bg-white/50">

                    <Play className="h-10 w-10 fill-[#0b63ce] text-[#0b63ce]" />

                  </div>

                </div>

                <h3 className="text-xl font-black leading-tight text-slate-900">

                  {story.title}

                </h3>

                <div className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-500">

                  <Globe2 className="h-4 w-4" /> {story.location}

                </div>

                <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-slate-500">

                  <span className="rounded-full bg-slate-100 px-3 py-1.5">

                    Amen

                  </span>

                  <span className="rounded-full bg-slate-100 px-3 py-1.5">

                    Praise God

                  </span>

                  <span className="rounded-full bg-slate-100 px-3 py-1.5">

                    This encouraged me

                  </span>

                </div>

              </article>

            ))}

          </div>

        </section>

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

        <section className="mx-auto max-w-7xl px-6 py-14">

          <div className="grid gap-6 md:grid-cols-3">

            <InfoCard

              icon={<HeartHandshake className="mb-5 h-9 w-9 text-[#0b63ce]" />}

              title="Encouraging responses"

              text="Simple response options keep the focus on prayer, praise, and encouragement."

            />

            <InfoCard

              icon={

                <MessageCircleHeart className="mb-5 h-9 w-9 text-[#0b63ce]" />

              }

              title="Prayer support"

              text="A quiet place for people to share prayer needs and receive encouragement."

            />

            <InfoCard

              icon={<ShieldCheck className="mb-5 h-9 w-9 text-[#0b63ce]" />}

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

                  Find encouragement by category

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

                making, it matters. Enter HTBF to read stories from others,

                share what God has done, and be part of a community centered on

                freedom, hope, prayer, and encouragement.

              </p>

              <a

                href="/login"

                className="mt-8 inline-flex rounded-full bg-[#0b63ce] px-6 py-3.5 text-base font-bold text-white shadow-sm hover:bg-[#084f9f]"

              >

                Enter HTBF

              </a>

            </div>

            <div className="rounded-[2rem] bg-white/70 p-6 shadow-sm ring-1 ring-white">

              <div className="mb-4 flex items-center gap-3">

                <LogoMark />

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

      <footer className="border-t border-slate-200 bg-white">

        <div className="mx-auto max-w-7xl px-6 py-8">

          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">

            <div>

              <div className="text-lg font-black text-[#082f63]">HTBF</div>

              <p className="mt-1 text-sm font-semibold text-slate-500">

                Hyper to Be Free — Stories of freedom, hope, prayer, and

                encouragement.

              </p>

              <p className="mt-2 text-sm font-bold text-slate-600">

                Contact:{" "}

                <a

                  href="mailto:support@hypertobefree.com"

                  className="text-[#0b63ce] hover:underline"

                >

                  support@hypertobefree.com

                </a>

              </p>

            </div>

            <div className="flex flex-wrap gap-4 text-sm font-bold text-slate-600">

              <a href="/privacy" className="hover:text-[#0b63ce]">

                Privacy Policy

              </a>

              <a href="/terms" className="hover:text-[#0b63ce]">

                Terms of Service

              </a>

              <a href="/content-rules" className="hover:text-[#0b63ce]">

                Content Rules

              </a>

              <a href="/copyright" className="hover:text-[#0b63ce]">

                Copyright Removal

              </a>

            </div>

          </div>

          <div className="mt-6 text-xs font-semibold leading-6 text-slate-400">

            © {new Date().getFullYear()} Hyper to Be Free. All rights reserved.

          </div>

        </div>

      </footer>

    </div>

  );

}

function LogoMark() {

  return (

    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">

      <img

        src="/images/htbf-logo.png"

        alt="HTBF logo"

        className="h-full w-full object-contain p-1"

      />

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

      {icon}

      <h3 className="text-2xl font-black text-[#062a57]">{title}</h3>

      <p className="mt-3 leading-7 text-slate-600">{text}</p>

    </div>

  );

}

function GirlSilhouette() {

  return (

    <svg

      className="absolute bottom-16 right-16 h-72 w-56 text-[#061a31]"

      viewBox="0 0 220 300"

      fill="currentColor"

      xmlns="http://www.w3.org/2000/svg"

      aria-hidden="true"

    >

      <circle cx="122" cy="54" r="21" />

      <path d="M101 70c-13 12-22 31-28 55-6 26-6 45 0 56 7 13 27 13 39 3 7-6 10-21 13-40 3-19 10-39 24-60-12-18-31-27-48-14Z" />

      <path d="M89 83C63 61 49 43 35 20c-5-8-15-3-11 6 10 26 27 51 52 75l13-18Z" />

      <path d="M145 83c17-27 29-48 36-71 3-10 15-8 15 2-1 28-12 58-33 88l-18-19Z" />

      <path d="M124 179c-10 26-9 43 9 54 17 11 31 27 37 48 3 10 17 8 17-3 0-29-12-54-37-75-8-7-8-13-3-24h-23Z" />

      <path d="M78 172c-22 16-37 35-45 58-4 12 9 20 17 10 12-15 27-28 45-40 14-9 16-20 10-31l-27 3Z" />

      <path d="M112 34c19-18 36-17 51-3-16-2-28 2-37 13l-14-10Z" />

      <path d="M135 42c25-10 40-5 51 10-16-5-30-3-44 5l-7-15Z" />

    </svg>

  );

}
