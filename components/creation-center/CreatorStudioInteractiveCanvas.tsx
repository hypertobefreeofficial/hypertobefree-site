"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  EyeOff,
  Minus,
  Plus,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  buildCreatorStudioLayerDisplayTextUpdate,
  buildCreatorStudioLayerStyleUpdate,
  creatorStudioTextLayers,
  getCreationCenterTemplate,
  getCreatorStudioLayerDisplayText,
  getCreatorStudioLayerStyle,
  type CreationCenterTemplateId,
  type CreatorStudioDesign,
  type CreatorStudioLayerStyle,
  type CreatorStudioTextLayer,
} from "../../lib/creationCenter";
import {
  buildCreatorStudioLayerTypography,
  getCreatorStudioAccentColor,
} from "../../lib/creatorStudioCanvasRender";

type CreatorStudioInteractiveCanvasProps = {
  design: CreatorStudioDesign;
  onChange: (updates: Partial<CreatorStudioDesign>) => void;
  videoPreviewUrl: string | null;
  photoPreviewUrl: string | null;
  selectedLayer: CreatorStudioTextLayer;
  onSelectLayer: (layer: CreatorStudioTextLayer) => void;
  onContinueToPublish: () => void;
  onChangeConcept?: () => void;
  showChangeConcept?: boolean;
};

