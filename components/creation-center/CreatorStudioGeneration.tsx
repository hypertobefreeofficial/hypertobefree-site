"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import { BookOpen, Check, CheckCircle2, Cross, Layers, Lock, PenTool } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CreatorStudioDesign } from "../../lib/creationCenter";

type CreatorStudioGenerationProps = {
  message?: string;
  loading: boolean;
  ready: boolean;
  prompt?: string;
  category?: string;
  topic?: string;
  mood?: string;
  scriptureSuggestion?: string;
  designs?: CreatorStudioDesign[];
  onTransitionComplete?: () => void;
};

type GenerationPhase = "running" | "completing" | "exit";

const progressSteps = [
  {
    title: "Understanding your story",
    detail: "Analyzing the heart of your testimony.",
    icon: BookOpen,
  },
  {
    title: "Finding scripture and meaning",
    detail: "Matching God's word to your journey.",
    icon: Cross,
  },
  {
    title: "Exploring creative directions",
    detail: "Discovering themes for your testimony.",
    icon: Layers,
  },
  {
    title: "Preparing visual elements",
    detail: "Designing multiple inspired concepts.",
    icon: PenTool,
  },
  {
    title: "Finalizing your concepts",
    detail: "Wrapping up your six unique designs.",
    icon: CheckCircle2,
  },
] as const;

const livingMessages = [
  "Listening to your testimony…",
  "Finding moments of hope…",
  "Matching scripture…",
  "Exploring creative styles…",
  "Creating six unique concepts…",
] as const;

const MIN_TOTAL_MS = 11800;
const STEP_MIN_MS = 2400;
const STEP_MAX_MS = 3800;

function randomStepDuration() {
  return STEP_MIN_MS + Math.random() * (STEP_MAX_MS - STEP_MIN_MS);
}

