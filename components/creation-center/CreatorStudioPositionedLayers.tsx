"use client";

import { motion } from "framer-motion";
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
  buildCreatorStudioSelectableLayerStyleUpdate,
  buildCreatorStudioSelectableLayerTextUpdate,
  creatorStudioTextLayers,
  getCreatorStudioCustomLayerStyle,
  getCreatorStudioLayerDisplayText,
  getCreatorStudioLayerStyle,
  getCreatorStudioLayerStyleForSelection,
  getCreatorStudioLayerTextForSelection,
  getCreatorStudioLayerTransform,
  getCreatorStudioStickerLayer,
  isCreatorStudioBuiltinLayer,
  isCreatorStudioCustomLayerKey,
  toCreatorStudioCustomLayerKey,
  toCreatorStudioStickerLayerKey,
  type CreatorStudioDesign,
  type CreatorStudioLayerStyle,
  type CreatorStudioSelectableLayer,
  type CreatorStudioTextLayer,
} from "../../lib/creationCenter";
import {
  buildCreatorStudioCustomLayerTypography,
  buildCreatorStudioLayerTypography,
  getCreatorStudioAccentColor,
  type CreatorStudioLayerTypography,
} from "../../lib/creatorStudioCanvasRender";
import {
  computeCreatorStudioToolbarPlacement,
  resolveCreatorStudioLayerMaxWidthStyle,
} from "../../lib/creatorStudioLayerLayout";
import { clampCreatorStudioFontScale } from "../../lib/creatorStudioTypography";
import type { CreatorStudioEditorPanel } from "./CreatorStudioLayoutEditor";
import CreatorStudioFloatingToolbar from "./CreatorStudioFloatingToolbar";

