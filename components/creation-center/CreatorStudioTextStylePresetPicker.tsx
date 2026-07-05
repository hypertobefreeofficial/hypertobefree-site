"use client";

import { useMemo, useState } from "react";
import type {
  CreatorStudioLayerStyle,
  CreatorStudioTextLayer,
} from "../../lib/creationCenter";
import {
  applyCreatorStudioTextStylePreset,
  creatorStudioTextStylePresetCategories,
  creatorStudioTextStylePresets,
  getCreatorStudioTextStylePreset,
} from "../../lib/creatorStudioTextStylePresets";

type CreatorStudioTextStylePresetPickerProps = {
  layerStyle: CreatorStudioLayerStyle;
  selectedLayer: CreatorStudioTextLayer;
  onApply: (updates: Partial<CreatorStudioLayerStyle>) => void;
  compact?: boolean;
};

export default function CreatorStudioTextStylePresetPicker({
  layerStyle,
  selectedLayer,
  onApply,
  compact = false,
}: CreatorStudioTextStylePresetPickerProps) {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const activePreset = getCreatorStudioTextStylePreset(layerStyle.stylePresetId);

  const filteredPresets = useMemo(() => {
    if (activeCategory === "All") {
      return creatorStudioTextStylePresets;
    }

    return creatorStudioTextStylePresets.filter(
      (preset) => preset.category === activeCategory
    );
  }, [activeCategory]);

  return (
    <div className="grid gap-3">
      <div className="rounded-2xl bg-[#0b63ce]/10 px-4 py-3 ring-1 ring-[#0b63ce]/20">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
          Text style library
        </p>
        <p className="mt-1 text-sm font-semibold text-[#062a57]">
          {creatorStudioTextStylePresets.length} presets · applying to{" "}
          <span className="font-black capitalize">{selectedLayer}</span>
        </p>
        <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
          Tap a preset to instantly update font, weight, size, spacing, line
          height, and shadow on the canvas.
        </p>
        {activePreset && (
          <p className="mt-2 text-xs font-semibold text-[#062a57]">
            Active: {activePreset.label}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveCategory("All")}
          className={`rounded-full px-3 py-1.5 text-[11px] font-black ring-1 transition ${
            activeCategory === "All"
              ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
              : "bg-white text-[#0b63ce] ring-blue-100 hover:bg-blue-50"
          }`}
        >
          All ({creatorStudioTextStylePresets.length})
        </button>
        {creatorStudioTextStylePresetCategories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveCategory(category)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-black ring-1 transition ${
              activeCategory === category
                ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                : "bg-white text-[#0b63ce] ring-blue-100 hover:bg-blue-50"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      <div
        className={`grid gap-2 overflow-y-auto pr-1 ${
          compact ? "max-h-[min(42dvh,28rem)]" : "max-h-[min(52dvh,32rem)]"
        } sm:grid-cols-2 xl:grid-cols-2`}
      >
        {filteredPresets.map((preset) => {
          const selected = layerStyle.stylePresetId === preset.id;

          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onApply(applyCreatorStudioTextStylePreset(preset.id))}
              className={`rounded-2xl px-3 py-3 text-left ring-2 transition ${
                selected
                  ? "bg-blue-50 ring-[#0b63ce]"
                  : "bg-white ring-blue-100 hover:bg-blue-50/70 hover:ring-[#69b7ff]"
              }`}
            >
              <div
                className={`truncate text-lg text-[#062a57] ${preset.previewClassName} ${
                  preset.weight === "bold" ? "font-black" : "font-semibold"
                } ${preset.italic ? "italic" : ""}`}
                style={{
                  letterSpacing: `${preset.letterSpacing}em`,
                  lineHeight: preset.lineHeight,
                  textShadow:
                    preset.shadowStrength > 0
                      ? `0 2px ${Math.round(preset.shadowStrength * 16)}px rgba(0,0,0,${Math.min(0.75, preset.shadowStrength)})`
                      : undefined,
                  WebkitTextStroke:
                    preset.outlineWidth > 0
                      ? `${preset.outlineWidth}px rgba(0,0,0,0.35)`
                      : undefined,
                }}
              >
                Thank You
              </div>
              <p className="mt-2 text-xs font-black text-[#062a57]">
                {preset.label}
              </p>
              <p className="mt-1 text-[11px] font-medium leading-4 text-slate-500">
                {preset.recommendedUse}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
