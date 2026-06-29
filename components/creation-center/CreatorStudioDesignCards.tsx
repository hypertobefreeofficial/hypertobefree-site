"use client";

import { Check } from "lucide-react";
import {
  creatorStudioLayoutOptions,
  type CreatorStudioDesign,
} from "../../lib/creationCenter";
import CreatorStudioPreview from "./CreatorStudioPreview";

type CreatorStudioDesignCardsProps = {
  designs: CreatorStudioDesign[];
  selectedDesignId: string | null;
  videoPreviewUrl: string | null;
  photoPreviewUrl: string | null;
  onSelect: (design: CreatorStudioDesign) => void;
};

function getLayoutLabel(layoutType: CreatorStudioDesign["layoutType"]) {
  return (
    creatorStudioLayoutOptions.find((option) => option.value === layoutType)
      ?.label ?? "Creative direction"
  );
}

export default function CreatorStudioDesignCards({
  designs,
  selectedDesignId,
  videoPreviewUrl,
  photoPreviewUrl,
  onSelect,
}: CreatorStudioDesignCardsProps) {
  return (
    <section className="min-w-0 space-y-4 overflow-hidden rounded-[2rem] bg-white p-4 shadow-2xl shadow-blue-950/10 ring-1 ring-blue-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-[#062a57]">
            Choose a creative direction
          </div>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            These are style directions, not final limits. Pick the one that
            feels closest.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[#0b63ce] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">
          {designs.length} ideas
        </span>
      </div>

      <div className="flex w-full max-w-full gap-4 overflow-x-auto pb-3 pt-1 [-webkit-overflow-scrolling:touch] md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-3">
        {designs.map((design) => {
          const selected = selectedDesignId === design.id;
          const layoutLabel = getLayoutLabel(design.layoutType);

          return (
            <button
              key={design.id}
              type="button"
              onClick={() => onSelect(design)}
              className={`group relative w-[18rem] shrink-0 overflow-hidden rounded-[1.85rem] bg-white p-2 text-left ring-2 transition duration-200 md:w-auto ${
                selected
                  ? "scale-[1.015] ring-[#0b63ce] ring-offset-2 shadow-2xl shadow-blue-900/20"
                  : "ring-transparent shadow-sm shadow-blue-950/5 hover:-translate-y-1 hover:ring-blue-200 hover:shadow-xl hover:shadow-blue-950/10"
              }`}
            >
              <div className="absolute inset-x-4 top-4 z-30 flex items-center justify-between gap-2">
                <span className="rounded-full bg-white/90 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#0b63ce] shadow-sm backdrop-blur">
                  {layoutLabel}
                </span>
                <span className="max-w-[8rem] truncate rounded-full bg-[#062a57]/75 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white backdrop-blur">
                  {design.styleMood}
                </span>
              </div>

              <CreatorStudioPreview
                design={design}
                videoPreviewUrl={videoPreviewUrl}
                photoPreviewUrl={photoPreviewUrl}
                compact
              />

              <div className="space-y-1 px-2 pb-3 pt-3">
                <div className="line-clamp-1 text-sm font-black text-[#062a57]">
                  {design.title}
                </div>
                <p className="line-clamp-2 text-xs font-semibold leading-5 text-slate-500">
                  {design.caption}
                </p>
              </div>

              {selected && (
                <span className="absolute right-3 bottom-3 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-[#0b63ce] text-white shadow-lg shadow-blue-900/25">
                  <Check className="h-4 w-4" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
