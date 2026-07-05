"use client";

import { useEffect, useMemo, useState } from "react";
import {
  HTBF_LOADING_MESSAGES,
  pickRandomLoadingScene,
  type HTBFLoadingScene,
} from "../lib/htbfLoadingScenes";

type HTBFCinematicLoaderProps = {
  visible?: boolean;
  messages?: readonly string[];
  onFadeOutComplete?: () => void;
  className?: string;
};

type Particle = {
  id: number;
  left: string;
  top: string;
  size: number;
  delay: string;
  duration: string;
  opacity: number;
};

function buildParticles(seed: string, count = 28): Particle[] {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }

  function nextRandom() {
    hash = (hash * 1664525 + 1013904223) | 0;
    return (hash >>> 0) / 4294967296;
  }

  return Array.from({ length: count }, (_, index) => ({
    id: index,
    left: `${8 + nextRandom() * 84}%`,
    top: `${55 + nextRandom() * 40}%`,
    size: 2 + nextRandom() * 4,
    delay: `${nextRandom() * 6}s`,
    duration: `${7 + nextRandom() * 8}s`,
    opacity: 0.25 + nextRandom() * 0.55,
  }));
}

export default function HTBFCinematicLoader({
  visible = true,
  messages = HTBF_LOADING_MESSAGES,
  onFadeOutComplete,
  className = "",
}: HTBFCinematicLoaderProps) {
  const [scene, setScene] = useState<HTBFLoadingScene | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);
  const [messageVisible, setMessageVisible] = useState(true);
  const [phase, setPhase] = useState<"enter" | "idle" | "exit">("enter");

  const particles = useMemo(
    () => buildParticles(scene?.id ?? "htbf-default"),
    [scene?.id]
  );

  useEffect(() => {
    setScene(pickRandomLoadingScene());
  }, []);

  useEffect(() => {
    if (visible) {
      setPhase("enter");
      return;
    }

    setPhase("exit");
    const timer = window.setTimeout(() => {
      onFadeOutComplete?.();
    }, 650);

    return () => window.clearTimeout(timer);
  }, [visible, onFadeOutComplete]);

  useEffect(() => {
    if (phase !== "enter") return;

    const timer = window.setTimeout(() => setPhase("idle"), 700);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessageVisible(false);
      window.setTimeout(() => {
        setMessageIndex((current) => (current + 1) % messages.length);
        setMessageVisible(true);
      }, 220);
    }, 3600);

    return () => window.clearInterval(timer);
  }, [messages.length]);

  if (!scene) {
    return null;
  }

  const activeMessage = messages[messageIndex] ?? messages[0];

  return (
    <div
      className={`fixed inset-0 z-[9998] flex min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#fffdf8] ${
        phase === "enter"
          ? "htbf-loader-enter"
          : phase === "exit"
            ? "htbf-loader-exit"
            : "opacity-100"
      } ${className}`}
      role="status"
      aria-live="polite"
      aria-label={activeMessage}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div
          className={`absolute inset-0 htbf-cinematic-zoom ${
            imageReady && !useFallback ? "opacity-100" : "opacity-0"
          }`}
          style={{
            backgroundImage: useFallback ? undefined : `url(${scene.src})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />

        <div
          className={`absolute inset-0 htbf-cinematic-zoom transition-opacity duration-700 ${
            useFallback || !imageReady ? "opacity-100" : "opacity-0"
          }`}
          style={{ background: scene.fallbackGradient }}
        />

        {!useFallback && (
          <img
            src={scene.src}
            alt=""
            className="hidden"
            onLoad={() => setImageReady(true)}
            onError={() => {
              setUseFallback(true);
              setImageReady(true);
            }}
          />
        )}

        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,253,248,0.18)_0%,rgba(15,23,42,0.42)_48%,rgba(255,253,248,0.72)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.22),transparent_34%)]" />
      </div>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {particles.map((particle) => (
          <span
            key={particle.id}
            className="htbf-particle absolute rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.65)]"
            style={{
              left: particle.left,
              top: particle.top,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              opacity: particle.opacity,
              animationDelay: particle.delay,
              animationDuration: particle.duration,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center px-6 text-center">
        <div className="relative flex h-36 w-36 items-center justify-center sm:h-40 sm:w-40">
          <span className="htbf-pulse-ring absolute inset-0 rounded-full border border-[#d4af37]/35" />
          <span className="htbf-pulse-ring-delayed absolute inset-2 rounded-full border border-[#0b63ce]/25" />
          <span className="absolute inset-4 rounded-full bg-white/20 blur-xl" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-white/85 shadow-[0_20px_60px_rgba(11,99,206,0.18)] ring-1 ring-white/80 backdrop-blur-sm sm:h-28 sm:w-28">
            <img
              src="/images/htbf-logo.png"
              alt="Hyper to Be Free"
              className="h-auto w-[72%] object-contain"
            />
          </div>
        </div>

        <p className="mt-8 text-[11px] font-black uppercase tracking-[0.28em] text-white/85 drop-shadow-sm">
          Hyper to Be Free
        </p>

        <p
          className={`mt-4 min-h-[4.5rem] max-w-[18rem] text-xl font-semibold leading-8 text-white drop-shadow-md transition-opacity duration-300 sm:text-2xl sm:leading-9 ${
            messageVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          {activeMessage}
        </p>

        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-[#f8fafc]/70">
          Cinematic loading
        </p>
      </div>
    </div>
  );
}
