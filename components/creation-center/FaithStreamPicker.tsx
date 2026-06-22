"use client";

import { Check, Waves } from "lucide-react";
import {
  MAX_FAITH_STREAMS,
  faithStreamOptions,
  type FaithStream,
} from "../../lib/creationCenter";

type FaithStreamPickerProps = {
  selected: FaithStream[];
  onToggle: (stream: FaithStream) => void;
};

export default function FaithStreamPicker({
  selected,
  onToggle,
}: FaithStreamPickerProps) {
  const limitReached = selected.length >= MAX_FAITH_STREAMS;

  return (
    <section className="min-w-0 max-w-full">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-black text-[#062a57]">
            <Waves className="h-4 w-4 text-[#0b63ce]" />
            Faith Streams
          </div>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            Choose the places where this story may help someone discover what
            God is doing.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[#0b63ce]">
          {selected.length}/{MAX_FAITH_STREAMS}
        </span>
      </div>

      <div className="mt-4 flex w-full max-w-full gap-2 overflow-x-auto px-0.5 pb-2 sm:flex-wrap sm:overflow-visible">
        {faithStreamOptions.map((option) => {
          const active = selected.includes(option.value);
          const disabled = !active && limitReached;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              disabled={disabled}
              aria-pressed={active}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-black ring-1 transition sm:shrink ${
                active
                  ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-blue-50"
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {active && <Check className="h-3.5 w-3.5" />}
              {option.label}
            </button>
          );
        })}
      </div>

      {limitReached && (
        <p className="mt-1 text-xs font-bold text-slate-500">
          Five streams keeps your story focused. Remove one to choose another.
        </p>
      )}
    </section>
  );
}

