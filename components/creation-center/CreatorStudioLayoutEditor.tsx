"use client";

import type { ReactNode } from "react";
import {
  buildCreatorStudioLayerStyleUpdate,
  creationCenterStoryTemplates,
  creatorStudioLayoutOptions,
  getCreatorStudioLayerStyle,
  type CreationCenterTemplateId,
  type CreatorStudioDesign,
  type CreatorStudioLayerStyle,
  type CreatorStudioTextLayer,
} from "../../lib/creationCenter";
import CreatorStudioAdvancedControls from "./CreatorStudioAdvancedControls";
import CreatorStudioLayerAiRewrite from "./CreatorStudioLayerAiRewrite";
import CreatorStudioStoryCoach from "./CreatorStudioStoryCoach";
import CreatorStudioTextStylePresetPicker from "./CreatorStudioTextStylePresetPicker";

export type CreatorStudioEditorPanel =
  | "text"
  | "fonts"
  | "colors"
  | "ai"
  | "advanced"
  | "style"
  | "layout"
  | "media"
  | "scripture"
  | "templates";

type CreatorStudioLayoutEditorProps = {
  design: CreatorStudioDesign;
  onChange: (updates: Partial<CreatorStudioDesign>) => void;
  videoFileName: string | null;
  photoFileName: string | null;
  onVideoSelect: (file: File | null) => void;
  onPhotoSelect: (file: File | null) => void;
  onRemoveVideo: () => void;
  onRemovePhoto: () => void;
  activePanel?: CreatorStudioEditorPanel;
  onPanelChange?: (panel: CreatorStudioEditorPanel) => void;
  onContinueToPublish?: () => void;
  aiControls?: ReactNode;
  compact?: boolean;
  selectedLayer?: CreatorStudioTextLayer;
  showTextStyleLibrary?: boolean;
};

const editorPanels: { value: CreatorStudioEditorPanel; label: string }[] = [
  { value: "text", label: "Edit Text" },
  { value: "fonts", label: "Fonts" },
  { value: "colors", label: "Colors" },
  { value: "ai", label: "AI Rewrite" },
  { value: "advanced", label: "Advanced" },
  { value: "layout", label: "Layout" },
  { value: "media", label: "Media" },
  { value: "scripture", label: "Scripture" },
  { value: "templates", label: "Templates" },
];

const colorOptions = [
  "#FFFFFF",
  "#F8FAFC",
  "#D4AF37",
  "#93C5FD",
  "#0B1D3A",
  "#062A57",
  "#22C55E",
  "#F97316",
];

const scriptureReferenceOptions = [
  "John 8:36",
  "Psalm 23:1",
  "Philippians 4:6-7",
  "Isaiah 41:10",
  "Romans 8:28",
];

function isHexColor(value: string | undefined): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function getSafeColor(value: string | undefined, fallback: string) {
  return isHexColor(value) ? value.trim() : fallback;
}

function getTextStyle(design: CreatorStudioDesign) {
  return {
    fontSize: design.textStyle?.fontSize ?? "large",
    fontScale: design.textStyle?.fontScale ?? 1,
    weight: design.textStyle?.weight ?? "bold",
    italic: design.textStyle?.italic ?? false,
    align: design.textStyle?.align ?? "left",
    color: getSafeColor(design.textStyle?.color, "#FFFFFF"),
    position: design.textStyle?.position ?? "bottom",
  };
}

function getPaletteColor(palette: string[], index: number, fallback: string) {
  return palette[index] ?? fallback;
}

