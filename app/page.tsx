"use client";

import { useEffect, useState } from "react";
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
  ArrowRight,
  Check,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { cn } from "../lib/cn";
import Hero3DScene from "../components/hero3d/Hero3DScene";
import { Reveal } from "../components/marketing/Reveal";

const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-5 py-2.5 text-sm font-heading font-bold text-white shadow-sm transition-all duration-200 hover:bg-[#084f9f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b63ce]/35 focus-visible:ring-offset-2 active:scale-[0.98]";
const btnPrimaryLg =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[#082f63] px-6 py-3.5 text-base font-heading font-bold text-white shadow-lg shadow-blue-950/10 transition-all duration-200 hover:bg-[#0b3f80] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#082f63]/35 focus-visible:ring-offset-2 active:scale-[0.98]";
const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-full border border-slate-200/90 bg-white px-6 py-3.5 text-base font-heading font-bold text-[#082f63] shadow-sm transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 active:scale-[0.98]";

const STARS = [
  { top: "14%", left: "8%", size: "6px", delay: "0s", duration: "5s" },
  { top: "22%", left: "24%", size: "4px", delay: "1.4s", duration: "6s" },
  { top: "10%", left: "44%", size: "5px", delay: "0.6s", duration: "4.5s" },
  { top: "30%", left: "62%", size: "3px", delay: "2s", duration: "5.5s" },
  { top: "16%", left: "82%", size: "6px", delay: "0.9s", duration: "6.5s" },
  { top: "44%", left: "14%", size: "4px", delay: "1.8s", duration: "5s" },
  { top: "52%", left: "36%", size: "3px", delay: "0.3s", duration: "4.8s" },
  { top: "60%", left: "72%", size: "5px", delay: "2.4s", duration: "6s" },
  { top: "70%", left: "20%", size: "4px", delay: "1.1s", duration: "5.6s" },
  { top: "78%", left: "52%", size: "6px", delay: "0.5s", duration: "6.2s" },
  { top: "84%", left: "88%", size: "3px", delay: "1.6s", duration: "5.2s" },
  { top: "38%", left: "92%", size: "4px", delay: "2.2s", duration: "6.4s" },
  { top: "66%", left: "6%", size: "3px", delay: "0.8s", duration: "4.6s" },
  { top: "88%", left: "34%", size: "4px", delay: "1.3s", duration: "5.8s" },
];

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

  const IMG = "/images/backgrounds/public-pack-v1";
  const TIMG = "/images/testimonies";

  const testimonies = [
    {
      title: "The night I finally shared my story out loud.",
      category: "Freedom",
      image: `${TIMG}/testimony-stage.jpg`,
      creator: "Maya Bennett",
      location: "Phoenix, USA",
      duration: "8:42",
    },
    {
      title: "Baptized at sunrise — a brand new life.",
      category: "New Life",
      image: `${TIMG}/testimony-baptism.jpg`,
      creator: "Daniel Rivera",
      location: "Austin, USA",
      duration: "5:17",
    },
    {
      title: "Our family learned to pray together again.",
      category: "Restoration",
      image: `${TIMG}/testimony-family-prayer.jpg`,
      creator: "The Okafor Family",
      location: "Lagos, Nigeria",
      duration: "6:03",
    },
    {
      title: "At 74, God answered a prayer I held for decades.",
      category: "Answered Prayer",
      image: `${TIMG}/testimony-praying.jpg`,
      creator: "Ruth Alvarez",
      location: "Manila, Philippines",
      duration: "4:28",
    },
    {
      title: "I climbed the mountain just to say thank You.",
      category: "Praise",
      image: `${TIMG}/testimony-worship.jpg`,
      creator: "Jonah Kim",
      location: "Seoul, South Korea",
      duration: "3:51",
    },
    {
      title: "One year free — this is my recovery story.",
      category: "Healing",
      image: `${TIMG}/testimony-recovery.jpg`,
      creator: "Grace Miller",
      location: "Denver, USA",
      duration: "7:12",
    },
  ];

  const featured = testimonies[0];
  const sideVideos = testimonies.slice(1, 3);
  const gridVideos = testimonies.slice(3);

  const pillars = [
    {
      icon: <Sparkles className="h-6 w-6" />,
      title: "Testimony",
      text: "Your story of freedom could be the very light that helps someone hold on today.",
    },
    {
      icon: <MessageCircleHeart className="h-6 w-6" />,
      title: "Prayer",
      text: "Bring what weighs on your heart, and let real people stand with you in it.",
    },
    {
      icon: <HeartHandshake className="h-6 w-6" />,
      title: "Encouragement",
      text: "A gentle, protected space centered on hope, faith, and God's faithfulness.",
    },
  ];

  const trustPoints = [
    "Free to join",
    "Share your story",
    "Ask for prayer",
    "Privacy controls",
    "Community guidelines",
    "Built around hope",
    "Moderated community",
  ];

  const categories = [
    "Freedom",
    "Healing",
    "Answered Prayer",
    "Restoration",
    "Peace",
    "Encouragement",
  ];

  const features = [
    {
      icon: <HeartHandshake className="h-6 w-6" />,
      title: "Encouraging responses",
      text: "Simple, kind response options keep the focus on prayer, praise, and encouragement.",
    },
    {
      icon: <MessageCircleHeart className="h-6 w-6" />,
      title: "Prayer support",
      text: "A quiet place to share what's on your heart and receive prayer from real people.",
    },
    {
      icon: <ShieldCheck className="h-6 w-6" />,
      title: "A protected space",
      text: "Thoughtful reporting and review tools keep the community focused and safe.",
    },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8fbff] text-slate-900">
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

            <Hero3DScene
              className="relative mx-auto w-full max-w-[560px] md:max-w-none"
              showFloatingCards
              showTiltPrompt
              ariaLabel="A person walking in freedom at sunrise"
            />
          </div>
        </section>

        <section id="stories" className="mx-auto max-w-7xl px-4 sm:px-6 pt-20 md:pt-28 pb-16 md:pb-24">
          <Reveal>
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div className="max-w-2xl">
                <span className="htbf-eyebrow text-[#0b63ce]">The Freedom Feed</span>
                <h2 className="mt-4 font-display text-4xl font-black leading-[1.05] tracking-tight text-[#062a57] md:text-5xl">
                  Testimonies of freedom,
                  <br className="hidden sm:block" />
                  hope, and God's faithfulness.
                </h2>
              </div>

              <Link
                href="/login"
                className="group inline-flex w-fit items-center gap-2 text-sm font-heading font-bold text-[#0b63ce] transition-colors hover:text-[#082f63]"
              >
                Step inside HTBF
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
          </Reveal>

          <div className="mt-10 grid items-stretch gap-5 lg:grid-cols-12">
            <Reveal className="lg:col-span-7">
              <VideoCard v={featured} featured />
            </Reveal>

            <div className="flex flex-col gap-5 lg:col-span-5">
              {sideVideos.map((v, i) => (
                <Reveal key={v.title} delay={90 + i * 90} className="flex-1">
                  <VideoCard v={v} />
                </Reveal>
              ))}
            </div>
          </div>

          <Reveal delay={120}>
            <div className="mt-9 mb-5 flex items-center gap-3">
              <span className="text-sm font-heading font-bold uppercase tracking-[0.2em] text-slate-500">
                A glimpse of the feed
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent" />
            </div>
          </Reveal>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {gridVideos.map((v, i) => (
              <Reveal key={v.title} delay={i * 90}>
                <VideoCard v={v} />
              </Reveal>
            ))}
          </div>
        </section>

        <section id="praise" className="htbf-fullbleed htbf-praise-band py-24 md:py-32">
          <span className="htbf-band-seam-top" aria-hidden />
          <span className="htbf-band-seam-bottom" aria-hidden />

          <div className="htbf-constellation" aria-hidden>
            {STARS.map((s, i) => (
              <span
                key={i}
                className="htbf-star"
                style={{
                  top: s.top,
                  left: s.left,
                  height: s.size,
                  width: s.size,
                  animationDelay: s.delay,
                  animationDuration: s.duration,
                }}
              />
            ))}
          </div>

          <div className="relative z-[2] mx-auto max-w-5xl px-4 sm:px-6">
            <Reveal>
              <div className="mx-auto max-w-3xl text-center">
                <span className="htbf-eyebrow justify-center text-amber-200">
                  Praise & faithfulness
                </span>
                <h2 className="mt-5 font-display text-4xl font-black leading-[1.06] tracking-tight text-white sm:text-5xl md:text-6xl">
                  Every testimony is proof
                  <br className="hidden sm:block" />
                  that God is still at work.
                </h2>
                <div className="mx-auto mt-6 flex justify-center">
                  <span className="htbf-accent-gold" />
                </div>
                <p className="mx-auto mt-8 max-w-2xl font-quote text-2xl italic leading-relaxed text-blue-50/90 sm:text-[1.75rem]">
                  &ldquo;Weeping may endure for a night, but joy comes in the
                  morning.&rdquo;
                </p>
                <p className="mt-3 text-xs font-heading font-bold uppercase tracking-[0.28em] text-amber-200/70">
                  Psalm 30:5
                </p>
              </div>
            </Reveal>

            <div className="mt-14 grid gap-5 md:mt-16 md:grid-cols-3">
              {pillars.map((p, i) => (
                <Reveal key={p.title} delay={i * 100}>
                  <div className="htbf-stat-card h-full p-7 text-center md:text-left">
                    <span className="htbf-pillar-icon mx-auto md:mx-0">
                      {p.icon}
                    </span>
                    <h3 className="mt-5 font-heading text-xl font-black tracking-tight text-white">
                      {p.title}
                    </h3>
                    <p className="mt-2.5 text-[15px] leading-7 text-blue-100/75">
                      {p.text}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="discover" className="mx-auto max-w-7xl px-4 sm:px-6 py-20 md:py-28">
          <Reveal>
            <div className="max-w-2xl">
              <span className="htbf-eyebrow text-[#0b63ce]">Discover</span>
              <h2 className="mt-4 font-display text-4xl font-black leading-[1.05] tracking-tight text-[#062a57] md:text-5xl">
                A place built to lift you up.
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-600">
                Explore what God is doing, find prayer, and know that whatever
                you carry, you're not carrying it alone.
              </p>
            </div>
          </Reveal>

          <div className="mt-10 grid gap-5 lg:grid-cols-12">
            {/* Browse-by-theme — large photographic tile */}
            <Reveal className="lg:col-span-8">
              <div className="htbf-media-card group flex h-full min-h-[22rem] flex-col md:min-h-[26rem]">
                <img
                  src={`${IMG}/06-long-road.PNG`}
                  alt=""
                  className="htbf-media-card__img"
                  loading="lazy"
                  decoding="async"
                />
                <div className="htbf-media-card__scrim" />
                <div className="htbf-media-card__body mt-auto p-7 md:p-9">
                  <span className="htbf-eyebrow text-amber-200">Browse by theme</span>
                  <h3 className="mt-3 max-w-md font-display text-2xl font-black leading-tight text-white sm:text-3xl">
                    Find encouragement for exactly where you are.
                  </h3>
                  <div className="mt-6 flex flex-wrap gap-2.5">
                    {categories.map((cat) => (
                      <Link
                        key={cat}
                        href="/login"
                        className="htbf-cat-pill px-4 py-2 text-sm font-heading font-bold"
                      >
                        {cat}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>

            {/* First value tile */}
            <Reveal className="lg:col-span-4" delay={90}>
              <div className="htbf-feature-tile group flex h-full min-h-[15rem] flex-col justify-center p-8">
                <span className="htbf-icon-xl mb-5 h-16 w-16">
                  {features[0].icon}
                </span>
                <h3 className="font-heading text-xl font-black tracking-tight text-[#062a57]">
                  {features[0].title}
                </h3>
                <p className="mt-2.5 text-[15px] leading-7 text-slate-600">
                  {features[0].text}
                </p>
              </div>
            </Reveal>

            {/* Remaining value tiles */}
            {features.slice(1).map((f, i) => (
              <Reveal key={f.title} className="lg:col-span-6" delay={120 + i * 90}>
                <div className="htbf-feature-tile group flex h-full min-h-[14rem] flex-col justify-center p-8">
                  <span className="htbf-icon-xl mb-5 h-16 w-16">{f.icon}</span>
                  <h3 className="font-heading text-xl font-black tracking-tight text-[#062a57]">
                    {f.title}
                  </h3>
                  <p className="mt-2.5 max-w-md text-[15px] leading-7 text-slate-600">
                    {f.text}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="htbf-fullbleed htbf-eagle-scene relative flex min-h-[40rem] items-center md:min-h-[46rem]">
          <img
            src={`${IMG}/08-eagle-soar.PNG`}
            alt=""
            className="htbf-eagle-scene__img"
            loading="lazy"
            decoding="async"
          />
          <div className="htbf-eagle-scene__grade" aria-hidden />
          <div className="htbf-eagle-scene__vignette" aria-hidden />

          <div className="relative z-[2] mx-auto w-full max-w-6xl px-4 sm:px-6">
            <Reveal>
              <div className="htbf-cta-glass max-w-xl p-8 sm:p-10 md:p-12">
                <span className="htbf-eyebrow text-amber-200">On eagles' wings</span>
                <h2 className="mt-5 font-display text-4xl font-black leading-[1.04] tracking-tight text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.4)] sm:text-5xl md:text-6xl">
                  You were made to rise.
                </h2>
                <p className="mt-6 text-lg leading-8 text-blue-50/90">
                  &ldquo;Those who hope in the Lord will renew their strength.
                  They will soar on wings like eagles.&rdquo; Here, freedom is
                  not a slogan — it&apos;s a story God is still writing, one
                  testimony at a time.
                </p>
                <p className="mt-3 text-xs font-heading font-bold uppercase tracking-[0.28em] text-amber-200/80">
                  Isaiah 40:31
                </p>

                <div className="mt-8">
                  <Link
                    href="/login"
                    className="htbf-btn-warm px-7 py-3.5 text-base font-heading font-bold"
                  >
                    Read stories of freedom
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section
          id="about"
          className="htbf-fullbleed htbf-cta-scene flex min-h-[42rem] items-center md:min-h-[46rem]"
        >
          <img
            src={`${IMG}/12-sunraise-clouds.PNG`}
            alt=""
            className="htbf-cta-scene__img"
            loading="lazy"
            decoding="async"
          />
          <div className="htbf-cta-scene__grade" />

          <div className="htbf-cta-scene__body mx-auto w-full max-w-4xl px-4 py-24 text-center sm:px-6">
            <Reveal>
              <span className="htbf-eyebrow justify-center text-amber-200">
                <Sparkles className="h-4 w-4" /> Your invitation
              </span>

              <h2 className="mx-auto mt-6 max-w-3xl font-display text-4xl font-black leading-[1.05] tracking-tight text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.35)] sm:text-6xl md:text-7xl">
                Your story may be the reason someone holds on today.
              </h2>

              <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-blue-50/90 sm:text-xl">
                Big or small, recent or years in the making — it matters. Step
                inside HTBF to read what God is doing, share your own, and belong
                to a community built on freedom, hope, and prayer.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/login"
                  className="htbf-btn-warm px-8 py-4 text-base font-heading font-bold"
                >
                  Enter HTBF <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  href="/share-your-story"
                  className="htbf-btn-ghost px-8 py-4 text-base font-heading font-bold"
                >
                  Share Your Story <Send className="h-4 w-4" />
                </Link>
              </div>

              <div className="htbf-cta-glass mx-auto mt-12 max-w-3xl p-6 sm:p-7">
                <p className="text-[11px] font-heading font-bold uppercase tracking-[0.24em] text-amber-100/80">
                  What you can count on
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                  {trustPoints.map((point) => (
                    <span
                      key={point}
                      className="htbf-trust-chip text-sm font-heading font-bold"
                    >
                      <Check className="h-4 w-4" aria-hidden />
                      {point}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
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

type Testimony = {
  title: string;
  category: string;
  image: string;
  creator: string;
  location: string;
  duration: string;
};

function VideoCard({
  v,
  featured = false,
}: {
  v: Testimony;
  featured?: boolean;
}) {
  const initials = v.creator
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Link
      href="/login"
      aria-label={`Watch: ${v.title}`}
      className={cn(
        "htbf-video-card group block h-full",
        featured ? "min-h-[26rem] md:min-h-[34rem]" : "min-h-[16rem]"
      )}
    >
      <img
        src={v.image}
        alt=""
        className="htbf-video-card__img"
        loading="lazy"
        decoding="async"
      />
      <div className="htbf-video-card__scrim" />
      <div className="htbf-video-card__glow" />

      {/* top row: category + duration */}
      <div className="absolute inset-x-0 top-0 z-[3] flex items-start justify-between p-4 md:p-5">
        <span className="htbf-chip-glass px-3 py-1.5 text-[11px] font-heading font-black uppercase tracking-wide">
          {v.category}
        </span>
        <span className="htbf-badge-dark px-2.5 py-1 text-[11px] font-heading font-bold">
          <Play className="h-3 w-3 fill-white" /> {v.duration}
        </span>
      </div>

      {/* play control */}
      <div
        className={cn(
          "absolute inset-0 z-[2] flex items-center justify-center",
          featured ? "" : "pb-24"
        )}
      >
        <span
          className={cn(
            "relative flex items-center justify-center",
            featured ? "h-20 w-20" : "h-14 w-14"
          )}
        >
          <span className="htbf-play-ring" aria-hidden />
          <span
            className={cn("htbf-play-lg", featured ? "h-20 w-20" : "h-14 w-14")}
          >
            <Play
              className={cn(
                "fill-[#0b63ce] text-[#0b63ce]",
                featured ? "ml-1 h-7 w-7" : "ml-0.5 h-5 w-5"
              )}
            />
          </span>
        </span>
      </div>

      {/* meta */}
      <div className="absolute inset-x-0 bottom-0 z-[3] p-5 md:p-7">
        <h3
          className={cn(
            "font-display font-black leading-tight text-white",
            featured
              ? "max-w-xl text-2xl sm:text-3xl md:text-[2.15rem]"
              : "text-lg md:text-xl"
          )}
        >
          {v.title}
        </h3>

        <div className="mt-4 flex items-center gap-3">
          <span
            className={cn(
              "htbf-creator",
              featured ? "h-11 w-11 text-sm" : "h-9 w-9 text-xs"
            )}
          >
            {initials}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-heading font-bold text-white">
              {v.creator}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-blue-100/70">
              <Globe2 className="h-3.5 w-3.5" /> {v.location}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

