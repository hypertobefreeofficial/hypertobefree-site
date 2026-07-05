"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Layers, Sparkles } from "lucide-react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  buildCreatorStudioSelectableLayerStyleUpdate,
  clampCreatorStudioLayerCoordinates,
  getCreationCenterTemplate,
  getCreatorStudioLayerCoordinates,
  getCreatorStudioLayerStyleForSelection,
  isCreatorStudioBuiltinLayer,
  type CreationCenterTemplateId,
  type CreatorStudioDesign,
  type CreatorStudioLayerStyle,
  type CreatorStudioSelectableLayer,
} from "../../lib/creationCenter";
import { buildCreatorStudioLayerTypography } from "../../lib/creatorStudioCanvasRender";
import { resolveCreatorStudioDesignForRender } from "../../lib/creatorStudioRenderPipeline";
import type { CreatorStudioEditorPanel } from "./CreatorStudioLayoutEditor";
import CreatorStudioEditorialHints from "./CreatorStudioEditorialHints";
import CreatorStudioPositionedLayers from "./CreatorStudioPositionedLayers";
import HTBFWatermark from "./HTBFWatermark";

type CreatorStudioInteractiveCanvasProps = {
  design: CreatorStudioDesign;
  onChange: (updates: Partial<CreatorStudioDesign>) => void;
  videoPreviewUrl: string | null;
  photoPreviewUrl: string | null;
  selectedLayer: CreatorStudioSelectableLayer;
  onSelectLayer: (layer: CreatorStudioSelectableLayer) => void;
  onContinueToPublish?: () => void;
  onChangeConcept?: () => void;
  onGenerateConcepts?: () => void;
  showChangeConcept?: boolean;
  showGenerateConcepts?: boolean;
  onOpenOverflow?: (panel: CreatorStudioEditorPanel) => void;
  hideTopActionsOnDesktop?: boolean;
  fillAvailableSpace?: boolean;
  desktopEditor?: boolean;
};