export default function CreatorStudioLayoutEditor({
  design,
  onChange,
  videoFileName,
  photoFileName,
  onVideoSelect,
  onPhotoSelect,
  onRemoveVideo,
  onRemovePhoto,
  activePanel = "style",
  onPanelChange,
  onContinueToPublish,
  aiControls,
  compact = false,
  selectedLayer = "title",
  showTextStyleLibrary = true,
}: CreatorStudioLayoutEditorProps) {
  const textStyle = getTextStyle(design);
  const layerStyle = getCreatorStudioLayerStyle(design, selectedLayer);
  const safePalette = design.colorPalette?.filter(isHexColor) ?? [];
  const palette = safePalette.length
    ? safePalette
    : ["#FFFFFF", "#D4AF37", "#0B1D3A"];

  function updateTextStyle(
    updates: Partial<NonNullable<CreatorStudioDesign["textStyle"]>>
  ) {
    onChange({
      textStyle: {
        ...textStyle,
        ...updates,
      },
    });
  }

  function updatePalette(index: number, color: string) {
    const nextPalette = [...palette];
    nextPalette[index] = color;
    onChange({ colorPalette: nextPalette });
  }

  function updateLayerStyle(
    updates: Partial<typeof layerStyle>
  ) {
    onChange(buildCreatorStudioLayerStyleUpdate(design, selectedLayer, updates));
  }

  function suggestScriptureReference() {
    const currentIndex = scriptureReferenceOptions.findIndex(
      (reference) => reference === design.scriptureSuggestion
    );
    const nextReference =
      scriptureReferenceOptions[
        (currentIndex + 1) % scriptureReferenceOptions.length
      ];
    onChange({ scriptureSuggestion: nextReference });
  }

  const resolvedPanel = activePanel === "style" ? "fonts" : activePanel;

  return (
    <section
      className={
        compact
          ? "min-w-0"
          : "min-w-0 overflow-hidden rounded-[2rem] bg-white shadow-xl shadow-blue-950/10 ring-1 ring-blue-100"
      }
    >
      {!compact && (
      <div className="border-b border-blue-100 px-4 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#0b63ce]">
              Design editor
            </div>
            <h4 className="mt-1 text-xl font-black text-[#062a57]">
              Refine your post
            </h4>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              Edit writing and style here. The preview updates as you type.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-100">
            Live sync
          </span>
        </div>
      </div>
      )}

      <div className={compact ? "min-w-0" : "space-y-5 p-4 sm:p-6"}>
        {!compact && (
        <div className="rounded-[1.5rem] bg-blue-50/70 p-4 ring-1 ring-blue-100 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h5 className="text-sm font-black text-[#062a57]">Edit Text</h5>
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0b63ce]">
              All fields sync to preview
            </span>
          </div>

          <div className="mt-4 grid gap-4">
            <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
              Title
              <input
                value={design.title}
                onChange={(event) => onChange({ title: event.target.value })}
                placeholder="Headline for your story"
                className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
              Subtitle / overlay text
              <textarea
                value={design.overlayText}
                onChange={(event) =>
                  onChange({ overlayText: event.target.value })
                }
                rows={3}
                placeholder="The main line people see on your design"
                className="mt-2 w-full resize-none rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base font-semibold normal-case leading-7 tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
              Caption
              <textarea
                value={design.caption}
                onChange={(event) => onChange({ caption: event.target.value })}
                rows={4}
                placeholder="Supporting story text for review and feed"
                className="mt-2 w-full resize-none rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base font-semibold normal-case leading-7 tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                Scripture reference
                <input
                  value={design.scriptureSuggestion}
                  onChange={(event) =>
                    onChange({ scriptureSuggestion: event.target.value })
                  }
                  placeholder="Reference only, e.g. John 8:36"
                  className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                Call to action
                <input
                  value={design.callToAction ?? ""}
                  onChange={(event) =>
                    onChange({ callToAction: event.target.value })
                  }
                  placeholder="Share what God has done"
                  className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                />
              </label>
            </div>
          </div>
        </div>
        )}

        {!compact && (
        <div>
          <div className="flex w-full max-w-full gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
            {editorPanels.map((panel) => {
              const selected = activePanel === panel.value;

              return (
                <button
                  key={panel.value}
                  type="button"
                  onClick={() => onPanelChange?.(panel.value)}
                  className={`min-h-11 shrink-0 rounded-full px-4 text-xs font-black ring-1 transition ${
                    selected
                      ? "bg-[#0b63ce] text-white ring-[#0b63ce] shadow-lg shadow-blue-900/15"
                      : "bg-white text-slate-600 ring-blue-100 hover:bg-blue-50"
                  }`}
                >
                  {panel.label}
                </button>
              );
            })}
          </div>
        </div>
        )}

          <div className={compact ? "min-w-0" : "mt-4 rounded-[1.5rem] bg-white p-4 ring-1 ring-blue-100 sm:p-5"}>
            {compact && resolvedPanel === "text" && (
              <div className="grid gap-4">
                <p className="text-xs font-semibold leading-5 text-slate-500">
                  Your testimony stays in your voice. Edit freely — nothing is
                  replaced without your permission.
                </p>
                <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                  Title
                  <input
                    value={design.title}
                    onChange={(event) => onChange({ title: event.target.value })}
                    placeholder="Headline for your story"
                    className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                  />
                </label>

                <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                  Subtitle / overlay text
                  <textarea
                    value={design.overlayText}
                    onChange={(event) =>
                      onChange({ overlayText: event.target.value })
                    }
                    rows={3}
                    placeholder="The main line people see on your design"
                    className="mt-2 w-full resize-none rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base font-semibold normal-case leading-7 tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                  />
                </label>

                <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                  Caption
                  <textarea
                    value={design.caption}
                    onChange={(event) => onChange({ caption: event.target.value })}
                    rows={4}
                    placeholder="Supporting story text"
                    className="mt-2 w-full resize-none rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base font-semibold normal-case leading-7 tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                    Scripture reference
                    <input
                      value={design.scriptureSuggestion}
                      onChange={(event) =>
                        onChange({ scriptureSuggestion: event.target.value })
                      }
                      placeholder="Reference only, e.g. John 8:36"
                      className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                    />
                  </label>

                  <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                    Call to action
                    <input
                      value={design.callToAction ?? ""}
                      onChange={(event) =>
                        onChange({ callToAction: event.target.value })
                      }
                      placeholder="Share what God has done"
                      className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                </div>
              </div>
            )}

            {resolvedPanel === "fonts" && compact && (
              <div className="grid gap-4 sm:grid-cols-2">
                {showTextStyleLibrary && (
                  <div className="sm:col-span-2">
                    <CreatorStudioTextStylePresetPicker
                      layerStyle={layerStyle}
                      selectedLayer={selectedLayer}
                      onApply={(updates) => updateLayerStyle(updates)}
                      compact
                    />
                  </div>
                )}

                <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce] sm:col-span-2">
                  Font size
                  <div className="mt-3 flex items-center gap-4">
                    <input
                      type="range"
                      min={0.55}
                      max={2.2}
                      step={0.05}
                      value={layerStyle.fontScale ?? 1}
                      onChange={(event) =>
                        updateLayerStyle({
                          fontScale: Number(event.target.value),
                        })
                      }
                      className="w-full accent-[#0b63ce]"
                    />
                    <span className="w-12 shrink-0 text-sm font-black text-[#062a57]">
                      {Math.round((layerStyle.fontScale ?? 1) * 100)}%
                    </span>
                  </div>
                </label>

                <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                  Text size preset
                  <select
                    value={layerStyle.fontSize ?? "large"}
                    onChange={(event) =>
                      updateLayerStyle({
                        fontSize: event.target.value as NonNullable<
                          CreatorStudioDesign["textStyle"]
                        >["fontSize"],
                      })
                    }
                    className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                    <option value="hero">Hero</option>
                  </select>
                </label>

                <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateLayerStyle({
                        weight:
                          layerStyle.weight === "bold" ? "regular" : "bold",
                      })
                    }
                    className={`min-h-12 rounded-2xl px-4 text-sm font-black ring-1 transition ${
                      layerStyle.weight === "bold"
                        ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                        : "bg-white text-[#0b63ce] ring-blue-100 hover:bg-blue-50"
                    }`}
                  >
                    Bold
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateLayerStyle({ italic: !layerStyle.italic })
                    }
                    className={`min-h-12 rounded-2xl px-4 text-sm font-black ring-1 transition ${
                      layerStyle.italic
                        ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                        : "bg-white text-[#0b63ce] ring-blue-100 hover:bg-blue-50"
                    }`}
                  >
                    Italic
                  </button>
                </div>
              </div>
            )}

            {resolvedPanel === "fonts" && !compact && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce] sm:col-span-2">
                  Font size
                  <div className="mt-3 flex items-center gap-4">
                    <input
                      type="range"
                      min={0.55}
                      max={2.2}
                      step={0.05}
                      value={textStyle.fontScale ?? 1}
                      onChange={(event) =>
                        updateTextStyle({
                          fontScale: Number(event.target.value),
                        })
                      }
                      className="w-full accent-[#0b63ce]"
                    />
                    <span className="w-12 shrink-0 text-sm font-black text-[#062a57]">
                      {Math.round((textStyle.fontScale ?? 1) * 100)}%
                    </span>
                  </div>
                </label>

                <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                  Font preset
                  <select
                    value={textStyle.fontSize}
                    onChange={(event) =>
                      updateTextStyle({
                        fontSize: event.target.value as NonNullable<
                          CreatorStudioDesign["textStyle"]
                        >["fontSize"],
                      })
                    }
                    className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                    <option value="hero">Hero</option>
                  </select>
                </label>

                <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateTextStyle({
                        weight:
                          textStyle.weight === "bold" ? "regular" : "bold",
                      })
                    }
                    className={`min-h-12 rounded-2xl px-4 text-sm font-black ring-1 transition ${
                      textStyle.weight === "bold"
                        ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                        : "bg-white text-[#0b63ce] ring-blue-100 hover:bg-blue-50"
                    }`}
                  >
                    Bold
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateTextStyle({ italic: !textStyle.italic })
                    }
                    className={`min-h-12 rounded-2xl px-4 text-sm font-black ring-1 transition ${
                      textStyle.italic
                        ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                        : "bg-white text-[#0b63ce] ring-blue-100 hover:bg-blue-50"
                    }`}
                  >
                    Italic
                  </button>
                </div>
              </div>
            )}

            {resolvedPanel === "layout" && (
              <div className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {creatorStudioLayoutOptions.map((option) => {
                    const selected = design.layoutType === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onChange({ layoutType: option.value })}
                        className={`min-h-12 rounded-2xl px-4 py-3 text-left text-sm font-black ring-1 transition ${
                          selected
                            ? "bg-[#0b63ce] text-white ring-[#0b63ce] shadow-lg shadow-blue-900/15"
                            : "bg-white text-[#062a57] ring-blue-100 hover:bg-blue-50"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                  Text position
                  <select
                    value={textStyle.position}
                    onChange={(event) =>
                      updateTextStyle({
                        position: event.target.value as NonNullable<
                          CreatorStudioDesign["textStyle"]
                        >["position"],
                      })
                    }
                    className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="top">Top</option>
                    <option value="center">Center</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </label>
              </div>
            )}

            {resolvedPanel === "colors" && (
              <div className="grid gap-5">
                <p className="text-xs font-semibold leading-5 text-slate-500">
                  Colors apply to the selected text layer on your canvas.
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    { label: "Background", index: 0, fallback: "#0B1D3A" },
                    { label: "Accent", index: 2, fallback: "#D4AF37" },
                  ].map((item) => (
                    <label
                      key={item.label}
                      className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]"
                    >
                      {item.label}
                      <input
                        type="color"
                        value={getPaletteColor(
                          palette,
                          item.index,
                          item.fallback
                        )}
                        onChange={(event) =>
                          updatePalette(item.index, event.target.value)
                        }
                        className="mt-2 h-12 w-full cursor-pointer rounded-2xl border border-blue-100 bg-white p-1 outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                      />
                    </label>
                  ))}
                  <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                    Text color
                    <input
                      type="color"
                      value={layerStyle.color ?? textStyle.color}
                      onChange={(event) =>
                        compact
                          ? updateLayerStyle({ color: event.target.value })
                          : updateTextStyle({ color: event.target.value })
                      }
                      className="mt-2 h-12 w-full cursor-pointer rounded-2xl border border-blue-100 bg-white p-1 outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                </div>

                <div>
                  <div className="text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                    Quick palette
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[...new Set([...palette, ...colorOptions])].map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() =>
                          compact
                            ? updateLayerStyle({ color })
                            : updateTextStyle({ color })
                        }
                        className={`h-10 w-10 rounded-full ring-2 transition ${
                          (layerStyle.color ?? textStyle.color).toLowerCase() ===
                          color.toLowerCase()
                            ? "scale-110 ring-[#0b63ce] ring-offset-2"
                            : "ring-white shadow-sm hover:scale-105"
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Use ${color}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {resolvedPanel === "media" && (
              <div className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-blue-50 px-4 py-4 ring-1 ring-blue-100">
                    <div className="text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                      Video
                    </div>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                      {videoFileName ?? "Upload a video as the main visual."}
                    </p>
                    <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-white px-4 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100">
                      {videoFileName ? "Replace video" : "Choose video"}
                      <input
                        type="file"
                        accept="video/*"
                        className="sr-only"
                        onChange={(event) =>
                          onVideoSelect(event.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                    {videoFileName && (
                      <button
                        type="button"
                        onClick={onRemoveVideo}
                        className="mt-2 block text-xs font-black text-red-500"
                      >
                        Remove video
                      </button>
                    )}
                  </div>

                  <div className="rounded-2xl bg-blue-50 px-4 py-4 ring-1 ring-blue-100">
                    <div className="text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                      Photo
                    </div>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                      {photoFileName ?? "Upload a photo as the main visual."}
                    </p>
                    <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-white px-4 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100">
                      {photoFileName ? "Replace photo" : "Choose photo"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(event) =>
                          onPhotoSelect(event.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                    {photoFileName && (
                      <button
                        type="button"
                        onClick={onRemovePhoto}
                        className="mt-2 block text-xs font-black text-red-500"
                      >
                        Remove photo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {resolvedPanel === "scripture" && (
              <div className="grid gap-4">
                <p className="text-sm font-semibold leading-6 text-slate-600">
                  Scripture references appear on your design. HTBF uses
                  references only — not full verse text.
                </p>
                <button
                  type="button"
                  onClick={suggestScriptureReference}
                  className="min-h-12 rounded-2xl bg-[#0b63ce] px-4 text-sm font-black text-white shadow-lg shadow-blue-900/15"
                >
                  Suggest a reference
                </button>
              </div>
            )}

            {resolvedPanel === "ai" && (
              <div className="grid gap-3">
                <p className="text-xs font-semibold leading-5 text-slate-500">
                  AI suggestions are optional. Your testimony stays yours.
                </p>
                <CreatorStudioLayerAiRewrite
                  design={design}
                  selectedLayer={selectedLayer ?? "title"}
                  onChange={onChange}
                />
                {aiControls}
              </div>
            )}

            {resolvedPanel === "advanced" && (
              <div className="grid gap-6">
                <CreatorStudioAdvancedControls
                  design={design}
                  selectedLayer={selectedLayer}
                  onChange={onChange}
                />

                <CreatorStudioStoryCoach
                  design={design}
                  onApplyTitle={(title) => onChange({ title })}
                  onApplyScripture={(reference) =>
                    onChange({ scriptureSuggestion: reference })
                  }
                />

                <div className="grid gap-4 border-t border-blue-100 pt-4">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                    Layout
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {creatorStudioLayoutOptions.map((option) => {
                      const selected = design.layoutType === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onChange({ layoutType: option.value })}
                          className={`min-h-12 rounded-2xl px-4 py-3 text-left text-sm font-black ring-1 transition ${
                            selected
                              ? "bg-[#0b63ce] text-white ring-[#0b63ce] shadow-lg shadow-blue-900/15"
                              : "bg-white text-[#062a57] ring-blue-100 hover:bg-blue-50"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-4 border-t border-blue-100 pt-4">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                    Media & backgrounds
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl bg-blue-50 px-4 py-4 ring-1 ring-blue-100">
                      <div className="text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                        Video
                      </div>
                      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                        {videoFileName ?? "Upload a video as the main visual."}
                      </p>
                      <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-white px-4 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100">
                        {videoFileName ? "Replace video" : "Choose video"}
                        <input
                          type="file"
                          accept="video/*"
                          className="sr-only"
                          onChange={(event) =>
                            onVideoSelect(event.target.files?.[0] ?? null)
                          }
                        />
                      </label>
                      {videoFileName && (
                        <button
                          type="button"
                          onClick={onRemoveVideo}
                          className="mt-2 block text-xs font-black text-red-500"
                        >
                          Remove video
                        </button>
                      )}
                    </div>

                    <div className="rounded-2xl bg-blue-50 px-4 py-4 ring-1 ring-blue-100">
                      <div className="text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                        Photo
                      </div>
                      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                        {photoFileName ?? "Upload a photo as the main visual."}
                      </p>
                      <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-white px-4 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100">
                        {photoFileName ? "Replace photo" : "Choose photo"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          onChange={(event) =>
                            onPhotoSelect(event.target.files?.[0] ?? null)
                          }
                        />
                      </label>
                      {photoFileName && (
                        <button
                          type="button"
                          onClick={onRemovePhoto}
                          className="mt-2 block text-xs font-black text-red-500"
                        >
                          Remove photo
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => onChange({ templateId: "none" })}
                      className={`min-h-12 rounded-2xl px-4 text-left text-xs font-black ring-1 ${
                        design.templateId === "none"
                          ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                          : "bg-white text-[#062a57] ring-blue-100"
                      }`}
                    >
                      No template / AI background
                    </button>
                    {creationCenterStoryTemplates
                      .filter((template) => template.imagePath)
                      .map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() =>
                            onChange({
                              templateId: template.id as CreationCenterTemplateId,
                            })
                          }
                          className={`min-h-12 rounded-2xl px-4 text-left text-xs font-black ring-1 ${
                            design.templateId === template.id
                              ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                              : "bg-white text-[#062a57] ring-blue-100"
                          }`}
                        >
                          {template.label}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {resolvedPanel === "templates" && (
              <div className="grid gap-3">
                <p className="text-sm font-semibold leading-6 text-slate-600">
                  Background templates are optional. Your edited text stays
                  intact when you switch backgrounds.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => onChange({ templateId: "none" })}
                    className={`min-h-12 rounded-2xl px-4 text-left text-xs font-black ring-1 ${
                      design.templateId === "none"
                        ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                        : "bg-white text-[#062a57] ring-blue-100"
                    }`}
                  >
                    No template / AI background
                  </button>
                  {creationCenterStoryTemplates
                    .filter((template) => template.imagePath)
                    .map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() =>
                          onChange({
                            templateId: template.id as CreationCenterTemplateId,
                          })
                        }
                        className={`min-h-12 rounded-2xl px-4 text-left text-xs font-black ring-1 ${
                          design.templateId === template.id
                            ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                            : "bg-white text-[#062a57] ring-blue-100"
                        }`}
                      >
                        {template.label}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

        {onContinueToPublish && !compact && (
          <button
            type="button"
            onClick={onContinueToPublish}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#062a57] px-5 text-sm font-black text-white shadow-lg shadow-blue-950/15 transition hover:bg-[#0b63ce]"
          >
            Continue to Publish
          </button>
        )}
      </div>
    </section>
  );
}
