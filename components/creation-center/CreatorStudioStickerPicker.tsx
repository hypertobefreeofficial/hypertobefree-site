"use client";

import { addCreatorStudioStickerLayer, type CreatorStudioDesign } from "../../lib/creationCenter";
import { creatorStudioStickerOptions } from "../../lib/creatorStudioStickers";

type CreatorStudioStickerPickerProps = {
  design: CreatorStudioDesign;
  onChange: (updates: Partial<CreatorStudioDesign>) => void;
  compact?: boolean;
  className?: string;
};

export default function CreatorStudioStickerPicker({
  design,
  onChange,
  compact = false,
  className = "",
}: CreatorStudioStickerPickerProps) {
  return (
    <section className={`space-y-2 ${className}`}>
      <h4
        className={`font-black uppercase tracking-[0.14em] text-blue-100/80 ${
          compact ? "text-[10px]" : "text-xs"
        }`}
      >
        HTBF Stickers
      </h4>
      <div className={`grid gap-2 ${compact ? "grid-cols-4" : "grid-cols-3"}`}>
        {creatorStudioStickerOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(addCreatorStudioStickerLayer(design, option))}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl ring-1 transition hover:bg-white/10 ${
              compact
                ? "bg-blue-50 px-1.5 py-2 ring-blue-100"
                : "bg-white/5 px-2 py-2 ring-white/10"
            }`}
          >
            <span className={`leading-none ${compact ? "text-xl" : "text-2xl"}`}>
              {option.emoji}
            </span>
            <span
              className={`font-semibold ${
                compact
                  ? "text-[9px] text-[#062a57]"
                  : "text-[10px] text-blue-100/80"
              }`}
            >
              {option.label}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
