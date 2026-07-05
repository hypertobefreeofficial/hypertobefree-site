"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  EyeOff,
} from "lucide-react";
import {
  buildCreatorStudioLayerStyleUpdate,
  creatorStudioTextLayers,
  getCreatorStudioLayerStyle,
  type CreatorStudioDesign,
  type CreatorStudioLayerStyle,
  type CreatorStudioTextLayer,
} from "../../lib/creationCenter";

type CreatorStudioAdvancedControlsProps = {
  design: CreatorStudioDesign;
  selectedLayer: CreatorStudioTextLayer;
  onChange: (updates: Partial<CreatorStudioDesign>) => void;
};

export default function CreatorStudioAdvancedControls({
  design,
  selectedLayer,
  onChange,
}: CreatorStudioAdvancedControlsProps) {
  const layerStyle = getCreatorStudioLayerStyle(design, selectedLayer);

  function updateLayer(updates: Partial<CreatorStudioLayerStyle>) {
    onChange(buildCreatorStudioLayerStyleUpdate(design, selectedLayer, updates));
  }

  function nudgeLayerOrder(direction: "up" | "down") {
    const currentOrder = layerStyle.layerOrder ?? 0;
    updateLayer({
      layerOrder: direction === "up" ? currentOrder + 1 : currentOrder - 1,
    });
  }

  const selectedLabel =
    creatorStudioTextLayers.find((layer) => layer.value === selectedLayer)
      ?.label ?? "Text";

  return (
    <div className="grid gap-4">
      <p className="text-xs font-semibold leading-5 text-slate-500">
        Fine-tuning <span className="font-black text-[#062a57]">{selectedLabel}</span>
      </p>

      <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
        Opacity
        <div className="mt-2 flex items-center gap-3">
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={layerStyle.opacity ?? 1}
            onChange={(event) =>
              updateLayer({ opacity: Number(event.target.value) })
            }
            className="w-full accent-[#0b63ce]"
          />
          <span className="w-10 text-sm font-black text-[#062a57]">
            {Math.round((layerStyle.opacity ?? 1) * 100)}%
          </span>
        </div>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
          Letter spacing
          <input
            type="range"
            min={-0.05}
            max={0.2}
            step={0.01}
            value={layerStyle.letterSpacing ?? 0}
            onChange={(event) =>
              updateLayer({ letterSpacing: Number(event.target.value) })
            }
            className="mt-2 w-full accent-[#0b63ce]"
          />
        </label>

        <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
          Line spacing
          <input
            type="range"
            min={0.9}
            max={2}
            step={0.05}
            value={layerStyle.lineHeight ?? 1.2}
            onChange={(event) =>
              updateLayer({ lineHeight: Number(event.target.value) })
            }
            className="mt-2 w-full accent-[#0b63ce]"
          />
        </label>
      </div>

      <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
        Shadow
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={layerStyle.shadowStrength ?? 0.35}
          onChange={(event) =>
            updateLayer({ shadowStrength: Number(event.target.value) })
          }
          className="mt-2 w-full accent-[#0b63ce]"
        />
      </label>

      <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
        Outline
        <input
          type="range"
          min={0}
          max={3}
          step={0.25}
          value={layerStyle.outlineWidth ?? 0}
          onChange={(event) =>
            updateLayer({ outlineWidth: Number(event.target.value) })
          }
          className="mt-2 w-full accent-[#0b63ce]"
        />
      </label>

      <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
        Rotation
        <input
          type="range"
          min={-12}
          max={12}
          step={1}
          value={layerStyle.rotation ?? 0}
          onChange={(event) =>
            updateLayer({ rotation: Number(event.target.value) })
          }
          className="mt-2 w-full accent-[#0b63ce]"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => updateLayer({ align: "left" })}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#0b63ce] ring-1 ring-blue-100"
          aria-label="Align left"
        >
          <AlignLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => updateLayer({ align: "center" })}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#0b63ce] ring-1 ring-blue-100"
          aria-label="Align center"
        >
          <AlignCenter className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => updateLayer({ align: "right" })}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#0b63ce] ring-1 ring-blue-100"
          aria-label="Align right"
        >
          <AlignRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => nudgeLayerOrder("up")}
          className="inline-flex h-10 items-center gap-1 rounded-xl bg-blue-50 px-3 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100"
        >
          <ArrowUp className="h-4 w-4" /> Front
        </button>
        <button
          type="button"
          onClick={() => nudgeLayerOrder("down")}
          className="inline-flex h-10 items-center gap-1 rounded-xl bg-blue-50 px-3 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100"
        >
          <ArrowDown className="h-4 w-4" /> Back
        </button>
        <button
          type="button"
          onClick={() => updateLayer({ hidden: true })}
          className="inline-flex h-10 items-center gap-1 rounded-xl bg-blue-50 px-3 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100"
        >
          <EyeOff className="h-4 w-4" /> Hide
        </button>
      </div>
    </div>
  );
}
