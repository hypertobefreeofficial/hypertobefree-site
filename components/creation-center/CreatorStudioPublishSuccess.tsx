"use client";

import { CheckCircle2, Plus, Rss } from "lucide-react";
import type { CreatorStudioDesign } from "../../lib/creationCenter";
import CreatorStudioStoryRenderer from "./CreatorStudioStoryRenderer";

type CreatorStudioPublishSuccessProps = {
  design: CreatorStudioDesign;
  videoPreviewUrl: string | null;
  photoPreviewUrl: string | null;
  wentLiveInstantly: boolean;
  onViewFeed: () => void;
  onCreateAnother: () => void;
  onDone: () => void;
};

export default function CreatorStudioPublishSuccess({
  design,
  videoPreviewUrl,
  photoPreviewUrl,
  wentLiveInstantly,
  onViewFeed,
  onCreateAnother,
  onDone,
}: CreatorStudioPublishSuccessProps) {
  return (
    <div className="mx-auto flex min-h-[min(100dvh,56rem)] w-full max-w-2xl flex-col bg-[#020617] lg:min-h-[calc(100dvh-5rem)] lg:max-w-3xl">
      <header className="shrink-0 px-4 py-8 text-center sm:px-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/30">
          <CheckCircle2 className="h-9 w-9 text-emerald-400" />
        </div>
        <h2 className="mt-5 text-2xl font-black text-white sm:text-3xl">
          Your testimony has been shared.
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-blue-100/75">
          {wentLiveInstantly
            ? "It is live on HTBF now."
            : "It was submitted for review and will appear after approval."}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6">
        <div className="overflow-hidden rounded-[1.75rem] shadow-2xl shadow-black/30 ring-1 ring-white/10">
          <CreatorStudioStoryRenderer
            design={design}
            videoPreviewUrl={videoPreviewUrl}
            photoPreviewUrl={photoPreviewUrl}
            variant="publish"
          />
        </div>
      </div>

      <footer className="shrink-0 border-t border-white/10 bg-[#031d3d]/95 px-4 py-4 pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:px-6 lg:pb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={onViewFeed}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-4 text-sm font-black text-white shadow-lg shadow-blue-900/20 transition hover:bg-[#084f9f]"
          >
            <Rss className="h-4 w-4" />
            View in Feed
          </button>
          <button
            type="button"
            onClick={onCreateAnother}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white/10 px-4 text-sm font-black text-white ring-1 ring-white/15 transition hover:bg-white/15"
          >
            <Plus className="h-4 w-4" />
            Create Another Story
          </button>
          <button
            type="button"
            onClick={onDone}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-4 text-sm font-black text-[#062a57] transition hover:bg-blue-50"
          >
            Done
          </button>
        </div>
      </footer>
    </div>
  );
}
