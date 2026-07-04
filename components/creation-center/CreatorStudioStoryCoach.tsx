"use client";

import type { CreatorStudioDesign } from "../../lib/creationCenter";

type CreatorStudioStoryCoachProps = {
  design: CreatorStudioDesign;
  onApplyTitle?: (title: string) => void;
  onApplyScripture?: (reference: string) => void;
};

function buildSuggestions(design: CreatorStudioDesign) {
  const suggestions: { id: string; message: string; actionLabel?: string; onApply?: () => void }[] = [];

  if (design.alternateTitles?.[0] && design.alternateTitles[0] !== design.title) {
    suggestions.push({
      id: "headline",
      message: `"${design.alternateTitles[0]}" could work beautifully as your headline.`,
      actionLabel: "Use as title",
    });
  } else if (design.overlayText && design.overlayText.length > 24) {
    suggestions.push({
      id: "headline",
      message:
        "This sentence is especially powerful. Would you like to make it the headline?",
      actionLabel: "Use as title",
    });
  }

  if (design.styleMood) {
    suggestions.push({
      id: "theme",
      message: `Your story has a strong theme of ${design.styleMood.toLowerCase()}. These concepts emphasize that.`,
    });
  }

  if (design.scriptureSuggestion) {
    suggestions.push({
      id: "scripture",
      message: `"${design.scriptureSuggestion}" beautifully supports your story. Would you like to keep it?`,
      actionLabel: "Keep reference",
    });
  }

  if (design.conceptReason) {
    suggestions.push({
      id: "direction",
      message: design.conceptReason,
    });
  }

  return suggestions.slice(0, 2);
}

export default function CreatorStudioStoryCoach({
  design,
  onApplyTitle,
  onApplyScripture,
}: CreatorStudioStoryCoachProps) {
  const suggestions = buildSuggestions(design);

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="rounded-[1.25rem] bg-[#f8fbff] p-3 ring-1 ring-blue-100 sm:p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#0b63ce]">
        Story coach
      </p>
      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
        Optional ideas — your words stay yours.
      </p>
      <ul className="mt-3 space-y-2">
        {suggestions.map((suggestion) => (
          <li
            key={suggestion.id}
            className="rounded-2xl bg-white px-3 py-2.5 ring-1 ring-blue-100"
          >
            <p className="text-sm font-semibold leading-6 text-[#062a57]">
              {suggestion.message}
            </p>
            {suggestion.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  if (suggestion.id === "headline" && design.alternateTitles?.[0]) {
                    onApplyTitle?.(design.alternateTitles[0]);
                  } else if (
                    suggestion.id === "headline" &&
                    design.overlayText
                  ) {
                    onApplyTitle?.(design.overlayText);
                  } else if (
                    suggestion.id === "scripture" &&
                    design.scriptureSuggestion
                  ) {
                    onApplyScripture?.(design.scriptureSuggestion);
                  }
                }}
                className="mt-2 inline-flex min-h-9 items-center rounded-full bg-blue-50 px-3 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100"
              >
                {suggestion.actionLabel}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