type DragState = {
  layer: CreatorStudioSelectableLayer;
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

export default function CreatorStudioInteractiveCanvas({
  design,
  onChange,
  videoPreviewUrl,
  photoPreviewUrl,
  selectedLayer,
  onSelectLayer,
  onContinueToPublish,
  onChangeConcept,
  onGenerateConcepts,
  showChangeConcept = false,
  showGenerateConcepts = false,
  onOpenOverflow,
  hideTopActionsOnDesktop = false,
  fillAvailableSpace = false,
  desktopEditor = false,
}: CreatorStudioInteractiveCanvasProps) {
  const reducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [editingLayer, setEditingLayer] =
    useState<CreatorStudioSelectableLayer | null>(null);
  const reserveMobileBottom = false;

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
  const renderDesign = useMemo(
    () => resolveCreatorStudioDesignForRender(design),
    [design]
  );

  const updateLayerStyle = useCallback(
    (
      layer: CreatorStudioSelectableLayer,
      updates: Partial<CreatorStudioLayerStyle>
    ) => {
      onChange(
        buildCreatorStudioSelectableLayerStyleUpdate(design, layer, updates)
      );
    },
    [design, onChange]
  );

  function beginLayerInteraction(
    layer: CreatorStudioSelectableLayer,
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    const style = getCreatorStudioLayerStyleForSelection(design, layer);
    if (style.hidden) {
      return;
    }

    const { x, y } = isCreatorStudioBuiltinLayer(layer)
      ? buildCreatorStudioLayerTypography(renderDesign, layer, false, {
          reserveMobileBottom,
        }).coordinates
      : getCreatorStudioLayerCoordinates(style, { reserveMobileBottom });

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

    const next = clampCreatorStudioLayerCoordinates(
      drag.originX + deltaX,
      drag.originY + deltaY,
      { reserveMobileBottom }
    );

    updateLayerStyle(drag.layer, next);
  }

  function endLayerInteraction(
    layer: CreatorStudioSelectableLayer,
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    const drag = dragStateRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);

    if (!drag.moved) {
      onSelectLayer(layer);
    }

    dragStateRef.current = null;
  }

  const showEditorialHints = !selectedLayer && !editingLayer;

  return (
    <div
      className={`flex min-h-0 min-w-0 w-full items-center justify-center ${
        desktopEditor ? "h-full lg:px-0" : "mx-auto h-full max-w-none"
      }`}
    >
      <motion.div
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className={`relative min-h-0 min-w-0 overflow-hidden bg-[#031d3d] ${
          fillAvailableSpace
            ? desktopEditor
              ? "aspect-[9/16] w-full max-h-[calc(100dvh-14rem-env(safe-area-inset-bottom))] lg:aspect-[9/16] lg:h-[min(calc(100dvh-7.5rem),840px)] lg:w-auto lg:max-h-none lg:max-w-[min(100%,calc(min(calc(100dvh-7.5rem),840px)*9/16))] lg:rounded-2xl lg:shadow-2xl lg:shadow-black/40 lg:ring-1 lg:ring-white/10"
              : "aspect-[9/16] h-full max-h-full w-auto max-w-full"
            : "w-full rounded-none sm:rounded-[1.75rem] sm:shadow-2xl sm:shadow-blue-950/20 sm:ring-1 sm:ring-white/10"
        }`}
      >
        <div
          ref={canvasRef}
          className={`relative isolate h-full w-full overflow-hidden ${
            fillAvailableSpace
              ? ""
              : "min-h-[min(100dvh-6rem,52rem)] sm:min-h-[42rem]"
          }`}
        >
          <CanvasBackground
            templateId={design.templateId}
            photoPreviewUrl={photoPreviewUrl}
            videoPreviewUrl={videoPreviewUrl}
            generatedImageUrl={design.generatedImageUrl}
            backgroundColor={design.colorPalette?.[0]?.trim() || "#062a57"}
          />

          <div
            className={`pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between gap-2 p-3 sm:p-4 ${
              hideTopActionsOnDesktop ? "lg:hidden" : ""
            }`}
          >
            <div className="pointer-events-auto flex flex-wrap gap-2">
              {showGenerateConcepts && onGenerateConcepts && (
                <button
                  type="button"
                  onClick={onGenerateConcepts}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-black/30 px-3.5 text-[11px] font-semibold text-white backdrop-blur-md ring-1 ring-white/15 transition hover:bg-black/45"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Style my testimony
                </button>
              )}
              {showChangeConcept && onChangeConcept && (
                <button
                  type="button"
                  onClick={onChangeConcept}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-black/30 px-3.5 text-[11px] font-semibold text-white backdrop-blur-md ring-1 ring-white/15 transition hover:bg-black/45"
                >
                  <Layers className="h-3.5 w-3.5" />
                  Other directions
                </button>
              )}
            </div>
            {onContinueToPublish && (
              <button
                type="button"
                onClick={onContinueToPublish}
                className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-white/95 px-5 text-sm font-black text-[#062a57] shadow-lg shadow-black/15 backdrop-blur-md transition hover:bg-white"
              >
                Continue
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          <div
            className="absolute inset-0 z-10 overflow-hidden"
            onPointerDown={() => setEditingLayer(null)}
          >
            <CreatorStudioPositionedLayers
              design={renderDesign}
              interactive
              hideCallToAction={false}
              selectedLayer={selectedLayer}
              editingLayer={editingLayer}
              editRef={editRef}
              paletteSwatches={paletteSwatches}
              canvasRef={canvasRef}
              reserveMobileBottom={reserveMobileBottom}
              onChange={onChange}
              onEditingLayerChange={setEditingLayer}
              onUpdateLayerStyle={updateLayerStyle}
              onLayerPointerDown={beginLayerInteraction}
              onLayerPointerMove={moveLayerInteraction}
              onLayerPointerUp={endLayerInteraction}
              onOpenOverflow={onOpenOverflow}
              onSelectLayer={onSelectLayer}
            />
          </div>

          {showEditorialHints && (
            <div className={hideTopActionsOnDesktop ? "lg:hidden" : undefined}>
              <CreatorStudioEditorialHints
                design={design}
                onApplyTitle={(title) => onChange({ title })}
                onApplyCaption={(caption) => onChange({ caption })}
                onFocusScripture={() => onSelectLayer("scripture")}
              />
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
