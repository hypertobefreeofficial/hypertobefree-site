"use client";

import { Check } from "lucide-react";
import type {
  CreatorStudioLayerStyle,
  CreatorStudioTextLayer,
} from "../../lib/creationCenter";
import {
  buildCreatorStudioFontPresetPreviewStyle,
  getCreatorStudioFontPresetDefinition,
  getCreatorStudioFontPresetLabel,
  groupCreatorStudioFontPresetsByCategory,
  normalizeCreatorStudioFontPreset,
} from "../../lib/creatorStudioTypography";

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
}: CreatorStudioTextStylePresetPickerProps) {
  const activePreset = getCreatorStudioFontPresetDefinition(layerStyle.fontPreset);
  const activeFontPreset = normalizeCreatorStudioFontPreset(layerStyle.fontPreset);
  const groupedPresets = groupCreatorStudioFontPresetsByCategory();
  const presetCount = groupedPresets.reduce(
    (count, group) => count + group.presets.length,
    0
  );

  return (
    <div className="grid gap-3">
      <div className="rounded-xl bg-[#0b63ce]/10 px-3 py-2 ring-1 ring-[#0b63ce]/20">
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#0b63ce]">
          Text styles
        </p>
        <p className="mt-0.5 text-xs font-semibold text-[#062a57]">
          {presetCount} styles · <span className="capitalize">{selectedLayer}</span>
          {activePreset ? ` · ${activePreset.label}` : ""}
        </p>
      </div>

      <div className="grid gap-3">
        {groupedPresets.map((group) => (
          <section key={group.category} className="grid gap-1.5">
            <h4 className="px-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              {group.category}
            </h4>

            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {group.presets.map((preset) => {
                const selected = activeFontPreset === preset.value;
                const preview = buildCreatorStudioFontPresetPreviewStyle(preset);

                return (
                  <button
                    key={preset.value}
                    type="button"
                    title={preset.label}
                  onClick={() => {
  onApply({
    fontPreset: preset.value as CreatorStudioLayerStyle["fontPreset"],
  });
}}
                    className={`relative min-h-[5.25rem] rounded-xl px-2 py-2 text-left transition duration-200 hover:scale-[1.03] ${
                      selected
                        ? "border-2 border-[#0b63ce] bg-blue-50 shadow-[0_0_0_1px_rgba(11,99,206,0.15)]"
                        : "border border-blue-100 bg-white hover:border-[#69b7ff] hover:bg-blue-50/70"
                    }`}
                  >
                    {selected && (
                      <span className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#0b63ce] text-white shadow-sm">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    )}

                    <div
                      className={`line-clamp-2 text-[1.05rem] leading-tight text-[#062a57] ${preview.className}`}
                      style={preview.style}
                    >
                      {preset.previewSample}
                    </div>

                    <p className="mt-1 truncate text-[10px] font-semibold text-slate-500">
                      {preset.label}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {layerStyle.fontPreset && (
        <p className="text-[11px] font-medium text-slate-500">
          Active: {getCreatorStudioFontPresetLabel(layerStyle.fontPreset)}
        </p>
      )}
    </div>
  );
}
