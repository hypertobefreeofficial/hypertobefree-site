"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import {
  applyLayerRewriteText,
  creatorStudioLayerRewriteActions,
  requestCreatorStudioLayerRewrite,
  type CreatorStudioLayerRewriteAction,
} from "../../lib/creatorStudioLayerAiRewriteClient";
import type {
  CreatorStudioDesign,
  CreatorStudioTextLayer,
} from "../../lib/creationCenter";
import { supabase } from "../../lib/supabaseClient";

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
  const [suggestedText, setSuggestedText] = useState<string | null>(null);

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

  async function requestRewrite(action: CreatorStudioLayerRewriteAction) {
    setLoadingAction(action);
    setMessage("");
    setAlternatives([]);
    setSuggestedText(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const result = await requestCreatorStudioLayerRewrite({
        layer: selectedLayer,
        action,
        design,
        accessToken: session?.access_token,
      });

      if (result.kind === "error") {
        throw new Error(result.message);
      }

      if (result.kind === "alternatives") {
        setAlternatives(result.alternatives);
        setMessage("Pick an option below — nothing changes until you choose one.");
        return;
      }

      setSuggestedText(result.text);
      setMessage("Review the suggestion below. Nothing changes until you apply it.");
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
          AI assist · {layerLabel}
        </p>
        <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
          Light polish by default. Your meaning stays yours unless you choose a
          stronger rewrite.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {creatorStudioLayerRewriteActions.map((action) => (
          <button
            key={action.value}
            type="button"
            disabled={Boolean(loadingAction)}
            onClick={() => void requestRewrite(action.value)}
            title={action.description}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-3.5 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingAction === action.value ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <span>{action.emoji}</span>
            )}
            {action.label}
          </button>
        ))}
      </div>

      {suggestedText && (
        <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-blue-100">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#0b63ce]">
            Suggested wording
          </p>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#062a57]">
            {suggestedText}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onChange(applyLayerRewriteText(selectedLayer, suggestedText));
                setSuggestedText(null);
                setMessage("Applied. You can keep editing freely.");
              }}
              className="inline-flex min-h-10 items-center rounded-full bg-[#0b63ce] px-4 text-xs font-black text-white"
            >
              Use this wording
            </button>
            <button
              type="button"
              onClick={() => {
                setSuggestedText(null);
                setMessage("Kept your original words.");
              }}
              className="inline-flex min-h-10 items-center rounded-full bg-white px-4 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100"
            >
              Keep my words
            </button>
          </div>
        </div>
      )}

      {alternatives.length > 0 && (
        <div className="grid gap-2">
          {alternatives.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onChange(applyLayerRewriteText(selectedLayer, option));
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

      {!message && !suggestedText && alternatives.length === 0 && (
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
          <Sparkles className="h-3.5 w-3.5" />
          Suggestions appear here for you to review before applying.
        </p>
      )}
    </div>
  );
}