type CreatorStudioPositionedLayersProps = {
  design: CreatorStudioDesign;
  compact?: boolean;
  hideCallToAction?: boolean;
  interactive?: boolean;
  selectedLayer?: CreatorStudioSelectableLayer | null;
  editingLayer?: CreatorStudioSelectableLayer | null;
  editRef?: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  paletteSwatches?: string[];
  canvasRef?: RefObject<HTMLElement | null>;
  reserveMobileBottom?: boolean;
  onChange?: (updates: Partial<CreatorStudioDesign>) => void;
  onSelectLayer?: (layer: CreatorStudioSelectableLayer) => void;
  onEditingLayerChange?: (layer: CreatorStudioSelectableLayer | null) => void;
  onUpdateLayerStyle?: (
    layer: CreatorStudioSelectableLayer,
    updates: Partial<CreatorStudioLayerStyle>
  ) => void;
  onLayerPointerDown?: (
    layer: CreatorStudioSelectableLayer,
    event: ReactPointerEvent<HTMLDivElement>
  ) => void;
  onLayerPointerMove?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onLayerPointerUp?: (
    layer: CreatorStudioSelectableLayer,
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

function getLayerMaxWidthStyle(
  layerStyle: CreatorStudioLayerStyle,
  options?: { reserveMobileBottom?: boolean }
): string | undefined {
  return resolveCreatorStudioLayerMaxWidthStyle(layerStyle, {
    reserveMobileBottom: options?.reserveMobileBottom,
    constrainToSafeArea: true,
  });
}

function getSelectedLayerOutlineClass(isSelected: boolean, interactive: boolean) {
  if (!isSelected || !interactive) {
    return interactive ? "outline outline-1 outline-transparent" : "";
  }

  return "outline outline-2 outline-[#93c5fd] outline-offset-[3px]";
}

function buildLayerPositionStyle(options: {
  x: number;
  y: number;
  transform: string;
  layerStyle: CreatorStudioLayerStyle;
  layerOrder: number;
  isSelected: boolean;
  interactive: boolean;
  isEditing: boolean;
  reserveMobileBottom?: boolean;
}): CSSProperties {
  const maxWidth = getLayerMaxWidthStyle(options.layerStyle, {
    reserveMobileBottom: options.reserveMobileBottom,
  });

  return {
    left: `${options.x}%`,
    top: `${options.y}%`,
    transform: options.transform,
    ...(maxWidth ? { maxWidth } : {}),
    touchAction: options.isEditing ? "auto" : "none",
    zIndex:
      10 +
      options.layerOrder +
      (options.isSelected && options.interactive ? 20 : 0),
  };
}

function layerSurfaceClass(layer: CreatorStudioTextLayer) {
  if (layer === "scripture") {
    return "rounded-2xl bg-black/45 px-3 py-2 backdrop-blur-sm";
  }
  if (layer === "caption") {
    return "rounded-2xl bg-white/10 px-3 py-2 backdrop-blur-sm";
  }
  return "";
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
  const inputClassName = `${textClassName} m-0 block w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none ring-0 appearance-none`;

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
        className={`${layerSurfaceClass(layer)} ${textClassName}`}
      >
        {text.trim() || placeholder}
      </div>
    );
  }

  if (layer === "caption" && !isEditing) {
    return (
      <div
        style={typography.inlineStyle}
        className={`${layerSurfaceClass(layer)} ${textClassName}`}
      >
        {text.trim() || placeholder}
      </div>
    );
  }

  if (isEditing && onChange) {
    const field = layerUsesMultiline(layer) ? (
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
        className={inputClassName}
        style={typography.inlineStyle}
      />
    ) : (
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
        className={inputClassName}
        style={typography.inlineStyle}
      />
    );

    const surfaceClass = layerSurfaceClass(layer);
    if (surfaceClass) {
      return <div className={surfaceClass}>{field}</div>;
    }

    return field;
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
  layer: CreatorStudioSelectableLayer;
  layerStyle: CreatorStudioLayerStyle;
  onUpdateLayerStyle?: (
    layer: CreatorStudioSelectableLayer,
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
  onSelectLayer,
}: {
  layer: CreatorStudioSelectableLayer;
  layerStyle: CreatorStudioLayerStyle;
  layerYPercent: number;
  design: CreatorStudioDesign;
  paletteSwatches: string[];
  canvasRef?: RefObject<HTMLElement | null>;
  getAnchorElement: () => HTMLDivElement | null;
  onChange?: (updates: Partial<CreatorStudioDesign>) => void;
  onUpdateLayerStyle?: (
    layer: CreatorStudioSelectableLayer,
    updates: Partial<CreatorStudioLayerStyle>
  ) => void;
  onOpenOverflow?: (panel: CreatorStudioEditorPanel) => void;
  onBeginEdit?: (layer: CreatorStudioSelectableLayer) => void;
  onSelectLayer?: (layer: CreatorStudioSelectableLayer) => void;
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
      const paddingX = Math.max(8, canvasRect.width * 0.04);
      const paddingY = Math.max(8, canvasRect.height * 0.04);

      const layerInCanvas = {
        left: layerRect.left - canvasRect.left,
        top: layerRect.top - canvasRect.top,
        width: layerRect.width,
        height: layerRect.height,
      };

      const placement = computeCreatorStudioToolbarPlacement({
        canvasWidth: canvasRect.width,
        canvasHeight: canvasRect.height,
        layerRect: layerInCanvas,
        toolbarWidth,
        toolbarHeight,
        paddingX,
        paddingY,
      });

      setToolbarStyle({
        position: "absolute",
        top: placement.top,
        left: placement.left,
        width: "max-content",
        maxWidth: canvasRect.width - paddingX * 2,
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
  
  
    
      design={design}
      paletteSwatches={paletteSwatches}
      onChange={onChange}
      onUpdateLayerStyle={onUpdateLayerStyle}
      onOpenOverflow={onOpenOverflow}
      onBeginEdit={onBeginEdit}
      onSelectLayer={onSelectLayer}
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
  onSelectLayer,
}: CreatorStudioPositionedLayersProps) {
  const accentColor = getCreatorStudioAccentColor(design);
  const pinchStateRef = useRef<{
    layer: CreatorStudioSelectableLayer;
    distance: number;
    scale: number;
  } | null>(null);
  const layerAnchorRefs = useRef<Partial<Record<string, HTMLDivElement | null>>>(
    {}
  );

  const sortedLayers = useMemo(() => {
    const builtin = [...creatorStudioTextLayers]
      .filter((entry) => !(hideCallToAction && entry.value === "callToAction"))
      .map((entry) => ({
        key: entry.value as CreatorStudioSelectableLayer,
        order: getCreatorStudioLayerStyle(design, entry.value).layerOrder ?? 0,
      }));

    const custom = (design.customTextLayers ?? []).map((entry) => ({
      key: toCreatorStudioCustomLayerKey(entry.id),
      order: getCreatorStudioCustomLayerStyle(design, entry.id).layerOrder ?? 0,
    }));

    const stickers = (design.stickerLayers ?? []).map((entry) => ({
      key: toCreatorStudioStickerLayerKey(entry.id),
      order: entry.layerOrder ?? 0,
    }));

    return [...builtin, ...custom, ...stickers].sort(
      (left, right) => left.order - right.order
    );
  }, [design, hideCallToAction]);

  useEffect(() => {
    if (!interactive || !editingLayer || !editRef?.current) return;

    editRef.current.focus();
    const length = editRef.current.value.length;
    if ("setSelectionRange" in editRef.current) {
      editRef.current.setSelectionRange(length, length);
    }
  }, [editRef, editingLayer, interactive]);

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
    const layerPositionStyle = buildLayerPositionStyle({
      x: typography.coordinates.x,
      y: typography.coordinates.y,
      transform: typography.transform,
      layerStyle,
      layerOrder: layerStyle.layerOrder ?? 0,
      isSelected,
      interactive,
      isEditing,
      reserveMobileBottom,
    });
    const textClassName = `block w-full min-w-0 whitespace-pre-wrap break-words ${typography.fontClassName} ${typography.weightClass} ${typography.italicClass} ${typography.alignClass}`;
    const layerBody = (
      <div
        ref={(node) => {
          layerAnchorRefs.current[layer] = node;
        }}
        className={`relative min-w-0 max-w-full ${getSelectedLayerOutlineClass(
          isSelected,
          interactive
        )}`}
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
        layout={false}
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

  function renderCustomLayer(layerKey: `custom:${string}`): ReactNode {
    const customId = layerKey.slice("custom:".length);
    const layerStyle = getCreatorStudioCustomLayerStyle(design, customId);
    if (layerStyle.hidden) return null;

    const typography = buildCreatorStudioCustomLayerTypography(
      design,
      layerStyle,
      compact,
      { reserveMobileBottom }
    );
    const text = getCreatorStudioLayerTextForSelection(design, layerKey);
    const trimmedText = text.trim();
    if (!interactive && !trimmedText) return null;

    const isSelected = interactive && selectedLayer === layerKey;
    const isEditing = interactive && editingLayer === layerKey;
    const layerPositionStyle = buildLayerPositionStyle({
      x: typography.coordinates.x,
      y: typography.coordinates.y,
      transform: typography.transform,
      layerStyle,
      layerOrder: layerStyle.layerOrder ?? 0,
      isSelected,
      interactive,
      isEditing,
      reserveMobileBottom,
    });
    const textClassName = `block w-full min-w-0 whitespace-pre-wrap break-words ${typography.fontClassName} ${typography.weightClass} ${typography.italicClass} ${typography.alignClass}`;

    const layerBody = (
      <div
        ref={(node) => {
          layerAnchorRefs.current[layerKey] = node;
        }}
        className={`relative min-w-0 max-w-full ${getSelectedLayerOutlineClass(
          isSelected,
          interactive
        )}`}
      >
        {isSelected && !isEditing && interactive && (
          <ScaleResizeHandle
            layer={layerKey}
            layerStyle={layerStyle}
            onUpdateLayerStyle={onUpdateLayerStyle}
          />
        )}
        {isEditing && onChange ? (
          <textarea
            ref={editRef as RefObject<HTMLTextAreaElement>}
            value={text}
            rows={3}
            placeholder="Tap to add text"
            onChange={(event) =>
              onChange(
                buildCreatorStudioSelectableLayerTextUpdate(
                  design,
                  layerKey,
                  event.target.value
                )
              )
            }
            onBlur={() => onEditingLayerChange?.(null)}
            onPointerDown={(event) => event.stopPropagation()}
            className={`${textClassName} m-0 block w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none ring-0 appearance-none`}
            style={typography.inlineStyle}
          />
        ) : (
          <div style={typography.inlineStyle} className={textClassName}>
            {text.trim() || (
              <span className="text-white/45">Tap to add text</span>
            )}
          </div>
        )}
      </div>
    );

    if (!interactive) {
      return (
        <div
          key={layerKey}
          className="pointer-events-none absolute"
          style={layerPositionStyle}
        >
          {layerBody}
        </div>
      );
    }

    return (
      <motion.div
        key={layerKey}
        layout={false}
        className="absolute"
        style={layerPositionStyle}
        onPointerDown={(event) => onLayerPointerDown?.(layerKey, event)}
        onPointerMove={onLayerPointerMove}
        onPointerUp={(event) => onLayerPointerUp?.(layerKey, event)}
        onPointerCancel={(event) => onLayerPointerUp?.(layerKey, event)}
        onDoubleClick={() => onEditingLayerChange?.(layerKey)}
      >
        {layerBody}
      </motion.div>
    );
  }

  function renderStickerLayer(layerKey: `sticker:${string}`): ReactNode {
    const stickerId = layerKey.slice("sticker:".length);
    const sticker = getCreatorStudioStickerLayer(design, stickerId);
    if (!sticker) return null;

    const layerStyle = getCreatorStudioLayerStyleForSelection(design, layerKey);
    const scale = sticker.scale ?? 1;
    const isSelected = interactive && selectedLayer === layerKey;
    const layerPositionStyle = buildLayerPositionStyle({
      x: sticker.x,
      y: sticker.y,
      transform: getCreatorStudioLayerTransform(
        "center",
        sticker.x,
        sticker.rotation ?? 0
      ),
      layerStyle,
      layerOrder: sticker.layerOrder ?? 0,
      isSelected,
      interactive,
      isEditing: false,
      reserveMobileBottom,
    });

    const layerBody = (
      <div
        ref={(node) => {
          layerAnchorRefs.current[layerKey] = node;
        }}
        className={`relative select-none ${getSelectedLayerOutlineClass(
          isSelected,
          interactive
        )}`}
        style={{
          fontSize: `${(compact ? 2.2 : 2.8) * scale}rem`,
          lineHeight: 1,
          opacity: sticker.opacity ?? 1,
        }}
        aria-label={sticker.label}
      >
        {sticker.emoji}
        {isSelected && interactive && (
          <ScaleResizeHandle
            layer={layerKey}
            layerStyle={layerStyle}
            onUpdateLayerStyle={onUpdateLayerStyle}
          />
        )}
      </div>
    );

    if (!interactive) {
      return (
        <div
          key={layerKey}
          className="pointer-events-none absolute"
          style={layerPositionStyle}
        >
          {layerBody}
        </div>
      );
    }

    return (
      <motion.div
        key={layerKey}
        layout={false}
        className="absolute"
        style={layerPositionStyle}
        onPointerDown={(event) => onLayerPointerDown?.(layerKey, event)}
        onPointerMove={onLayerPointerMove}
        onPointerUp={(event) => onLayerPointerUp?.(layerKey, event)}
        onPointerCancel={(event) => onLayerPointerUp?.(layerKey, event)}
      >
        {layerBody}
      </motion.div>
    );
  }

  function renderSelectableLayer(layerKey: CreatorStudioSelectableLayer): ReactNode {
    if (isCreatorStudioBuiltinLayer(layerKey)) {
      return renderLayer(layerKey);
    }

    if (isCreatorStudioCustomLayerKey(layerKey)) {
      return renderCustomLayer(layerKey);
    }

    return renderStickerLayer(layerKey);
  }

  const activeToolbarLayer =
    interactive && selectedLayer && editingLayer !== selectedLayer
      ? selectedLayer
      : null;

  return (
    <>
      {sortedLayers.map((entry) => renderSelectableLayer(entry.key))}
      {activeToolbarLayer && (
        <LayerToolbar
          layer={activeToolbarLayer}
          layerStyle={getCreatorStudioLayerStyleForSelection(
            design,
            activeToolbarLayer
          )}
          layerYPercent={
            isCreatorStudioBuiltinLayer(activeToolbarLayer)
              ? buildCreatorStudioLayerTypography(
                  design,
                  activeToolbarLayer,
                  compact,
                  { reserveMobileBottom }
                ).coordinates.y
              : getCreatorStudioLayerStyleForSelection(design, activeToolbarLayer)
                  .y ?? 50
          }
          design={design}
          paletteSwatches={paletteSwatches}
          canvasRef={canvasRef}
          getAnchorElement={() =>
            layerAnchorRefs.current[String(activeToolbarLayer)] ?? null
          }
          onChange={onChange}
          onUpdateLayerStyle={onUpdateLayerStyle}
          onOpenOverflow={onOpenOverflow}
          onBeginEdit={(activeLayer) => onEditingLayerChange?.(activeLayer)}
          onSelectLayer={onSelectLayer}
        />
      )}
    </>
  );
}
