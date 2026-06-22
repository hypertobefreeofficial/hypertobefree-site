"use client";

import { Check, Waves } from "lucide-react";
import {
  MAX_FAITH_STREAMS,
  faithStreamOptions,
  getFaithStreamImage,
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
          const imagePath = getFaithStreamImage(option.value);

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              disabled={disabled}
              aria-pressed={active}
              className={`relative h-20 w-32 shrink-0 overflow-hidden rounded-[1.1rem] text-left ring-2 transition sm:w-36 ${
                active
                  ? "ring-[#0b63ce] ring-offset-2"
                  : "ring-transparent hover:ring-blue-200"
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {imagePath ? (
                <img
                  src={imagePath}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <span className="absolute inset-0 bg-gradient-to-br from-[#0b63ce] via-[#2f8ee5] to-[#69b7ff]" />
              )}
              <span className="absolute inset-0 bg-gradient-to-t from-[#031d3d]/95 via-[#062a57]/30 to-transparent" />
              <span className="absolute inset-x-3 bottom-2.5 z-10 whitespace-nowrap text-xs font-black text-white">
                {option.label}
              </span>
              {active && (
                <span className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#0b63ce] shadow-sm">
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
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
