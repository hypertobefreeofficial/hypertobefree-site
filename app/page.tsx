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
      <main className="min-h-screen bg-[#f8fbff] px-6 py-10 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          Loading HTBF...
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
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <LogoMark />

            <div>
              <div className="text-xl font-black tracking-tight text-[#082f63]">
                HTBF
              </div>
              <div className="-mt-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                HYPER TO BE FREE
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
            <Link
              href="/login"
              className="hidden rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 sm:block"
            >
              Sign In
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

                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3.5 text-base font-bold text-[#082f63] shadow-sm hover:bg-slate-50"
                >
                  Explore Testimonies <Search className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="relative min-h-[470px]">
              <div className="absolute right-0 top-2 h-[440px] w-full overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-sky-200 via-amber-100 to-orange-200 shadow-2xl shadow-blue-950/10 md:w-[560px]">
                <img
                  src="/images/hero-freedom.png"
                  alt="A person walking in freedom"
                  className="absolute inset-0 h-full w-full rounded-[2.5rem] object-cover object-center"
                />
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

            <Link
              href="/login"
              className="w-fit rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-[#082f63] shadow-sm hover:bg-slate-50"
            >
              View More Stories
            </Link>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {stories.map((story) => (
              <article
                key={story.title}
                className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="mb-5 flex items-center justify-between">
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[#0b63ce]">
                    {story.type}
                  </span>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                    {story.tag}
                  </span>
                </div>

                <h3 className="text-xl font-black leading-tight text-slate-900">
                  {story.title}
                </h3>

                <div className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-500">
                  <Globe2 className="h-4 w-4" /> {story.location}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="about" className="mx-auto max-w-7xl px-6 pb-20 pt-10">
          <div className="rounded-[2.5rem] bg-gradient-to-br from-[#fff7e6] to-[#eaf5ff] p-8 md:p-12">
            <h2 className="text-4xl font-black tracking-tight text-[#062a57]">
              Your story may be the encouragement someone else needs today.
            </h2>

            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Enter HTBF to read stories, share what God has done, and be part
              of a community centered on freedom, hope, prayer, and
              encouragement.
            </p>

            <Link
              href="/login"
              className="mt-8 inline-flex rounded-full bg-[#0b63ce] px-6 py-3.5 text-base font-bold text-white shadow-sm hover:bg-[#084f9f]"
            >
              Enter HTBF
            </Link>
          </div>
        </section>
      </main>
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
