"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const publishSteps = [
  "Publishing your testimony...",
  "Reviewing safety...",
  "Uploading media...",
  "Preparing design...",
  "Almost finished...",
] as const;

type CreatorStudioPublishingProps = {
  activeStep: string;
  error?: string | null;
  onRetry?: () => void;
  onBackToEdit?: () => void;
};

export default function CreatorStudioPublishing({
  activeStep,
  error,
  onRetry,
  onBackToEdit,
}: CreatorStudioPublishingProps) {
  const activeIndex = useMemo(() => {
    const index = publishSteps.findIndex((step) => step === activeStep);
    return index >= 0 ? index : 0;
  }, [activeStep]);

  const [visibleIndex, setVisibleIndex] = useState(activeIndex);

  useEffect(() => {
    setVisibleIndex((current) => Math.max(current, activeIndex));
  }, [activeIndex]);

  return (
    <div className="mx-auto flex min-h-[min(100dvh,56rem)] w-full max-w-lg flex-col items-center justify-center bg-[#020617] px-6 py-12 text-center lg:min-h-[calc(100dvh-5rem)]">
      {!error ? (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0b63ce]/20 ring-1 ring-[#69b7ff]/30">
            <Loader2 className="h-8 w-8 animate-spin text-[#69b7ff]" />
          </div>
          <h2 className="mt-6 text-2xl font-black text-white">
            Publishing your testimony...
          </h2>
          <p className="mt-2 text-sm font-medium text-blue-100/70">
            Please keep this screen open while we finish.
          </p>

          <ol className="mt-10 w-full max-w-sm space-y-3 text-left">
            {publishSteps.map((step, index) => {
              const complete = index < visibleIndex;
              const current = index === visibleIndex && !error;

              return (
                <li
                  key={step}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                    current
                      ? "bg-white/10 text-white ring-1 ring-white/15"
                      : complete
                        ? "text-emerald-300"
                        : "text-white/35"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
                      complete
                        ? "bg-emerald-500/20 text-emerald-300"
                        : current
                          ? "bg-[#0b63ce] text-white"
                          : "bg-white/10 text-white/40"
                    }`}
                  >
                    {complete ? "✓" : index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <>
          <div className="rounded-[1.5rem] bg-red-500/10 px-5 py-4 ring-1 ring-red-400/20">
            <p className="text-sm font-bold text-red-200">{error}</p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#0b63ce] px-6 text-sm font-black text-white"
              >
                Try Again
              </button>
            )}
            {onBackToEdit && (
              <button
                type="button"
                onClick={onBackToEdit}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-white/10 px-6 text-sm font-black text-white ring-1 ring-white/15"
              >
                Back to Edit
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
