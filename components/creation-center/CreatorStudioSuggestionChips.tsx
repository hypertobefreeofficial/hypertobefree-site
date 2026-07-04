"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { CreatorStudioSuggestionChipsProps } from "./creatorStudioComponentProps";

export type { CreatorStudioSuggestionChipsProps };

type SuggestionChip = {
  id: string;
  label: string;
  apply: () => void;
};

export function CreatorStudioSuggestionChips({
  design,
  onChange,
  onFocusLayer,
}: CreatorStudioSuggestionChipsProps) {
  const reducedMotion = useReducedMotion();
  const [dismissed, setDismissed] = useState<string[]>([]);

  const chips = useMemo(() => {
    const next: SuggestionChip[] = [];

    if (
      design.alternateTitles?.[0] &&
      design.alternateTitles[0] !== design.title
    ) {
      next.push({
        id: "headline-alt",
        label: `Try “${design.alternateTitles[0]}” as headline`,
        apply: () => {
          onChange({ title: design.alternateTitles?.[0] });
          onFocusLayer?.("title");
        },
      });
    } else if (design.overlayText.trim().length > 28) {
      next.push({
        id: "headline-overlay",
        label: "Make this line the headline",
        apply: () => {
          onChange({ title: design.overlayText.trim() });
          onFocusLayer?.("title");
        },
      });
    }

    if (design.scriptureSuggestion?.trim()) {
      next.push({
        id: "scripture",
        label: `Add ${design.scriptureSuggestion}`,
        apply: () => onFocusLayer?.("scripture"),
      });
    }

    if (
      design.alternateCaptions?.[0] &&
      design.alternateCaptions[0] !== design.caption
    ) {
      next.push({
        id: "caption",
        label: "Try a shorter caption",
        apply: () =>
          onChange({
            caption: design.alternateCaptions?.[0] ?? design.caption,
          }),
      });
    }

    if (
      design.textStyle?.fontSize !== "hero" &&
      design.layoutType === "full-image-poster"
    ) {
      next.push({
        id: "emphasis",
        label: "Emphasize the headline",
        apply: () =>
          onChange({
            textStyle: {
              ...design.textStyle,
              fontSize: "hero",
              weight: "bold",
            },
          }),
      });
    }

    return next.filter((chip) => !dismissed.includes(chip.id)).slice(0, 3);
  }, [design, dismissed, onChange, onFocusLayer]);

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 px-3 sm:bottom-5 sm:px-4">
      <div className="pointer-events-auto mx-auto flex max-w-xl flex-col gap-2">
        <div className="flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
          <Sparkles className="h-3 w-3" />
          Gentle suggestions
        </div>
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
          {chips.map((chip, index) => (
            <motion.button
              key={chip.id}
              type="button"
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06, duration: 0.28 }}
              onClick={chip.apply}
              className="group inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full bg-white/95 px-3.5 text-xs font-semibold text-[#062a57] shadow-lg shadow-black/15 backdrop-blur-md ring-1 ring-white/60"
            >
              {chip.label}
              <span
                role="button"
                tabIndex={0}
                aria-label="Dismiss suggestion"
                onClick={(event) => {
                  event.stopPropagation();
                  setDismissed((current) => [...current, chip.id]);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    setDismissed((current) => [...current, chip.id]);
                  }
                }}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition group-hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CreatorStudioSuggestionChips;
