"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Type,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  type TouchEvent as ReactTouchEvent,
} from "react";
import {
  buildCreatorStudioLayerDisplayTextUpdate,
  creatorStudioTextLayers,
  getCreatorStudioLayerDisplayText,
  getCreatorStudioLayerStyle,
  type CreatorStudioDesign,
  type CreatorStudioLayerStyle,
  type CreatorStudioTextLayer,
} from "../../lib/creationCenter";
import {
  buildCreatorStudioLayerTypography,
  getCreatorStudioAccentColor,
  type CreatorStudioLayerTypography,
} from "../../lib/creatorStudioCanvasRender";
import {
  clampCreatorStudioFontScale,
} from "../../lib/creatorStudioTypography";
import type { CreatorStudioEditorPanel } from "./CreatorStudioLayoutEditor";

type CreatorStudioPositionedLayersProps = {
  design: CreatorStudioDesign;
  compact?: boolean;
  hideCallToAction?: boolean;
  interactive?: boolean;
  selectedLayer?: CreatorStudioTextLayer | null;
  editingLayer?: CreatorStudioTextLayer | null;
  editRef?: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  paletteSwatches?: string[];
  onChange?: (updates: Partial<CreatorStudioDesign>) => void;
  onSelectLayer?: (layer: CreatorStudioTextLayer) => void;
  onEditingLayerChange?: (layer: CreatorStudioTextLayer | null) => void;
  onUpdateLayerStyle?: (
    layer: CreatorStudioTextLayer,
    updates: Partial<CreatorStudioLayerStyle>
  ) => void;
  onLayerPointerDown?: (
    layer: CreatorStudioTextLayer,
    event: ReactPointerEvent<HTMLDivElement>
  ) => void;
  onLayerPointerMove?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onLayerPointerUp?: (
    layer: CreatorStudioTextLayer,
    event: ReactPointerEvent<HTMLDivElement>
  ) => void;
  onOpenOverflow?: (panel: CreatorStudioEditorPanel) => void;
};

function layerUsesMultiline(layer: CreatorStudioTextLayer) {
  return layer === "caption" || layer === "scripture";
}


function getLayerPlaceholder(layer: CreatorStudioTextLayer) {
  if (layer === "title") return "Tap to write your headline";
  if (layer === "overlay") return "Tap to add a subtitle";
  if (layer === "caption") return "Tap to add your story";
  if (layer === "scripture") return "Scripture reference";
  return "Call to action";
}

function LayerContent({
  layer,
  design,
  typography,
  textClassName,
  accentColor,
  text,
  placeholder,
  isEditing,
  editRef,
  onChange,
  onEditingLayerChange,
}: {
  layer: CreatorStudioTextLayer;
  design: CreatorStudioDesign;
  typography: CreatorStudioLayerTypography;
  textClassName: string;
  accentColor: string;
  text: string;
  placeholder: string;
  isEditing: boolean;
  editRef?: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  onChange?: (updates: Partial<CreatorStudioDesign>) => void;
  onEditingLayerChange?: (layer: CreatorStudioTextLayer | null) => void;
}) {
  const inputClassName = `${textClassName} resize-none overflow-hidden border-0 bg-transparent p-0 outline-none ring-0`;

  if (layer === "callToAction" && !isEditing) {
    return (
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
    );
  }

  if (layer === "scripture" && !isEditing) {
    return (
      <div
        style={typography.inlineStyle}
        className={`rounded-2xl bg-black/45 px-3 py-2 backdrop-blur-sm ${textClassName}`}
      >
        {text.trim() || placeholder}
      </div>
    );
  }

  if (layer === "caption" && !isEditing) {
    return (
      <div
        style={typography.inlineStyle}
        className={`rounded-2xl bg-white/10 px-3 py-2 backdrop-blur-sm ${textClassName}`}
      >
        {text.trim() || placeholder}
      </div>
    );
  }

  if (isEditing && onChange) {
    if (layerUsesMultiline(layer)) {
      return (
        <textarea
          ref={editRef as RefObject<HTMLTextAreaElement>}
          value={text}
          rows={layer === "scripture" ? 3 : 4}
          placeholder={placeholder}
          onChange={(event) =>
            onChange(
              buildCreatorStudioLayerDisplayTextUpdate(layer, event.target.value)
            )
          }
          onBlur={() => onEditingLayerChange?.(null)}
          onPointerDown={(event) => event.stopPropagation()}
          className={`${inputClassName} min-w-[10rem] rounded-xl bg-black/25 px-3 py-2 backdrop-blur-md`}
          style={typography.inlineStyle}
        />
      );
    }

    return (
      <input
        ref={editRef as RefObject<HTMLInputElement>}
        value={text}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(
            buildCreatorStudioLayerDisplayTextUpdate(layer, event.target.value)
          )
        }
        onBlur={() => onEditingLayerChange?.(null)}
        onPointerDown={(event) => event.stopPropagation()}
        className={`${inputClassName} min-w-[8rem] rounded-xl bg-black/25 px-3 py-2 backdrop-blur-md`}
        style={typography.inlineStyle}
      />
    );
  }

  return (
    <div style={typography.inlineStyle} className={textClassName}>
      {text.trim() || <span className="text-white/45">{placeholder}</span>}
    </div>
  );
}

