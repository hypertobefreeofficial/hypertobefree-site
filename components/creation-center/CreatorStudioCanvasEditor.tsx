"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Minus,
  Move,
  Plus,
  Sparkles,
  Type,
  Upload,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  buildCreatorStudioLayerStyleUpdate,
  buildCreatorStudioLayerTextUpdate,
  creatorStudioLayerPositions,
  creatorStudioTextLayers,
  getCreatorStudioLayerStyle,
  getCreatorStudioLayerText,
  type CreatorStudioDesign,
  type CreatorStudioLayerStyle,
  type CreatorStudioTextLayer,
} from "../../lib/creationCenter";
import CreatorStudioLayoutEditor, {
  type CreatorStudioEditorPanel,
} from "./CreatorStudioLayoutEditor";
import CreatorStudioPreview from "./CreatorStudioPreview";

type CreatorStudioCanvasEditorProps = {
  design: CreatorStudioDesign;
  onChange: (updates: Partial<CreatorStudioDesign>) => void;
  videoPreviewUrl: string | null;
  photoPreviewUrl: string | null;
  videoFileName: string | null;
  photoFileName: string | null;
  onVideoSelect: (file: File | null) => void;
  onPhotoSelect: (file: File | null) => void;
  onRemoveVideo: () => void;
  onRemovePhoto: () => void;
  onContinueToPublish: () => void;
  onChangeConcept?: () => void;
  showChangeConcept?: boolean;
  aiControls: ReactNode;
};

const colorSwatches = [
  "#FFFFFF",
  "#F8FAFC",
  "#D4AF37",
  "#93C5FD",
  "#062A57",
  "#22C55E",
  "#F97316",
];

const fontSizeSteps: NonNullable<CreatorStudioLayerStyle["fontSize"]>[] = [
  "small",
  "medium",
  "large",
  "hero",
];

function nextFontSize(
  current: CreatorStudioLayerStyle["fontSize"],
  direction: 1 | -1
) {
  const index = fontSizeSteps.indexOf(current ?? "large");
  const nextIndex = Math.min(
    fontSizeSteps.length - 1,
    Math.max(0, index + direction)
  );

  return fontSizeSteps[nextIndex];
}

