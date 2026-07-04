"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Loader2,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Type,
  Wand2,
} from "lucide-react";
import { useState } from "react";
import {
  applyLayerRewriteText,
  creatorStudioLayerRewriteActions,
  requestCreatorStudioLayerRewrite,
  type CreatorStudioLayerRewriteAction,
} from "../../lib/creatorStudioLayerAiRewriteClient";
import type {
  CreatorStudioDesign,
  CreatorStudioLayerStyle,
  CreatorStudioTextLayer,
} from "../../lib/creationCenter";
import { supabase } from "../../lib/supabaseClient";
import { clampCreatorStudioFontScale } from "../../lib/creatorStudioTypography";
import type { CreatorStudioEditorPanel } from "./CreatorStudioLayoutEditor";

type CreatorStudioFloatingToolbarProps = {
  layer: CreatorStudioTextLayer;
  layerStyle: CreatorStudioLayerStyle;
  design: CreatorStudioDesign;
  paletteSwatches: string[];
  onChange?: (updates: Partial<CreatorStudioDesign>) => void;
  onUpdateLayerStyle?: (
    layer: CreatorStudioTextLayer,
    updates: Partial<CreatorStudioLayerStyle>
  ) => void;
  onOpenOverflow?: (panel: CreatorStudioEditorPanel) => void;
  onBeginEdit?: (layer: CreatorStudioTextLayer) => void;
};

export default function CreatorStudioFloatingToolbar({
  layer,
  layerStyle,
  design,
  paletteSwatches,
  onChange,
  onUpdateLayerStyle,
  onOpenOverflow,
  onBeginEdit,
}: CreatorStudioFloatingToolbarProps) {
  const reducedMotion = useReducedMotion();
  const [showAiStrip, setShowAiStrip] = useState(false);
  const [loadingAction, setLoadingAction] =
    useState<CreatorStudioLayerRewriteAction | null>(null);

  const toolbarButtonClass =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[10px] font-bold text-white/90 hover:bg-white/10";

  async function runRewrite(action: CreatorStudioLayerRewriteAction) {
    if (!onChange) return;

    setLoadingAction(action);

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
      if (result.kind === "text") {
        onChange(applyLayerRewriteText(layer, result.text));
        setShowAiStrip(false);
      }
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-auto absolute -top-14 left-1/2 z-30 w-[min(96vw,30rem)] -translate-x-1/2 rounded-[1.25rem] bg-[#031d3d]/94 px-2 py-1.5 shadow-xl shadow-black/25 ring-1 ring-white/15 backdrop-blur-md"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-1 overflow-x-auto [-webkit-overflow-scrolling:touch]">
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
          aria-label="AI rewrite"
          onClick={() => setShowAiStrip((current) => !current)}
          className={`${toolbarButtonClass} ${
            showAiStrip ? "bg-[#0b63ce] text-white" : ""
          }`}
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

      {showAiStrip && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-1.5 flex gap-1.5 overflow-x-auto border-t border-white/10 pt-1.5 [-webkit-overflow-scrolling:touch]"
        >
          {creatorStudioLayerRewriteActions.map((action) => (
            <button
              key={action.value}
              type="button"
              disabled={Boolean(loadingAction)}
              onClick={() => void runRewrite(action.value)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white/95 hover:bg-white/15 disabled:opacity-50"
            >
              {loadingAction === action.value ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <span>{action.emoji}</span>
              )}
              {action.label}
            </button>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
