"use client";

import { Check, Sparkles } from "lucide-react";

type CreatorStudioGenerationProps = {
  message?: string;
};

const progressSteps = [
  "Understanding your story",
  "Finding scripture and meaning",
  "Choosing layouts",
  "Building beautiful concepts",
];

export default function CreatorStudioGeneration({
  message,
}: CreatorStudioGenerationProps) {
  return (
    <section className="relative isolate min-h-[34rem] overflow-hidden rounded-[2rem] bg-white px-5 py-8 shadow-2xl shadow-blue-950/10 ring-1 ring-blue-100 sm:px-8">
      <div className="pointer-events-none absolute left-1/2 top-24 h-72 w-72 -translate-x-1/2 rounded-full bg-[#0b63ce]/10 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-8 bottom-10 h-20 rounded-full bg-[#d4af37]/10 blur-3xl" />

      <div className="relative z-10 mx-auto flex max-w-xl flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#0b63ce] ring-1 ring-blue-100">
          <Sparkles className="h-3.5 w-3.5" />
          AI Thinking
        </div>

        <h3 className="mt-5 text-2xl font-black tracking-tight text-[#062a57] sm:text-3xl">
          Creating your designs
        </h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
          This usually takes a few moments. HTBF is shaping your story into
          several creative directions.
        </p>

        <div className="relative my-9 flex h-44 w-44 items-center justify-center">
          <span className="absolute h-full w-full animate-pulse rounded-full bg-[#0b63ce]/10" />
          <span className="absolute h-32 w-32 animate-pulse rounded-full bg-[#0b63ce]/15 [animation-delay:180ms]" />
          <span className="absolute h-24 w-24 rounded-full bg-gradient-to-br from-white via-blue-100 to-[#0b63ce] shadow-2xl shadow-blue-500/25" />
          <Sparkles className="relative z-10 h-9 w-9 text-white drop-shadow" />
        </div>

        <div className="w-full space-y-3 text-left">
          {progressSteps.map((step, index) => (
            <div
              key={step}
              className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-blue-100"
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  index < 2
                    ? "bg-emerald-500 text-white"
                    : index === 2
                      ? "bg-[#0b63ce] text-white"
                      : "bg-blue-50 text-[#0b63ce] ring-1 ring-blue-100"
                }`}
              >
                {index < 2 ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-current" />
                )}
              </span>
              <span className="text-sm font-bold text-[#062a57]">{step}</span>
            </div>
          ))}
        </div>

        {message && (
          <p className="mt-6 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-600 ring-1 ring-blue-100">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
