"use client";

import { Sparkles } from "lucide-react";

type StorySuggestionsProps = {
  enabled?: boolean;
  onRequest?: () => void;
};

export default function StorySuggestions({
  enabled = false,
  onRequest,
}: StorySuggestionsProps) {
  return (
    <section className="rounded-[1.5rem] bg-[#062a57] p-4 text-white">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-black">
            <Sparkles className="h-4 w-4 text-[#f4c95d]" />
            Help shape your story
          </div>
          <p className="mt-1 text-xs font-semibold leading-5 text-blue-100">
            Get optional title, wording, Faith Stream, and scripture-reference
            ideas while keeping your voice in control.
          </p>
        </div>

        <button
          type="button"
          onClick={onRequest}
          disabled={!enabled || !onRequest}
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-white px-4 py-2 text-xs font-black text-[#0b63ce] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/70"
        >
          {enabled ? "Help me shape this" : "Coming in the next step"}
        </button>
      </div>
    </section>
  );
}