function HeroOrb({ phase, reducedMotion }: { phase: GenerationPhase; reducedMotion: boolean }) {
  const completing = phase === "completing" || phase === "exit";

  return (
    <div className="relative mx-auto flex aspect-square w-[min(42vw,9.5rem)] items-center justify-center sm:w-[min(34vw,11rem)]">
      <motion.div
        className="absolute inset-[6%] rounded-full bg-[radial-gradient(circle,rgba(191,219,254,0.42)_0%,rgba(96,165,250,0.28)_38%,rgba(255,255,255,0.08)_62%,transparent_78%)] blur-[2px]"
        animate={
          reducedMotion
            ? { opacity: completing ? 0.95 : 0.6 }
            : {
                opacity: completing ? [0.75, 1, 0.88] : [0.45, 0.72, 0.5],
                scale: completing ? [1, 1.12, 1.04] : [1, 1.05, 1],
              }
        }
        transition={{
          duration: reducedMotion ? 0.3 : completing ? 1.8 : 3.2,
          repeat: completing || reducedMotion ? 0 : Infinity,
          ease: "easeInOut",
        }}
      />

      <motion.div
        className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(96,165,250,0.22),transparent_68%)]"
        animate={
          reducedMotion
            ? { opacity: completing ? 0.95 : 0.55 }
            : {
                opacity: completing ? [0.7, 1, 0.85] : [0.35, 0.6, 0.4],
                scale: completing ? [1, 1.18, 1.08] : [1, 1.06, 1],
              }
        }
        transition={{
          duration: reducedMotion ? 0.3 : completing ? 1.8 : 3.2,
          repeat: completing || reducedMotion ? 0 : Infinity,
          ease: "easeInOut",
        }}
      />

      <motion.div
        className="absolute inset-[8%] rounded-full border border-[#d4af37]/35"
        animate={reducedMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute inset-[14%] rounded-full border border-[#60a5fa]/45"
        animate={reducedMotion ? undefined : { rotate: -360 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute inset-[20%] rounded-full border border-white/20"
        animate={
          reducedMotion
            ? undefined
            : {
                scale: [1, 1.04, 1],
                opacity: [0.45, 0.85, 0.45],
              }
        }
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />

      {!reducedMotion &&
        [0, 1, 2, 3, 4, 5].map((index) => (
          <motion.div
            key={index}
            className="absolute inset-0"
            animate={{ rotate: 360 }}
            transition={{
              duration: 7 + index * 1.1,
              repeat: Infinity,
              ease: "linear",
            }}
          >
            <span className="absolute left-1/2 top-[10%] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/75 shadow-[0_0_10px_rgba(255,255,255,0.75)]" />
          </motion.div>
        ))}

      {!reducedMotion && (
        <motion.span
          className="absolute inset-[18%] rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "linear" }}
        >
          <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-[#93c5fd] shadow-[0_0_14px_rgba(147,197,253,0.95)]" />
        </motion.span>
      )}

      <motion.div
        className="relative z-10 flex flex-col items-center px-3 text-center"
        animate={{ opacity: phase === "exit" ? 0 : 1 }}
        transition={{ duration: 0.55 }}
      >
        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-blue-100/90">
          AI Thinking
        </p>

        <div className="relative my-2.5 flex h-[3.4rem] w-[3.4rem] items-center justify-center sm:h-[3.75rem] sm:w-[3.75rem]">
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.28)_0%,rgba(147,197,253,0.38)_45%,transparent_72%)]" />
          <Layers
            className="relative h-8 w-8 text-white/95 drop-shadow-[0_0_20px_rgba(191,219,254,0.75)] sm:h-9 sm:w-9"
            strokeWidth={1.5}
          />
        </div>

        <p className="text-sm font-black leading-tight text-white sm:text-base">
          Creating your{" "}
          <span className="bg-gradient-to-r from-[#dbeafe] via-[#93c5fd] to-[#c4b5fd] bg-clip-text text-transparent">
            designs
          </span>
        </p>
      </motion.div>

      <AnimatePresence>
        {completing && (
          <motion.div
            className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.55),rgba(147,197,253,0.35),transparent_72%)]"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1.12 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function CreatorStudioGeneration({
  message,
  loading,
  ready,
  prompt,
  category,
  topic,
  mood,
  scriptureSuggestion,
  designs = [],
  onTransitionComplete,
}: CreatorStudioGenerationProps) {
  const reducedMotion = useReducedMotion();
  const startTimeRef = useRef(Date.now());
  const completionStartedRef = useRef(false);

  const [activeStep, setActiveStep] = useState(0);
  const [phase, setPhase] = useState<GenerationPhase>("running");
  const [messageIndex, setMessageIndex] = useState(0);
  const [discoveryIndex, setDiscoveryIndex] = useState(0);
  const [showDiscovery, setShowDiscovery] = useState(false);

  const primaryDesign = designs[0];

  const discoveries = useMemo(
    () => [
      {
        icon: "✨",
        label: "Your story",
        value:
          primaryDesign?.overlayText?.slice(0, 72) ||
          primaryDesign?.title ||
          "Listening for what matters most",
      },
      {
        icon: "📖",
        label: "Scripture",
        value:
          primaryDesign?.scriptureSuggestion ||
          scriptureSuggestion ||
          "Finding a fitting reference",
      },
      {
        icon: "🎨",
        label: "Visual balance",
        value: "Placing text where it reads beautifully",
      },
      {
        icon: "💙",
        label: "Composition",
        value: "Respecting faces, light, and open space",
      },
      {
        icon: "🕊️",
        label: "Almost ready",
        value: "6 concepts inspired by your testimony",
      },
    ],
    [primaryDesign, scriptureSuggestion]
  );

  useEffect(() => {
    if (!loading) return;

    startTimeRef.current = Date.now();
    completionStartedRef.current = false;
    setActiveStep(0);
    setPhase("running");
    setMessageIndex(0);
    setDiscoveryIndex(0);
    setShowDiscovery(false);
  }, [loading]);

  useEffect(() => {
    if (phase !== "running" || activeStep >= progressSteps.length - 1) {
      return;
    }

    const timer = window.setTimeout(() => {
      setActiveStep((current) =>
        Math.min(current + 1, progressSteps.length - 1)
      );
    }, randomStepDuration());

    return () => window.clearTimeout(timer);
  }, [activeStep, phase]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % livingMessages.length);
    }, 3200);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (phase !== "running") return;

    const timer = window.setInterval(() => {
      setShowDiscovery(true);
      setDiscoveryIndex((current) => (current + 1) % discoveries.length);
      window.setTimeout(() => setShowDiscovery(false), 2600);
    }, 5200);

    return () => window.clearInterval(timer);
  }, [phase, discoveries.length]);

  useEffect(() => {
    if (!ready || completionStartedRef.current || phase !== "running") {
      return;
    }

    const elapsed = Date.now() - startTimeRef.current;
    const waitMs = Math.max(0, MIN_TOTAL_MS - elapsed);

    const timer = window.setTimeout(() => {
      completionStartedRef.current = true;
      setPhase("completing");
    }, waitMs);

    return () => window.clearTimeout(timer);
  }, [ready, phase]);

  useEffect(() => {
    if (phase !== "completing") return;

    const timer = window.setTimeout(() => setPhase("exit"), reducedMotion ? 600 : 2200);
    return () => window.clearTimeout(timer);
  }, [phase, reducedMotion]);

  useEffect(() => {
    if (phase !== "exit") return;

    const timer = window.setTimeout(() => {
      onTransitionComplete?.();
    }, reducedMotion ? 150 : 750);

    return () => window.clearTimeout(timer);
  }, [phase, onTransitionComplete, reducedMotion]);

  const activeDiscovery = discoveries[discoveryIndex];

  return (
    <motion.section
      className="relative isolate flex min-h-0 max-h-[calc(100dvh-11.5rem-env(safe-area-inset-bottom))] flex-col overflow-hidden rounded-[1.5rem] bg-[linear-gradient(165deg,#061a31_0%,#082f63_38%,#0b63ce_100%)] shadow-2xl shadow-blue-950/20 ring-1 ring-white/10 sm:max-h-[calc(100dvh-10rem-env(safe-area-inset-bottom))] sm:rounded-[2rem]"
      initial={{ opacity: 0 }}
      animate={{ opacity: phase === "exit" ? 0 : 1 }}
      transition={{ duration: phase === "exit" ? 0.65 : 0.45 }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -left-16 top-0 h-40 w-40 rounded-full bg-[#60a5fa]/20 blur-3xl"
          animate={
            reducedMotion
              ? undefined
              : { x: [0, 18, 0], y: [0, 10, 0], opacity: [0.35, 0.55, 0.35] }
          }
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -right-10 top-1/4 h-36 w-36 rounded-full bg-[#d4af37]/15 blur-3xl"
          animate={
            reducedMotion
              ? undefined
              : { x: [0, -12, 0], opacity: [0.25, 0.45, 0.25] }
          }
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.08),transparent_42%)]" />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/10 to-transparent" />
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3 sm:px-5 sm:pb-4 sm:pt-4">
        <div className="shrink-0 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-100/80">
            Creator Studio
          </p>
          <AnimatePresence mode="wait">
            {phase === "completing" || phase === "exit" ? (
              <motion.p
                key="ready"
                className="mt-2 text-lg font-black text-white sm:text-xl"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
              >
                Your concepts are ready.
              </motion.p>
            ) : (
              <motion.div
                key="running-copy"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <h3 className="mt-1 text-lg font-black leading-tight text-white sm:text-xl">
                  Creating your designs
                </h3>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={messageIndex}
                    className="mt-1.5 min-h-[1.25rem] text-xs font-semibold text-blue-100/85 sm:text-sm"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.35 }}
                  >
                    {livingMessages[messageIndex]}
                  </motion.p>
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex shrink-0 justify-center py-2 sm:py-3">
          <HeroOrb phase={phase} reducedMotion={Boolean(reducedMotion)} />
        </div>

        <AnimatePresence>
          {showDiscovery && phase === "running" && (
            <motion.div
              className="mx-auto mb-2 w-full max-w-sm shrink-0 rounded-2xl bg-white/10 px-3 py-2 text-center ring-1 ring-white/15 backdrop-blur-sm"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.35 }}
            >
              <p className="text-[11px] font-semibold text-blue-50/90">
                {activeDiscovery.icon} {activeDiscovery.label}:{" "}
                <span className="font-black text-white">
                  {activeDiscovery.value}
                </span>
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="min-h-0 flex-1 overflow-hidden">
          <ol className="flex h-full flex-col justify-center gap-1.5 sm:gap-2">
            {progressSteps.map((step, index) => {
              const Icon = step.icon;
              const isComplete = index < activeStep;
              const isActive = index === activeStep && phase === "running";
              const isUpcoming = index > activeStep || phase !== "running";

              return (
                <motion.li
                  key={step.title}
                  layout={!reducedMotion}
                  className={`relative flex min-h-0 items-center gap-2.5 rounded-2xl px-2.5 py-2 sm:gap-3 sm:px-3 sm:py-2.5 ${
                    isActive
                      ? "bg-white/10 ring-1 ring-[#60a5fa]/45 shadow-[0_8px_30px_rgba(59,130,246,0.18)]"
                      : isComplete
                        ? "bg-white/[0.06] ring-1 ring-emerald-300/20"
                        : "bg-white/[0.03] ring-1 ring-white/5 opacity-55"
                  }`}
                  animate={
                    isActive && !reducedMotion
                      ? {
                          boxShadow: [
                            "0 8px 30px rgba(59,130,246,0.12)",
                            "0 10px 34px rgba(96,165,250,0.24)",
                            "0 8px 30px rgba(59,130,246,0.12)",
                          ],
                        }
                      : undefined
                  }
                  transition={{
                    duration: 2.4,
                    repeat: isActive && !reducedMotion ? Infinity : 0,
                    ease: "easeInOut",
                  }}
                >
                  {isActive && !reducedMotion && (
                    <motion.span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/10 to-transparent"
                      animate={{ x: ["-120%", "120%"] }}
                      transition={{
                        duration: 2.8,
                        repeat: Infinity,
                        ease: "linear",
                        repeatDelay: 0.8,
                      }}
                    />
                  )}

                  <span
                    className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:h-9 sm:w-9 ${
                      isComplete
                        ? "bg-emerald-400/15 text-emerald-200"
                        : isActive
                          ? "bg-[#0b63ce]/30 text-[#bfdbfe]"
                          : "bg-white/5 text-slate-400"
                    }`}
                  >
                    {isComplete ? (
                      <motion.span
                        initial={reducedMotion ? false : { scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 420, damping: 20 }}
                      >
                        <Check className="h-4 w-4" />
                      </motion.span>
                    ) : (
                      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-xs font-black sm:text-sm ${
                        isActive
                          ? "text-white"
                          : isComplete
                            ? "text-blue-100/80"
                            : "text-slate-400"
                      }`}
                    >
                      {isComplete && "✓ "}
                      {step.title}
                    </p>
                    <p
                      className={`hidden truncate text-[11px] font-semibold sm:block ${
                        isActive ? "text-blue-100/75" : "text-slate-500"
                      }`}
                    >
                      {step.detail}
                    </p>
                  </div>

                  {isActive && (
                    <motion.span
                      className="h-2 w-2 shrink-0 rounded-full bg-[#93c5fd]"
                      animate={
                        reducedMotion
                          ? undefined
                          : { opacity: [0.45, 1, 0.45], scale: [0.9, 1.15, 0.9] }
                      }
                      transition={{ duration: 1.8, repeat: Infinity }}
                    />
                  )}

                  {isUpcoming && !isActive && !isComplete && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500/70" />
                  )}
                </motion.li>
              );
            })}
          </ol>
        </div>

        <div className="mt-2 shrink-0 rounded-2xl bg-white/[0.06] px-3 py-2 ring-1 ring-white/10 sm:py-2.5">
          <div className="flex items-start gap-2">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-100/70" />
            <p className="text-[11px] font-semibold leading-4 text-blue-50/80 sm:text-xs sm:leading-5">
              This usually takes 30–60 seconds. You&apos;ll review and edit
              everything next.
            </p>
          </div>
          {message && (
            <p className="mt-2 text-[11px] font-semibold leading-4 text-blue-100/70">
              {message}
            </p>
          )}
          {prompt && (
            <p className="mt-1 hidden truncate text-[10px] text-blue-100/45 sm:block">
              {prompt}
            </p>
          )}
        </div>
      </div>
    </motion.section>
  );
}
