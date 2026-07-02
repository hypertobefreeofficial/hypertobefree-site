"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

type CreatorStudioGenerationProps = {
  message?: string;
};

const creativeSteps = [
  "Reading your story",
  "Finding the turning point",
  "Choosing Scripture",
  "Exploring visual styles",
  "Building six concepts",
  "Refining typography",
] as const;

const STEP_MS = 2600;
const PREVIEW_PHASE_MS = 2200;

export default function CreatorStudioGeneration({
  message,
}: CreatorStudioGenerationProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [previewPhase, setPreviewPhase] = useState(0);
  const [statusVisible, setStatusVisible] = useState(true);

  useEffect(() => {
    const stepTimer = window.setInterval(() => {
      setActiveStep((current) => (current + 1) % creativeSteps.length);
    }, STEP_MS);

    return () => window.clearInterval(stepTimer);
  }, []);

  useEffect(() => {
    const previewTimer = window.setInterval(() => {
      setPreviewPhase((current) => Math.min(current + 1, 5));
    }, PREVIEW_PHASE_MS);

    return () => window.clearInterval(previewTimer);
  }, []);

  useEffect(() => {
    setStatusVisible(false);
    const timer = window.setTimeout(() => setStatusVisible(true), 160);

    return () => window.clearTimeout(timer);
  }, [activeStep]);

  const statusText = creativeSteps[activeStep];

  return (
    <section className="relative isolate overflow-hidden rounded-[2rem] bg-[linear-gradient(165deg,#fffdf8_0%,#f8fbff_42%,#f3f0ff_100%)] px-4 py-6 shadow-2xl shadow-indigo-200/40 ring-1 ring-white/80 sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute -left-16 top-8 h-56 w-56 rounded-full bg-[#0b63ce]/12 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 top-1/3 h-48 w-48 rounded-full bg-violet-400/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-32 w-72 rounded-full bg-[#d4af37]/12 blur-3xl" />

      <div className="relative z-10 mx-auto grid min-w-0 max-w-4xl gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-8">
        <div className="flex flex-col items-center lg:items-start">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#0b63ce] shadow-sm ring-1 ring-blue-100/80 backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5 text-[#d4af37]" />
            AI Studio
          </div>

          <h3 className="mt-4 text-center text-2xl font-black tracking-tight text-[#062a57] sm:text-3xl lg:text-left">
            Shaping your story
          </h3>
          <p className="mt-2 max-w-md text-center text-sm font-semibold leading-6 text-slate-500 lg:text-left">
            HTBF is composing several creative directions while your preview
            comes to life.
          </p>

          <div
            className={`mt-5 min-h-[1.75rem] text-center text-sm font-black text-[#0b63ce] transition-opacity duration-300 lg:text-left ${
              statusVisible ? "opacity-100" : "opacity-0"
            }`}
            aria-live="polite"
          >
            {statusText}…
          </div>

          <div className="relative mt-8 w-full max-w-[15.5rem] sm:max-w-[17rem]">
            <div className="absolute -inset-3 rounded-[1.85rem] bg-gradient-to-br from-[#0b63ce]/20 via-violet-300/25 to-[#d4af37]/25 blur-xl animate-pulse" />

            <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[1.35rem] bg-[#eef4ff] shadow-2xl shadow-indigo-300/30 ring-1 ring-white/90">
              <div
                className={`absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,#93c5fd,transparent_42%),linear-gradient(160deg,#2563eb_0%,#6366f1_48%,#c4b5fd_100%)] transition-opacity duration-[1400ms] ease-out ${
                  previewPhase >= 1 ? "opacity-100" : "opacity-0"
                }`}
              />

              <div
                className={`absolute inset-0 bg-gradient-to-t from-[#031d3d]/55 via-transparent to-white/10 transition-opacity duration-1000 ${
                  previewPhase >= 1 ? "opacity-100" : "opacity-0"
                }`}
              />

              <div
                className={`absolute inset-0 transition-opacity duration-[1200ms] ${
                  previewPhase >= 4 ? "opacity-100" : "opacity-0"
                }`}
                style={{
                  background:
                    "linear-gradient(135deg, rgba(212,175,55,0.22) 0%, rgba(99,102,241,0.18) 55%, transparent 100%)",
                }}
              />

              <img
                src="/images/htbf-logo.png"
                alt=""
                className={`pointer-events-none absolute right-2.5 top-2.5 h-6 w-auto opacity-80 transition-opacity duration-700 ${
                  previewPhase >= 1 ? "opacity-80" : "opacity-0"
                }`}
              />

              <div
                className={`absolute left-4 right-4 top-[22%] transition-all duration-700 ease-out ${
                  previewPhase >= 2
                    ? "translate-y-0 opacity-100"
                    : "translate-y-3 opacity-0"
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-100/90">
                  Title
                </p>
                <p className="mt-1 text-xl font-black leading-tight text-white drop-shadow-md sm:text-2xl">
                  God Is Moving
                </p>
              </div>

              <div
                className={`absolute bottom-[38%] left-4 right-4 transition-all duration-700 ease-out ${
                  previewPhase >= 3
                    ? "translate-y-0 opacity-100"
                    : "translate-y-3 opacity-0"
                }`}
              >
                <p className="inline-flex rounded-full bg-black/35 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#f8fafc] backdrop-blur-sm">
                  John 8:36
                </p>
              </div>

              <div className="absolute inset-x-2.5 bottom-2.5 flex gap-1.5">
                {[0, 1, 2].map((index) => (
                  <div
                    key={index}
                    className={`h-11 flex-1 rounded-xl border border-white/25 bg-white/15 backdrop-blur-sm transition-all duration-700 ease-out ${
                      previewPhase >= 5
                        ? "translate-y-0 opacity-100"
                        : "translate-y-5 opacity-0"
                    }`}
                    style={{ transitionDelay: `${index * 120}ms` }}
                  >
                    <div className="h-full rounded-xl bg-gradient-to-br from-white/25 to-white/5" />
                  </div>
                ))}
              </div>

              <div
                className={`pointer-events-none absolute inset-0 rounded-[1.35rem] ring-2 ring-[#d4af37]/30 transition-opacity duration-1000 ${
                  previewPhase >= 4 ? "opacity-100" : "opacity-0"
                }`}
              />
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-[1.5rem] bg-white/70 p-4 shadow-lg shadow-indigo-100/60 ring-1 ring-white backdrop-blur-sm sm:p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#0b63ce]">
            Creative process
          </p>

          <ol className="relative mt-5 space-y-0">
            <span
              aria-hidden
              className="absolute bottom-3 left-[0.69rem] top-3 w-px bg-gradient-to-b from-[#0b63ce]/15 via-violet-300/25 to-[#d4af37]/20"
            />

            {creativeSteps.map((step, index) => {
              const isComplete = index < activeStep;
              const isActive = index === activeStep;
              const isUpcoming = index > activeStep;

              return (
                <li
                  key={step}
                  className={`relative flex gap-3 pb-5 last:pb-0 ${
                    isUpcoming ? "opacity-45" : "opacity-100"
                  }`}
                >
                  <span className="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
                    <span
                      className={`block rounded-full transition-all duration-500 ${
                        isActive
                          ? "h-3.5 w-3.5 animate-pulse bg-gradient-to-br from-[#0b63ce] to-violet-500 shadow-[0_0_18px_rgba(11,99,206,0.45)]"
                          : isComplete
                            ? "h-2.5 w-2.5 bg-[#d4af37]/70"
                            : "h-2 w-2 bg-slate-300/80"
                      }`}
                    />
                  </span>

                  <div className="min-w-0 pt-0.5">
                    <p
                      className={`text-sm font-bold transition-colors duration-500 ${
                        isActive
                          ? "text-[#062a57]"
                          : isComplete
                            ? "text-slate-500"
                            : "text-slate-400"
                      }`}
                    >
                      {step}
                    </p>
                    {isActive && (
                      <p className="mt-1 text-xs font-semibold leading-5 text-[#0b63ce]/80">
                        In progress…
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {message && (
            <p className="mt-5 rounded-2xl bg-[#f8fbff] px-4 py-3 text-sm font-semibold leading-6 text-slate-600 ring-1 ring-blue-100/80">
              {message}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
