"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Layers,
  Minus,
  MoreHorizontal,
  Plus,
  Upload,
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
import type { CreatorStudioEditorPanel } from "./CreatorStudioLayoutEditor";
import CreatorStudioSuggestionChips from "./CreatorStudioSuggestionChips";
import HTBFWatermark from "./HTBFWatermark";

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
  onOpenOverflow?: (panel: CreatorStudioEditorPanel) => void;
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
      <HTBFWatermark />
    </>
  );
}

function layerUsesMultiline(layer: CreatorStudioTextLayer) {
  return layer === "caption" || layer === "scripture";
}

function usesSerifTypography(design: CreatorStudioDesign) {
  const hint = `${design.typographyPairing ?? ""} ${design.typographyStyle ?? ""} ${design.visualTheme ?? ""}`.toLowerCase();
  return hint.includes("serif") || hint.includes("journal") || hint.includes("magazine");
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
  onOpenOverflow,
}: CreatorStudioInteractiveCanvasProps) {
  const reducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [editingLayer, setEditingLayer] =
    useState<CreatorStudioTextLayer | null>(null);

  const accentColor = getCreatorStudioAccentColor(design);
  const serifClass = usesSerifTypography(design) ? "font-serif" : "font-sans";
  const paletteSwatches = useMemo(
    () =>
      [
        design.textStyle?.color,
        ...(design.colorPalette ?? []),
        "#FFFFFF",
        "#D4AF37",
        "#062A57",
      ].filter((color): color is string => Boolean(color)),
    [design.colorPalette, design.textStyle?.color]
  );

  const sortedLayers = useMemo(
    () =>
      [...creatorStudioTextLayers].sort((left, right) => {
        const leftOrder =
          getCreatorStudioLayerStyle(design, left.value).layerOrder ?? 0;
        const rightOrder =
          getCreatorStudioLayerStyle(design, right.value).layerOrder ?? 0;

        return leftOrder - rightOrder;
      }),
    [design]
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

  function renderFloatingToolbar(layer: CreatorStudioTextLayer) {
    const layerStyle = getCreatorStudioLayerStyle(design, layer);

    return (
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 6, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-auto absolute -top-12 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#031d3d]/92 px-1.5 py-1 shadow-xl shadow-black/25 ring-1 ring-white/15 backdrop-blur-md"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Smaller"
          onClick={() =>
            updateLayerStyle(layer, {
              fontScale: Math.max(0.75, (layerStyle.fontScale ?? 1) - 0.05),
            })
          }
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Larger"
          onClick={() =>
            updateLayerStyle(layer, {
              fontScale: Math.min(1.5, (layerStyle.fontScale ?? 1) + 0.05),
            })
          }
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <span className="mx-0.5 h-5 w-px bg-white/15" />
        {paletteSwatches.slice(0, 4).map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Color ${color}`}
            onClick={() => updateLayerStyle(layer, { color })}
            className={`h-6 w-6 rounded-full ring-2 ${
              layerStyle.color === color ? "ring-white" : "ring-transparent"
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
        <span className="mx-0.5 h-5 w-px bg-white/15" />
        <button
          type="button"
          aria-label="Align left"
          onClick={() => updateLayerStyle(layer, { align: "left" })}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
            layerStyle.align === "left" ? "bg-[#0b63ce] text-white" : "text-white/90 hover:bg-white/10"
          }`}
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Align center"
          onClick={() => updateLayerStyle(layer, { align: "center" })}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
            layerStyle.align === "center" ? "bg-[#0b63ce] text-white" : "text-white/90 hover:bg-white/10"
          }`}
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Align right"
          onClick={() => updateLayerStyle(layer, { align: "right" })}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
            layerStyle.align === "right" ? "bg-[#0b63ce] text-white" : "text-white/90 hover:bg-white/10"
          }`}
        >
          <AlignRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="More options"
          onClick={() => onOpenOverflow?.("advanced")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </motion.div>
    );
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
        ? "Tap to write your headline"
        : layer === "overlay"
          ? "Tap to add a subtitle"
          : layer === "caption"
            ? "Tap to add your story"
            : layer === "scripture"
              ? "Scripture reference"
              : "Call to action";

    const layerPositionStyle: CSSProperties = {
      left: `${typography.coordinates.x}%`,
      top: `${typography.coordinates.y}%`,
      transform: typography.transform,
      maxWidth: "min(88%, 22rem)",
      touchAction: isEditing ? "auto" : "none",
      zIndex: 10 + (layerStyle.layerOrder ?? 0) + (isSelected ? 20 : 0),
    };

    const textClassName = `w-full whitespace-pre-wrap break-words leading-snug ${serifClass} ${typography.weightClass} ${typography.italicClass} ${typography.alignClass} ${typography.styledSizeClass}`;

    const inputClassName = `${textClassName} resize-none overflow-hidden border-0 bg-transparent p-0 outline-none ring-0`;

    return (
      <motion.div
        key={layer}
        layout={!reducedMotion}
        className="absolute"
        style={layerPositionStyle}
        onPointerDown={(event) => beginLayerInteraction(layer, event)}
        onPointerMove={moveLayerInteraction}
        onPointerUp={(event) => endLayerInteraction(layer, event)}
        onPointerCancel={(event) => endLayerInteraction(layer, event)}
      >
        <div
          className={`relative rounded-xl px-1 py-0.5 transition-shadow duration-300 ${
            isSelected
              ? "ring-2 ring-[#93c5fd] ring-offset-2 ring-offset-[#031d3d]/40 shadow-[0_0_0_1px_rgba(147,197,253,0.35)]"
              : "ring-1 ring-transparent hover:ring-white/25"
          }`}
        >
          {isSelected && !isEditing && renderFloatingToolbar(layer)}

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
                className={`${inputClassName} min-w-[10rem] rounded-xl bg-black/25 px-3 py-2 backdrop-blur-md`}
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
                className={`${inputClassName} min-w-[8rem] rounded-xl bg-black/25 px-3 py-2 backdrop-blur-md`}
                style={typography.inlineStyle}
              />
            )
          ) : (
            <div style={typography.inlineStyle} className={textClassName}>
              {text.trim() || (
                <span className="text-white/45">{placeholder}</span>
              )}
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="mx-auto min-w-0 max-w-4xl">
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative min-w-0 overflow-hidden rounded-[1.75rem] bg-[#031d3d] shadow-2xl shadow-blue-950/20 ring-1 ring-white/10"
      >
        <div
          ref={canvasRef}
          className="relative isolate min-h-[min(78dvh,46rem)] w-full sm:min-h-[42rem]"
        >
          <CanvasBackground
            templateId={design.templateId}
            photoPreviewUrl={photoPreviewUrl}
            videoPreviewUrl={videoPreviewUrl}
            generatedImageUrl={design.generatedImageUrl}
            backgroundColor={design.colorPalette?.[0]?.trim() || "#062a57"}
          />

          <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between gap-2 p-3 sm:p-4">
            <div className="pointer-events-auto flex flex-wrap gap-2">
              {showChangeConcept && onChangeConcept && (
                <button
                  type="button"
                  onClick={onChangeConcept}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-black/30 px-3.5 text-[11px] font-semibold text-white backdrop-blur-md ring-1 ring-white/15 transition hover:bg-black/45"
                >
                  <Layers className="h-3.5 w-3.5" />
                  Browse directions
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={onContinueToPublish}
              className="pointer-events-auto inline-flex min-h-10 items-center gap-2 rounded-full bg-white/95 px-4 text-xs font-black text-[#062a57] shadow-lg shadow-black/15 backdrop-blur-md transition hover:bg-white"
            >
              Ready to share
              <Upload className="h-3.5 w-3.5" />
            </button>
          </div>

          <div
            className="absolute inset-0 z-10"
            onPointerDown={() => setEditingLayer(null)}
          >
            {sortedLayers.map((entry) => renderLayer(entry.value))}
          </div>

          <CreatorStudioSuggestionChips
            design={design}
            onChange={onChange}
            onFocusLayer={(layer) => {
              onSelectLayer(layer);
              setEditingLayer(layer);
            }}
          />
        </div>
      </motion.div>

      <p className="mt-3 px-1 text-center text-xs font-medium leading-5 text-slate-500">
        Tap any text to edit. Drag to move. Pinch-friendly sizing on the floating
        toolbar.
      </p>
    </div>
  );
}
