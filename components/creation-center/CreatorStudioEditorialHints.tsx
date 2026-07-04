"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import type { CreatorStudioDesign } from "../../lib/creationCenter";

type CreatorStudioEditorialHintsProps = {
  design: CreatorStudioDesign;
  onApplyTitle?: (title: string) => void;
  onApplyCaption?: (caption: string) => void;
  onFocusScripture?: () => void;
};

export default function CreatorStudioEditorialHints({
  design,
  onApplyTitle,
  onApplyCaption,
  onFocusScripture,
}: CreatorStudioEditorialHintsProps) {
  const reducedMotion = useReducedMotion();

  const hint = useMemo(() => {
    const alternate = design.alternateTitles?.[0];
    if (alternate && alternate !== design.title && design.title.length < 48) {
      return {
        message: "This title feels powerful.",
        action: "Try the alternate",
        onClick: () => onApplyTitle?.(alternate),
      };
    }

    if (design.overlayText.trim().length > 36 && design.title.length < 24) {
      return {
        message: "Try emphasizing the breakthrough.",
        action: "Use subtitle as headline",
        onClick: () => onApplyTitle?.(design.overlayText.trim()),
      };
    }

    if (design.scriptureSuggestion?.trim()) {
      return {
        message: "This verse matches beautifully.",
        action: "Focus scripture",
        onClick: () => onFocusScripture?.(),
      };
    }

    if (
      design.alternateCaptions?.[0] &&
      design.alternateCaptions[0] !== design.caption &&
      design.caption.length > 120
    ) {
      return {
        message: "Consider shortening the subtitle.",
        action: "Use shorter caption",
        onClick: () => onApplyCaption?.(design.alternateCaptions![0]),
      };
    }

    if (design.title.trim().startsWith("I")) {
      return {
        message: "This opening feels very personal.",
        action: null,
        onClick: undefined,
      };
    }

    if (design.styleMood?.toLowerCase().includes("hope")) {
      return {
        message: "Would you like this to sound more hopeful?",
        action: null,
        onClick: undefined,
      };
    }

    return null;
  }, [design, onApplyCaption, onApplyTitle, onFocusScripture]);

  if (!hint) return null;

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none absolute inset-x-0 bottom-5 z-30 px-4"
    >
      <div className="pointer-events-auto mx-auto flex max-w-md items-center justify-between gap-3 rounded-full bg-black/45 px-4 py-2.5 text-white backdrop-blur-md ring-1 ring-white/15">
        <p className="text-xs font-medium leading-5 text-white/90">
          {hint.message}
        </p>
        {hint.action && hint.onClick && (
          <button
            type="button"
            onClick={hint.onClick}
            className="shrink-0 text-[11px] font-black text-[#93c5fd]"
          >
            {hint.action}
          </button>
        )}
      </div>
    </motion.div>
  );
}
