"use client";

import React, { useEffect, useState } from "react";
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
import { supabase } from "../lib/supabaseClient";

const sectionClass = "mx-auto max-w-7xl px-4 sm:px-6 py-14 md:py-16";
const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-5 py-2.5 text-sm font-heading font-bold text-white shadow-sm transition-all duration-200 hover:bg-[#084f9f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b63ce]/35 focus-visible:ring-offset-2 active:scale-[0.98]";
const btnPrimaryLg =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[#082f63] px-6 py-3.5 text-base font-heading font-bold text-white shadow-lg shadow-blue-950/10 transition-all duration-200 hover:bg-[#0b3f80] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#082f63]/35 focus-visible:ring-offset-2 active:scale-[0.98]";
const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-full border border-slate-200/90 bg-white px-6 py-3.5 text-base font-heading font-bold text-[#082f63] shadow-sm transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 active:scale-[0.98]";
const cardClass =
  "rounded-[2rem] border border-slate-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-lg hover:shadow-blue-950/[0.04]";
const glassCardClass =
  "rounded-3xl border border-white/80 bg-white/92 p-4 shadow-xl shadow-blue-950/[0.06] backdrop-blur-xl transition-all duration-300";

export default function HomePage() {
  const [checkingUser, setCheckingUser] = useState(true);

  useEffect(() => {
    async function checkUserProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setCheckingUser(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("profile_completed")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.profile_completed === true) {
        window.location.href = "/feed";
        return;
      }

      window.location.href = "/account";
    }

    checkUserProfile();
  }, []);

  if (checkingUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8fbff] px-4 text-slate-900">
        <div
          className="w-full max-w-sm rounded-[2rem] border border-slate-200/80 bg-white p-8 text-center shadow-sm"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white ring-1 ring-slate-200">
            <img
              src="/images/htbf-logo.png"
              alt=""
              className="h-10 w-10 object-contain"
            />
          </div>
          <p className="mt-4 text-sm font-heading font-bold uppercase tracking-[0.18em] text-[#0b63ce]">
            Hyper to Be Free
          </p>
          <p className="mt-2 text-base font-medium text-slate-600">
            Loading HTBF…
          </p>
        </div>
      </main>
    );
  }

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
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <LogoMark />

            <div>
              <div className="font-heading text-xl font-black tracking-tight text-[#082f63]">
                HTBF
              </div>
              <div className="-mt-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                HYPER TO BE FREE
              </div>
            </div>
          </div>

          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <a className="transition-colors hover:text-[#0b63ce]" href="#">
              Home
            </a>
            <a className="transition-colors hover:text-[#0b63ce]" href="#stories">
              Stories
            </a>
            <a className="transition-colors hover:text-[#0b63ce]" href="#praise">
              Praise Reports
            </a>
            <a className="transition-colors hover:text-[#0b63ce]" href="#about">
              About
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden rounded-full px-4 py-2 text-sm font-heading font-semibold text-slate-600 transition-colors hover:bg-slate-100 sm:block"
            >
              Sign In
            </Link>

            <Link href="/share-your-story" className={btnPrimary}>
              Share Your Story
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(125deg,#f8fbff_0%,#edf6ff_42%,#fff8ee_100%)]" />
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(to_right,rgba(11,99,206,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(11,99,206,0.035)_1px,transparent_1px)] bg-[size:30px_30px] [mask-image:radial-gradient(ellipse_at_50%_40%,black,transparent_72%)]"
          />
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#f8fbff] to-transparent" />

          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:gap-12 md:py-24 lg:py-28">
            <div className="max-w-2xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-100/90 bg-white/85 px-4 py-2 text-sm font-heading font-semibold text-[#0b63ce] shadow-sm backdrop-blur-sm">
                <Sparkles className="h-4 w-4" />
                Stories of freedom, hope, and praise
              </div>

              <h1 className="font-display text-4xl font-black leading-[1.04] tracking-tight text-[#062a57] sm:text-5xl md:text-6xl lg:text-7xl">
                See what God is doing in lives around the world.
              </h1>

              <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:mt-6 sm:text-lg sm:leading-8">
                A faith-centered space for testimonies, praise reports, prayer
                encouragement, and stories of freedom through God, Jesus, and
                the Holy Spirit.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/share-your-story" className={btnPrimaryLg}>
                  Share Your Story <Send className="h-4 w-4" />
                </Link>

                <Link href="/login" className={btnSecondary}>
                  Explore Testimonies <Search className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="relative mx-auto aspect-[4/5] max-h-[440px] w-full overflow-hidden rounded-[2.5rem] shadow-2xl shadow-blue-950/10 sm:max-h-[480px] md:absolute md:right-0 md:top-2 md:aspect-auto md:h-[440px] md:max-h-none md:w-[560px]">
                <img
                  src="/images/hero-freedom.png"
                  alt="A person walking in freedom"
                  className="h-full w-full object-cover object-center"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#082f63]/28 via-transparent to-white/10" />
              </div>

              <div
                className={`${glassCardClass} mt-4 md:absolute md:left-0 md:top-12 md:mt-0 md:w-[330px]`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
                    <Play className="h-5 w-5 fill-[#0b63ce]" />
                  </div>

                  <div>
                    <div className="text-sm font-heading font-black text-slate-900">
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

                <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                  <span className="rounded-full bg-slate-100 px-3 py-1 transition-colors duration-200">
                    Amen
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 transition-colors duration-200">
                    Praying
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 transition-colors duration-200">
                    Encouraged
                  </span>
                </div>
              </div>

              <div
                className={`${glassCardClass} mt-4 md:absolute md:bottom-2 md:left-10 md:mt-0 md:w-[300px]`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-heading font-black text-slate-900">
                    From Around the World
                  </div>
                  <Globe2 className="h-4 w-4 text-[#0b63ce]" />
                </div>

                <div className="space-y-2 text-sm text-slate-600">
                  <div className="flex justify-between rounded-2xl bg-slate-50/90 px-3 py-2">
                    <span>USA</span>
                    <span>Praise Report</span>
                  </div>
                  <div className="flex justify-between rounded-2xl bg-slate-50/90 px-3 py-2">
                    <span>Nigeria</span>
                    <span>Testimony</span>
                  </div>
                  <div className="flex justify-between rounded-2xl bg-slate-50/90 px-3 py-2">
                    <span>Philippines</span>
                    <span>Prayer</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="stories" className={sectionClass}>
          <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="text-sm font-heading font-bold uppercase tracking-[0.22em] text-[#0b63ce]">
                Freedom Feed
              </div>
              <h2 className="mt-2 font-heading text-3xl font-black tracking-tight text-[#062a57] md:text-4xl">
                Stories being shared now
              </h2>
            </div>

            <Link
              href="/login"
              className="w-fit rounded-full border border-slate-200/90 bg-white px-5 py-2.5 text-sm font-heading font-bold text-[#082f63] shadow-sm transition-all duration-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              View More Stories
            </Link>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {stories.map((story) => (
              <article key={story.title} className={`${cardClass} p-5`}>
                <div className="mb-5 flex items-center justify-between">
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-heading font-black text-[#0b63ce]">
                    {story.type}
                  </span>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-heading font-black text-amber-700">
                    {story.tag}
                  </span>
                </div>

                <div className="mb-4 h-44 rounded-[1.5rem] bg-gradient-to-br from-[#eaf5ff] via-white to-[#fff0cf] p-4 ring-1 ring-slate-100">
                  <div className="flex h-full items-center justify-center rounded-[1.2rem] border border-white bg-white/55">
                    <Play className="h-10 w-10 fill-[#0b63ce] text-[#0b63ce]" />
                  </div>
                </div>

                <h3 className="font-heading text-xl font-black leading-tight text-slate-900">
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

        <section id="praise" className={sectionClass}>
          <div className="rounded-[2.5rem] bg-[#082f63] p-8 text-white shadow-2xl shadow-blue-950/10 md:p-12">
            <div className="grid gap-10 md:grid-cols-[0.85fr_1.15fr] md:items-center">
              <div>
                <div className="mb-4 inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-heading font-bold text-blue-100">
                  Praise Reports
                </div>

                <h2 className="font-heading text-3xl font-black tracking-tight sm:text-4xl">
                  Small reminders. Real hope.
                </h2>

                <p className="mt-5 text-base leading-7 text-blue-100 sm:text-lg sm:leading-8">
                  Short posts that help people see encouragement throughout the
                  day — answered prayer, renewed peace, a door opening, a heart
                  restored.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  [
                    "Answered Prayer",
                    "God made a way when I could not see one.",
                  ],
                  ["Healing", "Thankful for renewed strength and peace today."],
                  [
                    "Restoration",
                    "God is restoring something I thought was lost.",
                  ],
                  ["Peace", "I woke up today with a calm heart."],
                ].map(([title, body]) => (
                  <div
                    key={title}
                    className="rounded-3xl bg-white/10 p-5 ring-1 ring-white/10 backdrop-blur-sm transition-all duration-300 hover:bg-white/[0.14]"
                  >
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[#0b63ce]">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="font-heading font-black">{title}</div>
                    <p className="mt-2 text-sm leading-6 text-blue-100">
                      {body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={sectionClass}>
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

        <section className={sectionClass}>
          <div className="rounded-[2.5rem] border border-slate-200/80 bg-white p-8 shadow-sm md:p-12">
            <div className="mb-7 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-heading font-bold uppercase tracking-[0.22em] text-[#0b63ce]">
                  Browse
                </div>
                <h2 className="mt-2 font-heading text-3xl font-black tracking-tight text-[#062a57]">
                  Find encouragement by category
                </h2>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className="rounded-full border border-slate-200/90 bg-slate-50 px-5 py-3 text-sm font-heading font-bold text-slate-700 transition-all duration-200 hover:border-blue-200 hover:bg-blue-50 hover:text-[#0b63ce] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b63ce]/30 focus-visible:ring-offset-2 active:scale-[0.98]"
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section id="about" className={`${sectionClass} pb-16 md:pb-20`}>
          <div className="grid gap-8 rounded-[2.5rem] bg-gradient-to-br from-[#fff7e6] to-[#eaf5ff] p-8 md:grid-cols-[1fr_0.85fr] md:p-12">
            <div>
              <h2 className="font-heading text-3xl font-black tracking-tight text-[#062a57] sm:text-4xl">
                Your story may be the encouragement someone else needs today.
              </h2>

              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                Whether your story is big or small, recent or years in the
                making, it matters. Enter HTBF to read stories from others,
                share what God has done, and be part of a community centered on
                freedom, hope, prayer, and encouragement.
              </p>

              <Link
                href="/login"
                className={`${btnPrimary} mt-8 px-6 py-3.5 text-base`}
              >
                Enter HTBF
              </Link>
            </div>

            <div className="rounded-[2rem] bg-white/75 p-6 shadow-sm ring-1 ring-white backdrop-blur-sm">
              <div className="mb-4 flex items-center gap-3">
                <LogoMark />

                <div>
                  <div className="font-heading font-black text-[#062a57]">
                    HTBF
                  </div>
                  <div className="-mt-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    HYPER TO BE FREE
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
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-heading text-lg font-black text-[#082f63]">
                HTBF
              </div>

              <p className="mt-1 text-sm font-medium leading-6 text-slate-600">
                Hyper to Be Free — Stories of freedom, hope, prayer, and
                encouragement.
              </p>

              <p className="mt-2 text-sm font-bold text-slate-600">
                Contact:{" "}
                <a
                  href="mailto:info@hypertobefree.com"
                  className="text-[#0b63ce] underline-offset-2 hover:underline"
                >
                  info@hypertobefree.com
                </a>
              </p>
            </div>

            <div className="flex flex-wrap gap-4 text-sm font-heading font-bold text-slate-600">
              <Link href="/privacy" className="transition-colors hover:text-[#0b63ce]">
                Privacy Policy
              </Link>

              <Link href="/terms" className="transition-colors hover:text-[#0b63ce]">
                Terms of Service
              </Link>

              <Link
                href="/content-rules"
                className="transition-colors hover:text-[#0b63ce]"
              >
                Content Rules
              </Link>

              <Link
                href="/copyright"
                className="transition-colors hover:text-[#0b63ce]"
              >
                Copyright Removal
              </Link>
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
    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/90">
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
    <div className={`${cardClass} p-7`}>
      {icon}
      <h3 className="font-heading text-2xl font-black text-[#062a57]">{title}</h3>
      <p className="mt-3 leading-7 text-slate-600">{text}</p>
    </div>
  );
}
