"use client";

import { Check } from "lucide-react";
import type {
  CreatorStudioLayerStyle,
  CreatorStudioTextLayer,
} from "../../lib/creationCenter";
import { CreatorStudioPresetTextShell } from "../../lib/creatorStudioPresetTextShell";
import { applyCreatorStudioFontPreset } from "../../lib/creatorStudioTextStylePresets";
import {
  buildCreatorStudioFontPresetPreviewStyle,
  getCreatorStudioFontPresetDefinition,
  getCreatorStudioFontPresetLabel,
  groupCreatorStudioFontPresetsByCategory,

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
  const activeFontPreset = layerStyle.fontPreset;
  const groupedPresets = groupCreatorStudioFontPresetsByCategory();
  const presetCount = groupedPresets.reduce(
    (count, group) => count + group.presets.length,
    0
  );

  return (
    <div className="grid gap-3">
      <div className="rounded-xl bg-[#0b63ce]/10 px-3 py-2 ring-1 ring-[#0b63ce]/20">
        <p className="text-[11px] font-heading font-semibold uppercase tracking-[0.12em] text-[#0b63ce]">
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
            <h4 className="px-0.5 text-[10px] font-heading font-semibold uppercase tracking-[0.14em] text-slate-400">
              {group.category}
            </h4>

            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {group.presets.map((preset) => {
                const selected = activeFontPreset === preset.value;
                const preview = buildCreatorStudioFontPresetPreviewStyle(preset);
                const previewBackground =
                  preview.decoration?.previewBackground ??
                  "linear-gradient(145deg, #041428 0%, #0b63ce 100%)";

                return (
                  <button
                    key={preset.value}
                    type="button"
                    title={preset.label}
                    onClick={() => {
                      onApply(applyCreatorStudioFontPreset(preset.value));
                    }}
                    className={`relative min-h-[5.75rem] overflow-hidden rounded-xl px-2 py-2 text-left transition duration-200 hover:scale-[1.03] ${
                      selected
                        ? "border-2 border-[#0b63ce] shadow-[0_0_0_1px_rgba(11,99,206,0.15)]"
                        : "border border-blue-100 hover:border-[#69b7ff]"
                    }`}
                  >
                    {selected && (
                      <span className="absolute right-1.5 top-1.5 z-[2] inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#0b63ce] text-white shadow-sm">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    )}

                    <div
                      className="flex min-h-[3.35rem] items-center justify-center rounded-lg px-1.5 py-2"
                      style={{ background: previewBackground }}
                    >
                      <CreatorStudioPresetTextShell
                        decoration={preview.decoration}
                        inlineStyle={preview.style}
                        textClassName={`line-clamp-2 max-w-full text-[0.95rem] leading-tight ${preview.className}`}
                        compact
                      >
                        {preset.previewSample}
                      </CreatorStudioPresetTextShell>
                    </div>

                    <p className="mt-1 truncate text-[10px] font-semibold text-slate-600">
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
