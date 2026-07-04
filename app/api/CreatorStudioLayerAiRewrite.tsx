"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import {
  buildCreatorStudioLayerDisplayTextUpdate,
  getCreatorStudioLayerDisplayText,
  type CreatorStudioDesign,
  type CreatorStudioTextLayer,
} from "../../lib/creationCenter";
import { supabase } from "../../lib/supabaseClient";

export type CreatorStudioLayerRewriteAction =
  | "stronger"
  | "softer"
  | "hopeful"
  | "personal"
  | "biblical"
  | "shorten"
  | "alternatives";

const rewriteActions: {
  value: CreatorStudioLayerRewriteAction;
  label: string;
}[] = [
  { value: "stronger", label: "Make stronger" },
  { value: "softer", label: "Make softer" },
  { value: "hopeful", label: "Make more hopeful" },
  { value: "personal", label: "Make more personal" },
  { value: "biblical", label: "Make more biblical" },
  { value: "shorten", label: "Shorten" },
  { value: "alternatives", label: "Try 5 alternatives" },
];

type CreatorStudioLayerAiRewriteProps = {
  design: CreatorStudioDesign;
  selectedLayer: CreatorStudioTextLayer;
  onChange: (updates: Partial<CreatorStudioDesign>) => void;
};

export default function CreatorStudioLayerAiRewrite({
  design,
  selectedLayer,
  onChange,
}: CreatorStudioLayerAiRewriteProps) {
  const [loadingAction, setLoadingAction] =
    useState<CreatorStudioLayerRewriteAction | null>(null);
  const [message, setMessage] = useState("");
  const [alternatives, setAlternatives] = useState<string[]>([]);

  const layerLabel =
    selectedLayer === "title"
      ? "headline"
      : selectedLayer === "overlay"
        ? "subtitle"
        : selectedLayer === "caption"
          ? "caption"
          : selectedLayer === "scripture"
            ? "scripture"
            : "closing line";

  const currentText = getCreatorStudioLayerDisplayText(design, selectedLayer);

  async function requestRewrite(action: CreatorStudioLayerRewriteAction) {
    setLoadingAction(action);
    setMessage("");
    setAlternatives([]);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/creator-studio-rewrite-layer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          layer: selectedLayer,
          action,
          currentText,
          storyContext: {
            title: design.title,
            overlayText: design.overlayText,
            caption: design.caption,
            category: design.category,
            topic: design.topic,
            visualTheme: design.visualTheme,
            typographyStyle: design.typographyStyle,
          },
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        text?: string;
        alternatives?: string[];
      };

      if (!response.ok) {
        throw new Error(payload.error || "Could not rewrite this text right now.");
      }

      if (action === "alternatives" && payload.alternatives?.length) {
        setAlternatives(payload.alternatives);
        setMessage("Pick an option below — nothing changes until you choose one.");
        return;
      }

      if (payload.text?.trim()) {
        onChange(buildCreatorStudioLayerDisplayTextUpdate(selectedLayer, payload.text));
        setMessage("Updated. You can keep editing freely.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not rewrite this text right now."
      );
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="rounded-2xl bg-blue-50/70 px-4 py-3 ring-1 ring-blue-100">
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#0b63ce]">
          AI rewrite · {layerLabel}
        </p>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          {currentText.trim() || "Add a little text first, then ask AI for help."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {rewriteActions.map((action) => (
          <button
            key={action.value}
            type="button"
            disabled={Boolean(loadingAction) || !currentText.trim()}
            onClick={() => void requestRewrite(action.value)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-3.5 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingAction === action.value ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {action.label}
          </button>
        ))}
      </div>

      {alternatives.length > 0 && (
        <div className="grid gap-2">
          {alternatives.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onChange(
                  buildCreatorStudioLayerDisplayTextUpdate(selectedLayer, option)
                );
                setAlternatives([]);
                setMessage("Applied. You can keep refining it.");
              }}
              className="rounded-2xl bg-white px-4 py-3 text-left text-sm font-semibold leading-6 text-[#062a57] ring-1 ring-blue-100 transition hover:bg-blue-50"
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {message && (
        <p className="text-xs font-medium leading-5 text-slate-500">{message}</p>
      )}
    </div>
  );
}