function getTouchDistance(touches: TouchList | ReactTouchEvent["touches"]) {
  if (touches.length < 2) return 0;

  const first = touches[0];
  const second = touches[1];
  if (!first || !second) return 0;

  return Math.hypot(
    first.clientX - second.clientX,
    first.clientY - second.clientY
  );
}

function ScaleResizeHandle({
  layer,
  layerStyle,
  onUpdateLayerStyle,
}: {
  layer: CreatorStudioTextLayer;
  layerStyle: CreatorStudioLayerStyle;
  onUpdateLayerStyle?: (
    layer: CreatorStudioTextLayer,
    updates: Partial<CreatorStudioLayerStyle>
  ) => void;
}) {
  const startRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    scale: number;
  } | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    startRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scale: layerStyle.fontScale ?? 1,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId) return;

    const delta =
      (event.clientX - start.x + (event.clientY - start.y) * 0.35) / 110;

    onUpdateLayerStyle?.(layer, {
      fontScale: clampCreatorStudioFontScale(start.scale + delta),
    });
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (!startRef.current || startRef.current.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    startRef.current = null;
  }

  return (
    <div
      aria-label="Drag to resize text"
      className="absolute -bottom-1.5 -right-1.5 z-40 h-4 w-4 cursor-se-resize rounded-full bg-white shadow-md ring-2 ring-[#0b63ce]"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    />
  );
}

