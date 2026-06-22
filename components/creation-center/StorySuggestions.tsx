"use client";

import { Check, Plus, Sparkles, X } from "lucide-react";
import {
  faithStreamOptions,
  type CreationCenterSuggestion,
  type FaithStream,
} from "../../lib/creationCenter";

type StorySuggestionsProps = {
  suggestion: CreationCenterSuggestion | null;
  loading: boolean;
  message: string;
  selectedStreams: FaithStream[];
  onRequest: () => void;
  onUseStoryType: (storyType: string) => void;
  onUseTitle: (title: string) => void;
  onUseFaithStream: (stream: FaithStream) => void;
  onUseAllFaithStreams: (streams: FaithStream[]) => void;
  onUseCaption: (caption: string) => void;
  onUseScriptureReferences: (references: string[]) => void;
  onUseTemplate: (template: string) => void;
  onClear: () => void;
};

function titleCase(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getFaithStreamLabel(stream: FaithStream) {
  return (
    faithStreamOptions.find((option) => option.value === stream)?.label ??
    titleCase(stream)
  );
}

export default function StorySuggestions({
  suggestion,
  loading,
  message,
  selectedStreams,
  onRequest,
  onUseStoryType,
  onUseTitle,
  onUseFaithStream,
  onUseAllFaithStreams,
  onUseCaption,
  onUseScriptureReferences,
  onUseTemplate,
  onClear,
}: StorySuggestionsProps) {
  return (
    <section className="overflow-hidden rounded-[1.5rem] bg-[#062a57] text-white">
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-black">
              <Sparkles className="h-4 w-4 text-[#f4c95d]" />
              Help shape your story
            </div>
            <p className="mt-1 text-xs font-semibold leading-5 text-blue-100">
              Get optional ideas while keeping every final choice in your
              hands.
            </p>
          </div>

          <button
            type="button"
            onClick={onRequest}
            disabled={loading}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-[#0b63ce] disabled:cursor-wait disabled:opacity-60"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {loading
              ? "Shaping..."
              : suggestion
                ? "Refresh suggestions"
                : "Help me shape this"}
          </button>
        </div>

        {message && (
          <div className="mt-3 rounded-2xl bg-white/10 px-4 py-3 text-xs font-bold leading-5 text-blue-50 ring-1 ring-white/10">
            {message}
          </div>
        )}
      </div>

      {suggestion && (
        <div className="space-y-5 bg-white p-4 text-slate-800 sm:p-5">
          {suggestion.storyType && (
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                Suggested story direction
              </div>
              <button
                type="button"
                onClick={() => onUseStoryType(suggestion.storyType)}
                className="mt-2 inline-flex rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100"
              >
                Use {titleCase(suggestion.storyType)}
              </button>
            </div>
          )}

          {suggestion.titles.length > 0 && (
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                Title ideas
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestion.titles.map((title) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => onUseTitle(title)}
                    className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-[#062a57] hover:bg-blue-50"
                  >
                    Use: {title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {suggestion.faithStreams.length > 0 && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                  Related Faith Streams
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUseAllFaithStreams(suggestion.faithStreams)
                  }
                  className="text-xs font-black text-[#0b63ce]"
                >
                  Add available streams
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestion.faithStreams.map((stream) => {
                  const selected = selectedStreams.includes(stream);

                  return (
                    <button
                      key={stream}
                      type="button"
                      onClick={() => !selected && onUseFaithStream(stream)}
                      disabled={selected}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-black ring-1 ${
                        selected
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                          : "bg-white text-[#0b63ce] ring-blue-200 hover:bg-blue-50"
                      }`}
                    >
                      {selected ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      {getFaithStreamLabel(stream)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {suggestion.caption && (
            <div className="rounded-[1.25rem] bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                Suggested wording
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">
                {suggestion.caption}
              </p>
              <button
                type="button"
                onClick={() => onUseCaption(suggestion.caption)}
                className="mt-3 rounded-full bg-[#0b63ce] px-4 py-2 text-xs font-black text-white"
              >
                Use this wording
              </button>
            </div>
          )}

          {suggestion.scriptureReferences.length > 0 && (
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                Scripture references
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestion.scriptureReferences.map((reference) => (
                  <span
                    key={reference}
                    className="rounded-full bg-amber-50 px-3 py-2 text-xs font-black text-amber-900 ring-1 ring-amber-100"
                  >
                    {reference}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  onUseScriptureReferences(
                    suggestion.scriptureReferences
                  )
                }
                className="mt-2 rounded-full bg-white px-3 py-2 text-xs font-black text-amber-900 ring-1 ring-amber-200"
              >
                Add references
              </button>
            </div>
          )}

          {suggestion.layoutSuggestion && (
            <div className="rounded-[1.25rem] bg-blue-50 p-4 ring-1 ring-blue-100">
              <div className="text-[11px] font-black uppercase tracking-[0.14em] text-[#0b63ce]">
                Suggested story flow
              </div>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#082f63]">
                {suggestion.layoutSuggestion}
              </p>
              <p className="mt-2 text-xs font-bold text-blue-700">
                Use this as a guide only. It will not change your words.
              </p>
            </div>
          )}

          {suggestion.template && (
            <button
              type="button"
              onClick={() => onUseTemplate(suggestion.template)}
              className="rounded-full bg-blue-50 px-4 py-2 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100"
            >
              Try suggested post layout
            </button>
          )}

          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
            Clear suggestions
          </button>
        </div>
      )}
    </section>
  );
}
