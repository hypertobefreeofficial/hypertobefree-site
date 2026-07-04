"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Minus,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
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
} from "../../lib/creatorStudioCanvasRender";
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

function usesSerifTypography(design: CreatorStudioDesign) {
  const hint =
    `${design.typographyPairing ?? ""} ${design.typographyStyle ?? ""} ${design.visualTheme ?? ""}`.toLowerCase();

  return (
    hint.includes("serif") ||
    hint.includes("journal") ||
    hint.includes("magazine")
  );
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
  typography: ReturnType<typeof buildCreatorStudioLayerTypography>;
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

function FloatingToolbar({
  layer,
  layerStyle,
  paletteSwatches,
  onUpdateLayerStyle,
  onOpenOverflow,
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
  reducedMotion: boolean | null;
}) {
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
          onUpdateLayerStyle?.(layer, {
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
          onUpdateLayerStyle?.(layer, {
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
          onClick={() => onUpdateLayerStyle?.(layer, { color })}
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
        onClick={() => onUpdateLayerStyle?.(layer, { align: "left" })}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
          layerStyle.align === "left"
            ? "bg-[#0b63ce] text-white"
            : "text-white/90 hover:bg-white/10"
        }`}
      >
        <AlignLeft className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Align center"
        onClick={() => onUpdateLayerStyle?.(layer, { align: "center" })}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
          layerStyle.align === "center"
            ? "bg-[#0b63ce] text-white"
            : "text-white/90 hover:bg-white/10"
        }`}
      >
        <AlignCenter className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Align right"
        onClick={() => onUpdateLayerStyle?.(layer, { align: "right" })}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
          layerStyle.align === "right"
            ? "bg-[#0b63ce] text-white"
            : "text-white/90 hover:bg-white/10"
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
  const serifClass = usesSerifTypography(design) ? "font-serif" : "font-sans";

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
    const textClassName = `w-full whitespace-pre-wrap break-words leading-snug ${serifClass} ${typography.weightClass} ${typography.italicClass} ${typography.alignClass} ${typography.styledSizeClass}`;
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
            reducedMotion={reducedMotion}
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
      >
        {layerBody}
      </motion.div>
    );
  }

  return <>{sortedLayers.map((entry) => renderLayer(entry.value))}</>;
}
