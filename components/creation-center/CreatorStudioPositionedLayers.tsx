"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
import CreatorStudioFloatingToolbar from "./CreatorStudioFloatingToolbar";

type CreatorStudioPositionedLayersProps = {
  design: CreatorStudioDesign;
  compact?: boolean;
  hideCallToAction?: boolean;
  interactive?: boolean;
  selectedLayer?: CreatorStudioTextLayer | null;
  editingLayer?: CreatorStudioTextLayer | null;
  editRef?: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  paletteSwatches?: string[];
  canvasRef?: RefObject<HTMLElement | null>;
  reserveMobileBottom?: boolean;
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

function LayerToolbar({
  layer,
  layerStyle,
  layerYPercent,
  design,
  paletteSwatches,
  canvasRef,
  getAnchorElement,
  onChange,
  onUpdateLayerStyle,
  onOpenOverflow,
  onBeginEdit,
}: {
  layer: CreatorStudioTextLayer;
  layerStyle: CreatorStudioLayerStyle;
  layerYPercent: number;
  design: CreatorStudioDesign;
  paletteSwatches: string[];
  canvasRef?: RefObject<HTMLElement | null>;
  getAnchorElement: () => HTMLDivElement | null;
  onChange?: (updates: Partial<CreatorStudioDesign>) => void;
  onUpdateLayerStyle?: (
    layer: CreatorStudioTextLayer,
    updates: Partial<CreatorStudioLayerStyle>
  ) => void;
  onOpenOverflow?: (panel: CreatorStudioEditorPanel) => void;
  onBeginEdit?: (layer: CreatorStudioTextLayer) => void;
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarStyle, setToolbarStyle] = useState<CSSProperties>({
    opacity: 0,
  });
  const [layoutTick, setLayoutTick] = useState(0);

  const repositionToolbar = () => {
    setLayoutTick((value) => value + 1);
  };

  useLayoutEffect(() => {
    let frameId = 0;

    const measure = () => {
      const canvas = canvasRef?.current;
      const anchor = getAnchorElement();
      const toolbar = toolbarRef.current;

      if (!canvas || !anchor || !toolbar) {
        frameId = window.requestAnimationFrame(measure);
        return;
      }

      const canvasRect = canvas.getBoundingClientRect();
      const layerRect = anchor.getBoundingClientRect();
      const toolbarWidth = toolbar.offsetWidth;
      const toolbarHeight = toolbar.offsetHeight;
      const padding = 8;

      const spaceAbove = layerRect.top - canvasRect.top;
      const spaceBelow = canvasRect.bottom - layerRect.bottom;
      const placeBelow =
        layerYPercent < 18 ||
        (spaceAbove < toolbarHeight + padding && spaceBelow > spaceAbove);

      let top = placeBelow
        ? layerRect.bottom - canvasRect.top + padding
        : layerRect.top - canvasRect.top - toolbarHeight - padding;

      top = Math.max(
        padding,
        Math.min(top, canvasRect.height - toolbarHeight - padding)
      );

      const centerX = layerRect.left + layerRect.width / 2 - canvasRect.left;
      let left = centerX - toolbarWidth / 2;
      left = Math.max(
        padding,
        Math.min(left, canvasRect.width - toolbarWidth - padding)
      );

      setToolbarStyle({
        position: "absolute",
        top,
        left,
        width: "max-content",
        maxWidth: canvasRect.width - padding * 2,
        opacity: 1,
        zIndex: 50,
      });
    };

    measure();

    return () => window.cancelAnimationFrame(frameId);
  }, [
    canvasRef,
    design,
    layer,
    layerStyle.align,
    layerStyle.color,
    layerStyle.fontScale,
    layerYPercent,
    layoutTick,
    paletteSwatches.length,
  ]);

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const observer = new ResizeObserver(() => repositionToolbar());
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [layer, repositionToolbar]);

  return (
    <CreatorStudioFloatingToolbar
      ref={toolbarRef}
      style={toolbarStyle}
      layer={layer}
      layerStyle={layerStyle}
      design={design}
      paletteSwatches={paletteSwatches}
      onChange={onChange}
      onUpdateLayerStyle={onUpdateLayerStyle}
      onOpenOverflow={onOpenOverflow}
      onBeginEdit={onBeginEdit}
      onLayoutChange={repositionToolbar}
    />
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
  canvasRef,
  reserveMobileBottom = false,
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
  const layerAnchorRefs = useRef<
    Partial<Record<CreatorStudioTextLayer, HTMLDivElement | null>>
  >({});

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
    const typography = buildCreatorStudioLayerTypography(design, layer, compact, {
      reserveMobileBottom,
    });
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
      maxWidth: "min(84%, 20rem)",
      touchAction: isEditing ? "auto" : "none",
      zIndex:
        10 + (layerStyle.layerOrder ?? 0) + (isSelected && interactive ? 20 : 0),
    };
    const textClassName = `w-full whitespace-pre-wrap break-words leading-snug ${typography.fontClassName} ${typography.weightClass} ${typography.italicClass} ${typography.alignClass}`;
    const layerBody = (
      <div
        ref={(node) => {
          layerAnchorRefs.current[layer] = node;
        }}
        className={`relative rounded-xl px-1 py-0.5 transition-shadow duration-300 ${
          isSelected
            ? "ring-2 ring-[#93c5fd] ring-offset-2 ring-offset-[#031d3d]/40 shadow-[0_0_0_1px_rgba(147,197,253,0.35)]"
            : interactive
              ? "ring-1 ring-transparent hover:ring-white/25"
              : ""
        }`}
      >
        {isSelected && !isEditing && interactive && (
          <ScaleResizeHandle
            layer={layer}
            layerStyle={layerStyle}
            onUpdateLayerStyle={onUpdateLayerStyle}
          />
        )}
        <LayerContent
          layer={layer}
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
        onDoubleClick={() => onEditingLayerChange?.(layer)}
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

  const activeToolbarLayer =
    interactive && selectedLayer && editingLayer !== selectedLayer
      ? selectedLayer
      : null;

  return (
    <>
      {sortedLayers.map((entry) => renderLayer(entry.value))}
      {activeToolbarLayer && (
        <LayerToolbar
          layer={activeToolbarLayer}
          layerStyle={getCreatorStudioLayerStyle(design, activeToolbarLayer)}
          layerYPercent={
            buildCreatorStudioLayerTypography(
              design,
              activeToolbarLayer,
              compact,
              { reserveMobileBottom }
            ).coordinates.y
          }
          design={design}
          paletteSwatches={paletteSwatches}
          canvasRef={canvasRef}
          getAnchorElement={() => layerAnchorRefs.current[activeToolbarLayer] ?? null}
          onChange={onChange}
          onUpdateLayerStyle={onUpdateLayerStyle}
          onOpenOverflow={onOpenOverflow}
          onBeginEdit={(activeLayer) => onEditingLayerChange?.(activeLayer)}
        />
      )}
    </>
  );
}