type DragState = {
  layer: CreatorStudioTextLayer;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
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

function CanvasBackground({
  templateId,
  photoPreviewUrl,
  videoPreviewUrl,
  generatedImageUrl,
  backgroundColor,
}: {
  templateId: CreationCenterTemplateId;
  photoPreviewUrl: string | null;
  videoPreviewUrl: string | null;
  generatedImageUrl?: string | null;
  backgroundColor: string;
}) {
  const template = getCreationCenterTemplate(templateId);

  return (
    <>
      {photoPreviewUrl ? (
        <img
          src={photoPreviewUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : videoPreviewUrl ? (
        <video
          src={videoPreviewUrl}
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : generatedImageUrl ? (
        <img
          src={generatedImageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : template?.imagePath ? (
        <img
          src={template.imagePath}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#60a5fa,transparent_34%),linear-gradient(135deg,#062a57,#0b63ce_52%,#dbeafe)]"
          style={{ backgroundColor }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#031d3d]/75 via-[#062a57]/20 to-transparent" />
      <img
        src="/images/htbf-logo.png"
        alt=""
        className="pointer-events-none absolute right-3 top-3 z-20 h-7 w-auto opacity-80 sm:right-4 sm:top-4 sm:h-8"
      />
    </>
  );
}

function layerUsesMultiline(layer: CreatorStudioTextLayer) {
  return layer === "caption" || layer === "scripture";
}

export default function CreatorStudioInteractiveCanvas({
  design,
  onChange,
  videoPreviewUrl,
  photoPreviewUrl,
  selectedLayer,
  onSelectLayer,
  onContinueToPublish,
  onChangeConcept,
  showChangeConcept = false,
}: CreatorStudioInteractiveCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [editingLayer, setEditingLayer] =
    useState<CreatorStudioTextLayer | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const accentColor = getCreatorStudioAccentColor(design);
  const selectedStyle = useMemo(
    () => getCreatorStudioLayerStyle(design, selectedLayer),
    [design, selectedLayer]
  );

  useEffect(() => {
    if (!editingLayer) return;

    const node = editRef.current;
    if (!node) return;

    node.focus();
    if ("select" in node) {
      node.select();
    }
  }, [editingLayer, selectedLayer]);

  const updateLayerStyle = useCallback(
    (layer: CreatorStudioTextLayer, updates: Partial<CreatorStudioLayerStyle>) => {
      onChange(buildCreatorStudioLayerStyleUpdate(design, layer, updates));
    },
    [design, onChange]
  );

  const updateSelectedStyle = useCallback(
    (updates: Partial<CreatorStudioLayerStyle>) => {
      updateLayerStyle(selectedLayer, updates);
    },
    [selectedLayer, updateLayerStyle]
  );

  function beginLayerInteraction(
    layer: CreatorStudioTextLayer,
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    if (getCreatorStudioLayerStyle(design, layer).hidden) {
      return;
    }

    const style = getCreatorStudioLayerStyle(design, layer);
    const { x, y } = buildCreatorStudioLayerTypography(design, layer).coordinates;

    dragStateRef.current = {
      layer,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: style.x ?? x,
      originY: style.y ?? y,
      moved: false,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    onSelectLayer(layer);
  }

  function moveLayerInteraction(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragStateRef.current;
    const canvas = canvasRef.current;

    if (!drag || !canvas || drag.pointerId !== event.pointerId) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const deltaX = ((event.clientX - drag.startX) / rect.width) * 100;
    const deltaY = ((event.clientY - drag.startY) / rect.height) * 100;

    if (Math.abs(deltaX) > 0.35 || Math.abs(deltaY) > 0.35) {
      drag.moved = true;
    }

    if (!drag.moved) {
      return;
    }

    updateLayerStyle(drag.layer, {
      x: Math.min(98, Math.max(2, drag.originX + deltaX)),
      y: Math.min(98, Math.max(2, drag.originY + deltaY)),
    });
  }

  function endLayerInteraction(
    layer: CreatorStudioTextLayer,
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    const drag = dragStateRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);

    if (!drag.moved) {
      onSelectLayer(layer);
      setEditingLayer(layer);
    }

    dragStateRef.current = null;
  }

  function renderLayer(layer: CreatorStudioTextLayer) {
    const typography = buildCreatorStudioLayerTypography(design, layer);
    const layerStyle = typography.layerStyle;

    if (layerStyle.hidden) {
      return null;
    }

    const text = getCreatorStudioLayerDisplayText(design, layer);
    const isSelected = selectedLayer === layer;
    const isEditing = editingLayer === layer;
    const placeholder =
      layer === "title"
        ? "Title"
        : layer === "overlay"
          ? "Subtitle"
          : layer === "caption"
            ? "Caption"
            : layer === "scripture"
              ? "Scripture reference"
              : "Call to action";

    const layerPositionStyle: CSSProperties = {
      left: `${typography.coordinates.x}%`,
      top: `${typography.coordinates.y}%`,
      transform: typography.transform,
      maxWidth: "min(88%, 22rem)",
      touchAction: isEditing ? "auto" : "none",
    };

    const textClassName = `w-full whitespace-pre-wrap break-words leading-snug ${typography.weightClass} ${typography.italicClass} ${typography.alignClass} ${typography.styledSizeClass}`;

    const inputClassName = `${textClassName} resize-none overflow-hidden border-0 bg-transparent p-0 outline-none ring-0`;

    return (
      <div
        key={layer}
        className={`absolute z-10 ${isSelected ? "z-20" : ""}`}
        style={layerPositionStyle}
        onPointerDown={(event) => beginLayerInteraction(layer, event)}
        onPointerMove={moveLayerInteraction}
        onPointerUp={(event) => endLayerInteraction(layer, event)}
        onPointerCancel={(event) => endLayerInteraction(layer, event)}
      >
        <div
          className={`relative rounded-xl px-1 py-0.5 ${
            isSelected
              ? "ring-2 ring-[#0b63ce] ring-offset-2 ring-offset-[#031d3d]/30"
              : "ring-1 ring-transparent hover:ring-white/30"
          }`}
        >
          {layer === "callToAction" && !isEditing ? (
            <span
              className={`inline-flex rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] ${typography.alignClass}`}
              style={{
                ...typography.inlineStyle,
                backgroundColor: accentColor,
                color: "#0B1D3A",
              }}
            >
              {text.trim() || placeholder}
            </span>
          ) : layer === "scripture" && !isEditing ? (
            <div
              style={typography.inlineStyle}
              className={`rounded-2xl bg-black/45 px-3 py-2 backdrop-blur-sm ${textClassName}`}
            >
              {text.trim() || placeholder}
            </div>
          ) : layer === "caption" && !isEditing ? (
            <div
              style={typography.inlineStyle}
              className={`rounded-2xl bg-white/10 px-3 py-2 backdrop-blur-sm ${textClassName}`}
            >
              {text.trim() || placeholder}
            </div>
          ) : isEditing ? (
            layerUsesMultiline(layer) ? (
              <textarea
                ref={editRef as React.RefObject<HTMLTextAreaElement>}
                value={text}
                rows={layer === "scripture" ? 3 : 4}
                placeholder={placeholder}
                onChange={(event) =>
                  onChange(
                    buildCreatorStudioLayerDisplayTextUpdate(
                      layer,
                      event.target.value
                    )
                  )
                }
                onBlur={() => setEditingLayer(null)}
                onPointerDown={(event) => event.stopPropagation()}
                className={`${inputClassName} min-w-[10rem] rounded-lg bg-black/20 px-2 py-1 backdrop-blur-sm`}
                style={typography.inlineStyle}
              />
            ) : (
              <input
                ref={editRef as React.RefObject<HTMLInputElement>}
                value={text}
                placeholder={placeholder}
                onChange={(event) =>
                  onChange(
                    buildCreatorStudioLayerDisplayTextUpdate(
                      layer,
                      event.target.value
                    )
                  )
                }
                onBlur={() => setEditingLayer(null)}
                onPointerDown={(event) => event.stopPropagation()}
                className={`${inputClassName} min-w-[8rem] rounded-lg bg-black/20 px-2 py-1 backdrop-blur-sm`}
                style={typography.inlineStyle}
              />
            )
          ) : (
            <div style={typography.inlineStyle} className={textClassName}>
              {text.trim() || placeholder}
            </div>
          )}

          {isSelected && !isEditing && (
            <div className="pointer-events-auto absolute -bottom-3 left-1/2 flex -translate-x-1/2 gap-1">
              <button
                type="button"
                aria-label="Decrease size"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() =>
                  updateLayerStyle(layer, {
                    fontScale: Math.max(
                      0.75,
                      (layerStyle.fontScale ?? 1) - 0.05
                    ),
                  })
                }
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#031d3d] text-white ring-1 ring-white/20"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Increase size"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() =>
                  updateLayerStyle(layer, {
                    fontScale: Math.min(
                      1.5,
                      (layerStyle.fontScale ?? 1) + 0.05
                    ),
                  })
                }
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#031d3d] text-white ring-1 ring-white/20"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-w-0 max-w-4xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
          Canvas editor
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

      <div className="relative min-w-0 overflow-hidden rounded-[1.5rem] bg-[#031d3d] ring-1 ring-blue-100">
        <div
          ref={canvasRef}
          className="relative isolate min-h-[min(72dvh,44rem)] w-full sm:min-h-[40rem]"
        >
          <CanvasBackground
            templateId={design.templateId}
            photoPreviewUrl={photoPreviewUrl}
            videoPreviewUrl={videoPreviewUrl}
            generatedImageUrl={design.generatedImageUrl}
            backgroundColor={
              design.colorPalette?.[0]?.trim() || "#062a57"
            }
          />

          <div
            className="absolute inset-0 z-10"
            onPointerDown={() => setEditingLayer(null)}
          >
            {creatorStudioTextLayers.map((entry) => renderLayer(entry.value))}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-[#031d3d]/95 via-[#031d3d]/80 to-transparent px-2 pb-2 pt-8 sm:px-3">
            <div className="pointer-events-auto mx-auto max-w-xl rounded-2xl bg-[#031d3d]/95 p-2 ring-1 ring-white/10 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  aria-label="Smaller"
                  onClick={() =>
                    updateSelectedStyle({
                      fontSize: nextFontSize(selectedStyle.fontSize, -1),
                    })
                  }
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Larger"
                  onClick={() =>
                    updateSelectedStyle({
                      fontSize: nextFontSize(selectedStyle.fontSize, 1),
                    })
                  }
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Bold"
                  onClick={() =>
                    updateSelectedStyle({
                      weight:
                        selectedStyle.weight === "bold" ? "regular" : "bold",
                    })
                  }
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${
                    selectedStyle.weight === "bold"
                      ? "bg-[#0b63ce] text-white"
                      : "bg-white/10 text-white"
                  }`}
                >
                  <span className="text-sm font-black">B</span>
                </button>
                <button
                  type="button"
                  aria-label="Italic"
                  onClick={() =>
                    updateSelectedStyle({ italic: !selectedStyle.italic })
                  }
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl italic ${
                    selectedStyle.italic
                      ? "bg-[#0b63ce] text-white"
                      : "bg-white/10 text-white"
                  }`}
                >
                  <span className="text-sm font-black">I</span>
                </button>
                <button
                  type="button"
                  aria-label="Align left"
                  onClick={() => updateSelectedStyle({ align: "left" })}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${
                    selectedStyle.align === "left"
                      ? "bg-[#0b63ce] text-white"
                      : "bg-white/10 text-white"
                  }`}
                >
                  <AlignLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Align center"
                  onClick={() => updateSelectedStyle({ align: "center" })}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${
                    selectedStyle.align === "center"
                      ? "bg-[#0b63ce] text-white"
                      : "bg-white/10 text-white"
                  }`}
                >
                  <AlignCenter className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Align right"
                  onClick={() => updateSelectedStyle({ align: "right" })}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${
                    selectedStyle.align === "right"
                      ? "bg-[#0b63ce] text-white"
                      : "bg-white/10 text-white"
                  }`}
                >
                  <AlignRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Hide layer"
                  onClick={() => updateSelectedStyle({ hidden: true })}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white"
                >
                  <EyeOff className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Color"
                  onClick={() => setShowColorPicker((current) => !current)}
                  className="inline-flex h-10 min-w-10 items-center justify-center rounded-xl bg-white/10 px-2 text-[10px] font-black uppercase tracking-[0.08em] text-white"
                >
                  Color
                </button>
              </div>

              {showColorPicker && (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 border-t border-white/10 pt-2">
                  {colorSwatches.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Color ${color}`}
                      onClick={() => {
                        updateSelectedStyle({ color });
                        setShowColorPicker(false);
                      }}
                      className={`h-8 w-8 rounded-full ring-2 ${
                        selectedStyle.color === color
                          ? "ring-white"
                          : "ring-transparent"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <input
                    type="color"
                    value={selectedStyle.color ?? "#FFFFFF"}
                    onChange={(event) =>
                      updateSelectedStyle({ color: event.target.value })
                    }
                    className="h-8 w-12 cursor-pointer rounded-lg border-0 bg-transparent"
                    aria-label="Custom color"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0 rounded-[1.25rem] bg-white p-2 ring-1 ring-blue-100">
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
          {creatorStudioTextLayers.map((layer) => {
            const selected = selectedLayer === layer.value;
            const preview = getCreatorStudioLayerDisplayText(
              design,
              layer.value
            );
            const hidden = getCreatorStudioLayerStyle(design, layer.value).hidden;

            return (
              <button
                key={layer.value}
                type="button"
                onClick={() => {
                  onSelectLayer(layer.value);
                  setEditingLayer(layer.value);
                  if (hidden) {
                    updateLayerStyle(layer.value, { hidden: false });
                  }
                }}
                className={`min-h-11 min-w-[6.5rem] shrink-0 rounded-2xl px-3 text-left ring-1 transition sm:min-w-[7.5rem] ${
                  selected
                    ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                    : "bg-blue-50 text-[#062a57] ring-blue-100"
                } ${hidden ? "opacity-50" : ""}`}
              >
                <span className="block text-[10px] font-black uppercase tracking-[0.12em] opacity-80">
                  {layer.label}
                </span>
                <span className="mt-0.5 block truncate text-xs font-bold">
                  {hidden
                    ? "Hidden"
                    : preview.trim() || `Add ${layer.label.toLowerCase()}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