function FloatingToolbar({
  layer,
  layerStyle,
  paletteSwatches,
  onUpdateLayerStyle,
  onOpenOverflow,
  onBeginEdit,
  reducedMotion,
}: {
  layer: CreatorStudioTextLayer;
  layerStyle: CreatorStudioLayerStyle;
  paletteSwatches: string[];
  onUpdateLayerStyle?: (
    layer: CreatorStudioTextLayer,
    updates: Partial<CreatorStudioLayerStyle>
  ) => void;
  onOpenOverflow?: (panel: CreatorStudioEditorPanel) => void;
  onBeginEdit?: (layer: CreatorStudioTextLayer) => void;
  reducedMotion: boolean | null;
}) {
  const toolbarButtonClass =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[10px] font-bold text-white/90 hover:bg-white/10";

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-auto absolute -top-14 left-1/2 z-30 max-w-[min(96vw,28rem)] -translate-x-1/2 rounded-[1.25rem] bg-[#031d3d]/94 px-2 py-1.5 shadow-xl shadow-black/25 ring-1 ring-white/15 backdrop-blur-md"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-1 overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <button
          type="button"
          aria-label="Edit text"
          onClick={() => onBeginEdit?.(layer)}
          className={toolbarButtonClass}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Font"
          onClick={() => onOpenOverflow?.("fonts")}
          className={toolbarButtonClass}
        >
          <Type className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Smaller"
          onClick={() =>
            onUpdateLayerStyle?.(layer, {
              fontScale: clampCreatorStudioFontScale(
                (layerStyle.fontScale ?? 1) - 0.06
              ),
            })
          }
          className={toolbarButtonClass}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[2.5rem] text-center text-[10px] font-black text-white/80">
          {Math.round((layerStyle.fontScale ?? 1) * 100)}%
        </span>
        <button
          type="button"
          aria-label="Larger"
          onClick={() =>
            onUpdateLayerStyle?.(layer, {
              fontScale: clampCreatorStudioFontScale(
                (layerStyle.fontScale ?? 1) + 0.06
              ),
            })
          }
          className={toolbarButtonClass}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <span className="mx-0.5 h-5 w-px shrink-0 bg-white/15" />
        {paletteSwatches.slice(0, 4).map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Color ${color}`}
            onClick={() => onUpdateLayerStyle?.(layer, { color })}
            className={`h-6 w-6 shrink-0 rounded-full ring-2 ${
              layerStyle.color === color ? "ring-white" : "ring-transparent"
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
        <span className="mx-0.5 h-5 w-px shrink-0 bg-white/15" />
        <button
          type="button"
          aria-label="Align left"
          onClick={() => onUpdateLayerStyle?.(layer, { align: "left" })}
          className={`${toolbarButtonClass} ${
            layerStyle.align === "left" ? "bg-[#0b63ce] text-white" : ""
          }`}
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Align center"
          onClick={() => onUpdateLayerStyle?.(layer, { align: "center" })}
          className={`${toolbarButtonClass} ${
            layerStyle.align === "center" ? "bg-[#0b63ce] text-white" : ""
          }`}
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Align right"
          onClick={() => onUpdateLayerStyle?.(layer, { align: "right" })}
          className={`${toolbarButtonClass} ${
            layerStyle.align === "right" ? "bg-[#0b63ce] text-white" : ""
          }`}
        >
          <AlignRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="AI rewrite"
          onClick={() => onOpenOverflow?.("ai")}
          className={toolbarButtonClass}
        >
          <Sparkles className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="More options"
          onClick={() => onOpenOverflow?.("advanced")}
          className={toolbarButtonClass}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

export default function CreatorStudioPositionedLayers({
  design,
  compact = false,
  hideCallToAction = true,
  interactive = false,
  selectedLayer = null,
  editingLayer = null,
  editRef,
  paletteSwatches = [],
  onChange,
  onEditingLayerChange,
  onUpdateLayerStyle,
  onLayerPointerDown,
  onLayerPointerMove,
  onLayerPointerUp,
  onOpenOverflow,
}: CreatorStudioPositionedLayersProps) {
  const reducedMotion = useReducedMotion();
  const accentColor = getCreatorStudioAccentColor(design);
  const pinchStateRef = useRef<{
    layer: CreatorStudioTextLayer;
    distance: number;
    scale: number;
  } | null>(null);

  const sortedLayers = useMemo(
    () =>
      [...creatorStudioTextLayers]
        .filter((entry) => !(hideCallToAction && entry.value === "callToAction"))
        .sort((left, right) => {
          const leftOrder =
            getCreatorStudioLayerStyle(design, left.value).layerOrder ?? 0;
          const rightOrder =
            getCreatorStudioLayerStyle(design, right.value).layerOrder ?? 0;

          return leftOrder - rightOrder;
        }),
    [design, hideCallToAction]
  );

  useEffect(() => {
    if (!interactive || !editingLayer || !editRef?.current) return;

    editRef.current.focus();
    if ("select" in editRef.current) {
      editRef.current.select();
    }
  }, [editRef, editingLayer, interactive, selectedLayer]);

  function renderLayer(layer: CreatorStudioTextLayer): ReactNode {
    const typography = buildCreatorStudioLayerTypography(design, layer, compact);
    const layerStyle = typography.layerStyle;

    if (layerStyle.hidden) {
      return null;
    }

    const text = getCreatorStudioLayerDisplayText(design, layer);
    const trimmedText = text.trim();

    if (!interactive && !trimmedText) {
      return null;
    }

    const isSelected = interactive && selectedLayer === layer;
    const isEditing = interactive && editingLayer === layer;
    const placeholder = getLayerPlaceholder(layer);
    const layerPositionStyle: CSSProperties = {
      left: `${typography.coordinates.x}%`,
      top: `${typography.coordinates.y}%`,
      transform: typography.transform,
      maxWidth: "min(88%, 22rem)",
      touchAction: isEditing ? "auto" : "none",
      zIndex:
        10 + (layerStyle.layerOrder ?? 0) + (isSelected && interactive ? 20 : 0),
    };
    const textClassName = `w-full whitespace-pre-wrap break-words leading-snug ${typography.fontClassName} ${typography.weightClass} ${typography.italicClass} ${typography.alignClass} ${typography.styledSizeClass}`;
    const layerBody = (
      <div
        className={`relative rounded-xl px-1 py-0.5 transition-shadow duration-300 ${
          isSelected
            ? "ring-2 ring-[#93c5fd] ring-offset-2 ring-offset-[#031d3d]/40 shadow-[0_0_0_1px_rgba(147,197,253,0.35)]"
            : interactive
              ? "ring-1 ring-transparent hover:ring-white/25"
              : ""
        }`}
      >
        {isSelected && !isEditing && interactive && (
          <FloatingToolbar
            layer={layer}
            layerStyle={layerStyle}
            paletteSwatches={paletteSwatches}
            onUpdateLayerStyle={onUpdateLayerStyle}
            onOpenOverflow={onOpenOverflow}
            onBeginEdit={(activeLayer) => onEditingLayerChange?.(activeLayer)}
            reducedMotion={reducedMotion}
          />
        )}
        {isSelected && !isEditing && interactive && (
          <ScaleResizeHandle
            layer={layer}
            layerStyle={layerStyle}
            onUpdateLayerStyle={onUpdateLayerStyle}
          />
        )}
        <LayerContent
          layer={layer}
          design={design}
          typography={typography}
          textClassName={textClassName}
          accentColor={accentColor}
          text={text}
          placeholder={placeholder}
          isEditing={isEditing}
          editRef={editRef}
          onChange={onChange}
          onEditingLayerChange={onEditingLayerChange}
        />
      </div>
    );

    if (!interactive) {
      return (
        <div
          key={layer}
          className="pointer-events-none absolute"
          style={layerPositionStyle}
        >
          {layerBody}
        </div>
      );
    }

    return (
      <motion.div
        key={layer}
        layout={!reducedMotion}
        className="absolute"
        style={layerPositionStyle}
        onPointerDown={(event) => onLayerPointerDown?.(layer, event)}
        onPointerMove={onLayerPointerMove}
        onPointerUp={(event) => onLayerPointerUp?.(layer, event)}
        onPointerCancel={(event) => onLayerPointerUp?.(layer, event)}
        onTouchStart={(event) => {
          if (!isSelected || event.touches.length !== 2) return;

          pinchStateRef.current = {
            layer,
            distance: getTouchDistance(event.touches),
            scale: layerStyle.fontScale ?? 1,
          };
        }}
        onTouchMove={(event) => {
          const pinch = pinchStateRef.current;
          if (!pinch || pinch.layer !== layer || event.touches.length !== 2) {
            return;
          }

          const distance = getTouchDistance(event.touches);
          if (pinch.distance <= 0 || distance <= 0) return;

          event.preventDefault();
          onUpdateLayerStyle?.(layer, {
            fontScale: clampCreatorStudioFontScale(
              pinch.scale * (distance / pinch.distance)
            ),
          });
        }}
        onTouchEnd={() => {
          if (pinchStateRef.current?.layer === layer) {
            pinchStateRef.current = null;
          }
        }}
      >
        {layerBody}
      </motion.div>
    );
  }

  return <>{sortedLayers.map((entry) => renderLayer(entry.value))}</>;
}