export default function CreatorStudioCanvasEditor({
  design,
  onChange,
  videoPreviewUrl,
  photoPreviewUrl,
  videoFileName,
  photoFileName,
  onVideoSelect,
  onPhotoSelect,
  onRemoveVideo,
  onRemovePhoto,
  onContinueToPublish,
  onChangeConcept,
  showChangeConcept = false,
  aiControls,
}: CreatorStudioCanvasEditorProps) {
  const [selectedLayer, setSelectedLayer] =
    useState<CreatorStudioTextLayer>("title");
  const [showTextPopover, setShowTextPopover] = useState(false);
  const [showAllTextSheet, setShowAllTextSheet] = useState(false);
  const [drawerPanel, setDrawerPanel] =
    useState<CreatorStudioEditorPanel | null>(null);

  const layerStyle = useMemo(
    () => getCreatorStudioLayerStyle(design, selectedLayer),
    [design, selectedLayer]
  );
  const layerText = getCreatorStudioLayerText(design, selectedLayer);
  const selectedLayerLabel =
    creatorStudioTextLayers.find((layer) => layer.value === selectedLayer)
      ?.label ?? "Text";

  function updateLayerStyle(updates: Partial<CreatorStudioLayerStyle>) {
    onChange(buildCreatorStudioLayerStyleUpdate(design, selectedLayer, updates));
  }

  function updateLayerText(value: string) {
    onChange(buildCreatorStudioLayerTextUpdate(selectedLayer, value));
  }

  function cyclePosition() {
    const currentIndex = creatorStudioLayerPositions.indexOf(
      layerStyle.position ?? "center"
    );
    const nextIndex =
      (currentIndex + 1) % creatorStudioLayerPositions.length;
    updateLayerStyle({ position: creatorStudioLayerPositions[nextIndex] });
  }

  function toggleDrawer(panel: CreatorStudioEditorPanel) {
    setDrawerPanel((current) => (current === panel ? null : panel));
  }

  return (
    <div className="mx-auto flex min-w-0 max-w-4xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
          Design editor
        </p>
        <div className="flex flex-wrap gap-2">
          {showChangeConcept && onChangeConcept && (
            <button
              type="button"
              onClick={onChangeConcept}
              className="min-h-10 rounded-full bg-white px-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#0b63ce] ring-1 ring-blue-100"
            >
              Change concept
            </button>
          )}
          <button
            type="button"
            onClick={onContinueToPublish}
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#0b63ce] px-4 text-xs font-black text-white"
          >
            Continue to Publish <Upload className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="relative min-w-0 overflow-hidden rounded-[1.5rem] bg-[#031d3d] p-2 ring-1 ring-blue-100 sm:p-3">
        <CreatorStudioPreview
          design={design}
          videoPreviewUrl={videoPreviewUrl}
          photoPreviewUrl={photoPreviewUrl}
          canvas
          interactive
          selectedTextLayer={selectedLayer}
          onSelectTextLayer={(layer) => {
            setSelectedLayer(layer);
            setShowTextPopover(false);
          }}
        />

        <div className="pointer-events-none absolute inset-x-2 top-2 z-30 flex justify-center sm:inset-x-3 sm:top-3">
          <div className="pointer-events-auto w-full max-w-xl rounded-2xl bg-[#031d3d]/95 p-2 shadow-2xl ring-1 ring-white/10 backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-100">
                {selectedLayerLabel}
              </span>
              <button
                type="button"
                onClick={() => setShowTextPopover((current) => !current)}
                className={`inline-flex min-h-8 items-center gap-1 rounded-full px-3 text-[10px] font-black uppercase tracking-[0.1em] ${
                  showTextPopover
                    ? "bg-[#0b63ce] text-white"
                    : "bg-white/10 text-white ring-1 ring-white/15"
                }`}
              >
                <Type className="h-3 w-3" /> Edit text
              </button>
            </div>

            {showTextPopover && (
              <div className="mb-2 rounded-xl bg-white/95 p-2 ring-1 ring-white/20">
                {selectedLayer === "caption" ? (
                  <textarea
                    value={layerText}
                    onChange={(event) => updateLayerText(event.target.value)}
                    rows={3}
                    placeholder={`Edit ${selectedLayerLabel.toLowerCase()}`}
                    className="w-full resize-none rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm font-semibold text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-2 focus:ring-blue-100"
                  />
                ) : (
                  <input
                    value={layerText}
                    onChange={(event) => updateLayerText(event.target.value)}
                    placeholder={`Edit ${selectedLayerLabel.toLowerCase()}`}
                    className="w-full rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm font-bold text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-2 focus:ring-blue-100"
                  />
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                aria-label="Bold"
                onClick={() =>
                  updateLayerStyle({
                    weight: layerStyle.weight === "bold" ? "regular" : "bold",
                  })
                }
                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${
                  layerStyle.weight === "bold"
                    ? "bg-[#0b63ce] text-white"
                    : "bg-white/10 text-white"
                }`}
              >
                <Bold className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Italic"
                onClick={() =>
                  updateLayerStyle({ italic: !layerStyle.italic })
                }
                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${
                  layerStyle.italic
                    ? "bg-[#0b63ce] text-white"
                    : "bg-white/10 text-white"
                }`}
              >
                <Italic className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Align left"
                onClick={() => updateLayerStyle({ align: "left" })}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${
                  layerStyle.align === "left"
                    ? "bg-[#0b63ce] text-white"
                    : "bg-white/10 text-white"
                }`}
              >
                <AlignLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Align center"
                onClick={() => updateLayerStyle({ align: "center" })}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${
                  layerStyle.align === "center"
                    ? "bg-[#0b63ce] text-white"
                    : "bg-white/10 text-white"
                }`}
              >
                <AlignCenter className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Align right"
                onClick={() => updateLayerStyle({ align: "right" })}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${
                  layerStyle.align === "right"
                    ? "bg-[#0b63ce] text-white"
                    : "bg-white/10 text-white"
                }`}
              >
                <AlignRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Smaller text"
                onClick={() =>
                  updateLayerStyle({
                    fontSize: nextFontSize(layerStyle.fontSize, -1),
                  })
                }
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Larger text"
                onClick={() =>
                  updateLayerStyle({
                    fontSize: nextFontSize(layerStyle.fontSize, 1),
                  })
                }
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Decrease scale"
                onClick={() =>
                  updateLayerStyle({
                    fontScale: Math.max(
                      0.75,
                      (layerStyle.fontScale ?? 1) - 0.05
                    ),
                  })
                }
                className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl bg-white/10 px-2 text-[10px] font-black text-white"
              >
                A-
              </button>
              <button
                type="button"
                aria-label="Increase scale"
                onClick={() =>
                  updateLayerStyle({
                    fontScale: Math.min(
                      1.5,
                      (layerStyle.fontScale ?? 1) + 0.05
                    ),
                  })
                }
                className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl bg-white/10 px-2 text-[10px] font-black text-white"
              >
                A+
              </button>
              <button
                type="button"
                aria-label="Move position"
                onClick={cyclePosition}
                className="inline-flex h-9 items-center gap-1 rounded-xl bg-white/10 px-2 text-[10px] font-black uppercase tracking-[0.08em] text-white"
              >
                <Move className="h-3.5 w-3.5" />
                {layerStyle.position?.replace("-", " ") ?? "center"}
              </button>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {colorSwatches.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Color ${color}`}
                  onClick={() => updateLayerStyle({ color })}
                  className={`h-7 w-7 rounded-full ring-2 ${
                    layerStyle.color === color
                      ? "ring-white"
                      : "ring-transparent"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
              <input
                type="color"
                value={layerStyle.color ?? "#FFFFFF"}
                onChange={(event) =>
                  updateLayerStyle({ color: event.target.value })
                }
                className="h-7 w-10 cursor-pointer rounded-lg border-0 bg-transparent"
                aria-label="Custom color"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0 rounded-[1.25rem] bg-white p-2 ring-1 ring-blue-100">
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
          {creatorStudioTextLayers.map((layer) => {
            const selected = selectedLayer === layer.value;
            const preview = getCreatorStudioLayerText(design, layer.value);

            return (
              <button
                key={layer.value}
                type="button"
                onClick={() => {
                  setSelectedLayer(layer.value);
                  setShowTextPopover(false);
                }}
                className={`min-h-11 min-w-[7.5rem] shrink-0 rounded-2xl px-3 text-left ring-1 transition ${
                  selected
                    ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                    : "bg-blue-50 text-[#062a57] ring-blue-100"
                }`}
              >
                <span className="block text-[10px] font-black uppercase tracking-[0.12em] opacity-80">
                  {layer.label}
                </span>
                <span className="mt-0.5 block truncate text-xs font-bold">
                  {preview.trim() || `Add ${layer.label.toLowerCase()}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        {(
          [
            { value: "style", label: "Style" },
            { value: "layout", label: "Layout" },
            { value: "colors", label: "Colors" },
            { value: "media", label: "Media" },
            { value: "scripture", label: "Scripture" },
            { value: "ai", label: "AI" },
            { value: "templates", label: "Templates" },
          ] as const
        ).map((panel) => (
          <button
            key={panel.value}
            type="button"
            onClick={() => toggleDrawer(panel.value)}
            className={`min-h-10 shrink-0 rounded-full px-4 text-xs font-black ring-1 ${
              drawerPanel === panel.value
                ? "bg-[#062a57] text-white ring-[#062a57]"
                : "bg-white text-slate-600 ring-blue-100"
            }`}
          >
            {panel.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowAllTextSheet(true)}
          className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full bg-blue-50 px-4 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100"
        >
          <Type className="h-3.5 w-3.5" /> All text
        </button>
      </div>

      {drawerPanel && (
        <div className="fixed inset-x-0 bottom-0 z-50 max-h-[min(72dvh,34rem)] overflow-hidden rounded-t-[1.5rem] bg-white shadow-2xl ring-1 ring-blue-100">
          <div className="flex items-center justify-between border-b border-blue-100 px-4 py-3">
            <p className="text-sm font-black capitalize text-[#062a57]">
              {drawerPanel}
            </p>
            <button
              type="button"
              onClick={() => setDrawerPanel(null)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-[#0b63ce]"
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[calc(min(72dvh,34rem)-3.5rem)] overflow-y-auto p-3 sm:p-4">
            <CreatorStudioLayoutEditor
              compact
              design={design}
              onChange={onChange}
              videoFileName={videoFileName}
              photoFileName={photoFileName}
              onVideoSelect={onVideoSelect}
              onPhotoSelect={onPhotoSelect}
              onRemoveVideo={onRemoveVideo}
              onRemovePhoto={onRemovePhoto}
              activePanel={drawerPanel}
              onPanelChange={setDrawerPanel}
              aiControls={aiControls}
            />
          </div>
        </div>
      )}

      {showAllTextSheet && !drawerPanel && (
        <div className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 rounded-[1.25rem] bg-white p-4 shadow-2xl ring-1 ring-blue-100 sm:inset-x-auto sm:right-4 sm:w-[min(100%,24rem)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-black text-[#062a57]">Edit all text</p>
            <button
              type="button"
              onClick={() => setShowAllTextSheet(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-[#0b63ce]"
              aria-label="Close text editor"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid max-h-[50dvh] gap-3 overflow-y-auto">
            {creatorStudioTextLayers.map((layer) => (
              <label
                key={layer.value}
                className="block text-[10px] font-black uppercase tracking-[0.12em] text-[#0b63ce]"
              >
                {layer.label}
                {layer.value === "caption" ? (
                  <textarea
                    value={getCreatorStudioLayerText(design, layer.value)}
                    onChange={(event) =>
                      onChange(
                        buildCreatorStudioLayerTextUpdate(
                          layer.value,
                          event.target.value
                        )
                      )
                    }
                    rows={3}
                    className="mt-1.5 w-full resize-none rounded-xl border border-blue-100 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce]"
                  />
                ) : (
                  <input
                    value={getCreatorStudioLayerText(design, layer.value)}
                    onChange={(event) =>
                      onChange(
                        buildCreatorStudioLayerTextUpdate(
                          layer.value,
                          event.target.value
                        )
                      )
                    }
                    className="mt-1.5 w-full rounded-xl border border-blue-100 px-3 py-2 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce]"
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-[1rem] bg-blue-50/80 px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.12em] text-blue-400">
        Tap a layer on the canvas or use the strip below ·{" "}
        <Sparkles className="mr-1 inline h-3 w-3" />
        AI writing stays editable
      </div>
    </div>
  );
}
