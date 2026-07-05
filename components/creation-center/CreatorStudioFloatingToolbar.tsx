"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Copy,
  Loader2,
  Minus,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Type,
  Wand2,
} from "lucide-react";
import {
  forwardRef,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import {
  applyLayerRewriteText,
  creatorStudioLayerRewriteActions,
  polishTextLocally,
  requestCreatorStudioLayerRewrite,
  type CreatorStudioLayerRewriteAction,
} from "../../lib/creatorStudioLayerAiRewriteClient";
import type {
  CreatorStudioDesign,
  CreatorStudioLayerStyle,
  CreatorStudioSelectableLayer,
} from "../../lib/creationCenter";
import {
  addCreatorStudioCustomTextLayer,
  duplicateCreatorStudioSelectableLayer,
  getCreatorStudioLayerTextForSelection,
  getDuplicatedCreatorStudioLayerKey,
  isCreatorStudioBuiltinLayer,
  isCreatorStudioCustomLayerKey,
  removeCreatorStudioBuiltinTextLayer,
  removeCreatorStudioCustomTextLayer,
  removeCreatorStudioStickerLayer,
  toCreatorStudioCustomLayerKey,
} from "../../lib/creationCenter";
import { supabase } from "../../lib/supabaseClient";
import { clampCreatorStudioFontScale } from "../../lib/creatorStudioTypography";
import type { CreatorStudioEditorPanel } from "./CreatorStudioLayoutEditor";

type CreatorStudioFloatingToolbarProps = {
  layer: CreatorStudioSelectableLayer;
  layerStyle: CreatorStudioLayerStyle;
  design: CreatorStudioDesign;
  paletteSwatches: string[];
  style?: CSSProperties;
  onChange?: (updates: Partial<CreatorStudioDesign>) => void;
  onUpdateLayerStyle?: (
    layer: CreatorStudioSelectableLayer,
    updates: Partial<CreatorStudioLayerStyle>
  ) => void;
  onOpenOverflow?: (panel: CreatorStudioEditorPanel) => void;
  onBeginEdit?: (layer: CreatorStudioSelectableLayer) => void;
  onSelectLayer?: (layer: CreatorStudioSelectableLayer) => void;
  onLayoutChange?: () => void;
};

const CreatorStudioFloatingToolbar = forwardRef<
  HTMLDivElement,
  CreatorStudioFloatingToolbarProps
>(function CreatorStudioFloatingToolbar(
  {
    layer,
    layerStyle,
    design,
    paletteSwatches,
    style,
    onChange,
    onUpdateLayerStyle,
    onOpenOverflow,
    onBeginEdit,
    onSelectLayer,
    onLayoutChange,
  },
  ref
) {
  const reducedMotion = useReducedMotion();
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [showAiStrip, setShowAiStrip] = useState(false);
  const [loadingAction, setLoadingAction] =
    useState<CreatorStudioLayerRewriteAction | null>(null);
  const [alternatives, setAlternatives] = useState<string[]>([]);

  const isSticker = typeof layer === "string" && layer.startsWith("sticker:");
  const isTextLayer = !isSticker;
  const customColorSelected =
    Boolean(layerStyle.color) &&
    !paletteSwatches.slice(0, 4).includes(layerStyle.color ?? "");

  const toolbarButtonClass =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[10px] font-bold text-white/90 hover:bg-white/10";

  function handleAddTextBox() {
    if (!onChange) return;

    const updates = addCreatorStudioCustomTextLayer(design);
    onChange(updates);

    const nextLayer = updates.customTextLayers?.at(-1);
    if (nextLayer) {
      onSelectLayer?.(toCreatorStudioCustomLayerKey(nextLayer.id));
    }

    onLayoutChange?.();
  }

  function handleDuplicateLayer() {
    if (!onChange) return;

    const updates = duplicateCreatorStudioSelectableLayer(design, layer);
    onChange(updates);

    const nextLayer = getDuplicatedCreatorStudioLayerKey(design, updates);
    if (nextLayer) {
      onSelectLayer?.(nextLayer);
    }

    onLayoutChange?.();
  }

  function handleDeleteLayer() {
    if (!onChange) return;

    if (isCreatorStudioCustomLayerKey(layer)) {
      onChange(removeCreatorStudioCustomTextLayer(design, layer));
    } else if (isSticker) {
      onChange(removeCreatorStudioStickerLayer(design, layer));
    } else if (isCreatorStudioBuiltinLayer(layer)) {
      onChange(removeCreatorStudioBuiltinTextLayer(design, layer));
    }

    onLayoutChange?.();
  }

  function handleCustomColorChange(event: ChangeEvent<HTMLInputElement>) {
    onUpdateLayerStyle?.(layer, { color: event.target.value });
  }

  async function runRewrite(action: CreatorStudioLayerRewriteAction) {
    if (!onChange || isSticker) return;

    const currentText = getCreatorStudioLayerTextForSelection(design, layer);

    if (action === "keep-words") {
      onChange(
        applyLayerRewriteText(
          layer,
          polishTextLocally(currentText, action),
          design
        )
      );
      setShowAiStrip(false);
      onLayoutChange?.();
      return;
    }

    setLoadingAction(action);
    setAlternatives([]);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const result = await requestCreatorStudioLayerRewrite({
        layer,
        action,
        design,
        accessToken: session?.access_token,
      });

      if (result.kind === "error") return;

      if (result.kind === "alternatives") {
        setAlternatives(result.alternatives);
        return;
      }

      if (result.kind === "text") {
        onChange(applyLayerRewriteText(layer, result.text, design));
        setShowAiStrip(false);
        onLayoutChange?.();
      }
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <motion.div
      ref={ref}
      initial={reducedMotion ? false : { opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      style={style}
      className="pointer-events-auto rounded-[1.25rem] bg-[#031d3d]/94 px-2 py-1.5 shadow-xl shadow-black/25 ring-1 ring-white/15 backdrop-blur-md"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-1 overflow-x-auto [-webkit-overflow-scrolling:touch]">
        {isTextLayer && (
          <>
            <button
              type="button"
              aria-label="Add text box"
              onClick={handleAddTextBox}
              className={toolbarButtonClass}
            >
              <Type className="h-3.5 w-3.5" />
              <Plus className="h-3 w-3" />
            </button>
            <button
              type="button"
              aria-label="Duplicate layer"
              onClick={handleDuplicateLayer}
              className={toolbarButtonClass}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Delete text box"
              onClick={handleDeleteLayer}
              className={toolbarButtonClass}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <span className="mx-0.5 h-5 w-px shrink-0 bg-white/15" />
            <button
              type="button"
              aria-label="Edit"
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
            <span className="min-w-[2.25rem] text-center text-[10px] font-black text-white/80">
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
            <button
              type="button"
              aria-label="Custom color"
              onClick={() => colorInputRef.current?.click()}
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-2 ${
                customColorSelected ? "ring-white" : "ring-transparent"
              }`}
              style={{
                backgroundColor: customColorSelected
                  ? layerStyle.color
                  : "rgba(255,255,255,0.12)",
              }}
            >
              <Palette className="h-3.5 w-3.5 text-white" />
            </button>
            <input
              ref={colorInputRef}
              type="color"
              value={layerStyle.color ?? "#FFFFFF"}
              onChange={handleCustomColorChange}
              className="sr-only"
              aria-label="Choose custom color"
            />
            <span className="mx-0.5 h-5 w-px shrink-0 bg-white/15" />
            <button
              type="button"
              aria-label="Effects"
              onClick={() => onOpenOverflow?.("advanced")}
              className={toolbarButtonClass}
            >
              <Wand2 className="h-3.5 w-3.5" />
            </button>
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
              aria-label="AI writing help"
              onClick={() => {
                setShowAiStrip((current) => {
                  const next = !current;
                  queueMicrotask(() => onLayoutChange?.());
                  return next;
                });
              }}
              className={`${toolbarButtonClass} ${
                showAiStrip ? "bg-[#0b63ce] text-white" : ""
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        {isSticker && (
          <>
            <button
              type="button"
              aria-label="Duplicate sticker"
              onClick={handleDuplicateLayer}
              className={toolbarButtonClass}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Delete sticker"
              onClick={handleDeleteLayer}
              className={toolbarButtonClass}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Smaller"
              onClick={() =>
                onUpdateLayerStyle?.(layer, {
                  fontScale: clampCreatorStudioFontScale(
                    (layerStyle.fontScale ?? 1) - 0.08
                  ),
                })
              }
              className={toolbarButtonClass}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Larger"
              onClick={() =>
                onUpdateLayerStyle?.(layer, {
                  fontScale: clampCreatorStudioFontScale(
                    (layerStyle.fontScale ?? 1) + 0.08
                  ),
                })
              }
              className={toolbarButtonClass}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        <button
          type="button"
          aria-label="More options"
          onClick={() => onOpenOverflow?.("advanced")}
          className={toolbarButtonClass}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>

      {showAiStrip && isTextLayer && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-1.5 flex flex-col gap-1.5 border-t border-white/10 pt-1.5"
        >
          <div className="flex gap-1.5 overflow-x-auto [-webkit-overflow-scrolling:touch]">
            {creatorStudioLayerRewriteActions.map((action) => (
              <button
                key={action.value}
                type="button"
                disabled={Boolean(loadingAction)}
                onClick={() => void runRewrite(action.value)}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold text-white/95 hover:bg-white/15 disabled:opacity-50 ${
                  action.value === "keep-words" ? "bg-white/10" : ""
                }`}
              >
                {loadingAction === action.value ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <span>{action.emoji}</span>
                )}
                {action.label}
              </button>
            ))}
          </div>
          {alternatives.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {alternatives.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    if (!onChange) return;
                    onChange(applyLayerRewriteText(layer, option, design));
                    setAlternatives([]);
                    setShowAiStrip(false);
                    onLayoutChange?.();
                  }}
                  className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/95 hover:bg-white/15"
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
});

export default CreatorStudioFloatingToolbar;
