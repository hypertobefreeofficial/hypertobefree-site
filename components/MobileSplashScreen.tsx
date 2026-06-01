"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

export default function MobileSplashScreen() {
  const [showSplash, setShowSplash] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const isMobileScreen = window.matchMedia("(max-width: 768px)").matches;

    if (!isMobileScreen) return;

    const alreadyShown = sessionStorage.getItem("htbf-mobile-splash-shown");

    if (alreadyShown) return;

    setShowSplash(true);
    sessionStorage.setItem("htbf-mobile-splash-shown", "true");

    const fadeTimer = window.setTimeout(() => {
      setFadeOut(true);
    }, 1200);

    const removeTimer = window.setTimeout(() => {
      setShowSplash(false);
    }, 1750);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (!showSplash) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#082f63] transition-opacity duration-500 ${
        fadeOut ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,196,87,0.45),transparent_30%),linear-gradient(135deg,#082f63_0%,#0b63ce_50%,#69b7ff_100%)]" />

      <div className="absolute bottom-0 left-0 right-0 h-44 bg-gradient-to-t from-[#061a31]/50 to-transparent" />

      <div className="relative flex flex-col items-center px-6 text-center text-white">
        <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-white/15 shadow-2xl ring-1 ring-white/25 backdrop-blur-md">
          <DoveMark />
        </div>

        <div className="text-5xl font-black tracking-tight">HTBF</div>

        <div className="mt-1 text-xs font-black uppercase tracking-[0.32em] text-blue-100">
          Hyper to Be Free
        </div>

        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-black text-blue-50 ring-1 ring-white/20 backdrop-blur">
          <Sparkles className="h-4 w-4" />
          Stories of freedom and hope
        </div>
      </div>
    </div>
  );
}

function DoveMark() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="h-12 w-12 text-white"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M10 36c12 0 18-7 24-19 2 9 8 16 20 19-11 2-19 7-25 16-3-7-9-13-19-16Z"
        fill="currentColor"
      />
      <path
        d="M33 17c4 4 8 7 14 9-7 0-13-2-19-6 2-1 3-2 5-3Z"
        fill="#69b7ff"
        opacity=".95"
      />
    </svg>
  );
}
