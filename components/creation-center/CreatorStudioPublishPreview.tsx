"use client";

import { ChevronLeft, Upload } from "lucide-react";
import type { CreatorStudioDesign } from "../../lib/creationCenter";
import CreatorStudioStoryRenderer from "./CreatorStudioStoryRenderer";

type CreatorStudioPublishPreviewProps = {
  design: CreatorStudioDesign;
  videoPreviewUrl: string | null;
  photoPreviewUrl: string | null;
  onBackToEdit: () => void;
  onShare: () => void;
  sharing?: boolean;
};

export default function CreatorStudioPublishPreview({
  design,
  videoPreviewUrl,
  photoPreviewUrl,
  onBackToEdit,
  onShare,
  sharing = false,
}: CreatorStudioPublishPreviewProps) {
  return (
    <div className="mx-auto flex min-h-[min(100dvh,56rem)] w-full max-w-2xl flex-col bg-[#020617] lg:min-h-[calc(100dvh-5rem)] lg:max-w-3xl">
      <header className="shrink-0 border-b border-white/10 px-4 py-4 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#69b7ff]">
          Preview
        </p>
        <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">
          Ready to share?
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-blue-100/75">
          This is exactly how your testimony will appear in the feed.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="overflow-hidden rounded-[1.75rem] shadow-2xl shadow-black/30 ring-1 ring-white/10">
          <CreatorStudioStoryRenderer
            design={design}
            videoPreviewUrl={videoPreviewUrl}
            photoPreviewUrl={photoPreviewUrl}
            variant="publish"
          />
        </div>
      </div>

      <footer className="shrink-0 border-t border-white/10 bg-[#031d3d]/95 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onBackToEdit}
            disabled={sharing}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white/10 px-5 text-sm font-black text-white ring-1 ring-white/15 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Edit
          </button>
          <button
            type="button"
            onClick={onShare}
            disabled={sharing}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-6 text-sm font-black text-white shadow-lg shadow-blue-900/25 transition hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Share Testimony
            <Upload className="h-4 w-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}
