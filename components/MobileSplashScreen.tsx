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
    }, 1300);

    const removeTimer = window.setTimeout(() => {
      setShowSplash(false);
    }, 1850);

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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_24%,rgba(255,196,87,0.38),transparent_28%),linear-gradient(135deg,#061a31_0%,#082f63_34%,#0b63ce_66%,#69b7ff_100%)]" />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.20),transparent_26%)]" />

      <div className="absolute bottom-0 left-0 right-0 h-52 bg-gradient-to-t from-[#061a31]/55 to-transparent" />

      <div className="relative flex flex-col items-center px-6 text-center text-white">
        <div className="mb-6 flex w-[86vw] max-w-[390px] items-center justify-center rounded-[2rem] bg-white px-5 py-7 shadow-2xl ring-1 ring-white/40">
          <img
            src="/htbf-logo.png"
            alt="HTBF logo"
            className="h-auto w-full object-contain"
          />
        </div>

        <div className="text-xs font-black uppercase tracking-[0.34em] text-blue-100">
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
