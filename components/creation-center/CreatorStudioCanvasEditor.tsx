"use client";

import { MoreHorizontal, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  type CreatorStudioDesign,
  type CreatorStudioTextLayer,
} from "../../lib/creationCenter";
import CreatorStudioInteractiveCanvas from "./CreatorStudioInteractiveCanvas";
import CreatorStudioLayoutEditor, {
  type CreatorStudioEditorPanel,
} from "./CreatorStudioLayoutEditor";

type CreatorStudioCanvasEditorProps = {
  design: CreatorStudioDesign;
  onChange: (updates: Partial<CreatorStudioDesign>) => void;
  videoPreviewUrl: string | null;
  photoPreviewUrl: string | null;
  videoFileName: string | null;
  photoFileName: string | null;
  onVideoSelect: (file: File | null) => void;
  onPhotoSelect: (file: File | null) => void;
  onRemoveVideo: () => void;
  onRemovePhoto: () => void;
  onContinueToPublish: () => void;
  onChangeConcept?: () => void;
  showChangeConcept?: boolean;
  aiControls: ReactNode;
};

export default function CreatorStudioCanvasEditor({
  design,
  onChange,
  videoPreviewUrl,
  photoPreviewUrl,
  videoFileName,
  photoFileName,
  onVideoSelect,
  onPhotoSelect,
  onRemoveVideo,
  onRemovePhoto,
  onContinueToPublish,
  onChangeConcept,
  showChangeConcept = false,
  aiControls,
}: CreatorStudioCanvasEditorProps) {
  const [selectedLayer, setSelectedLayer] =
    useState<CreatorStudioTextLayer>("title");
  const [overflowPanel, setOverflowPanel] =
    useState<CreatorStudioEditorPanel | null>(null);

  return (
    <div className="mx-auto min-w-0 max-w-4xl">
      <CreatorStudioInteractiveCanvas
        design={design}
        onChange={onChange}
        videoPreviewUrl={videoPreviewUrl}
        photoPreviewUrl={photoPreviewUrl}
        selectedLayer={selectedLayer}
        onSelectLayer={setSelectedLayer}
        onContinueToPublish={onContinueToPublish}
        onChangeConcept={onChangeConcept}
        showChangeConcept={showChangeConcept}
        onOpenOverflow={(panel) => setOverflowPanel(panel)}
      />

      {overflowPanel && (
        <div className="fixed inset-x-0 bottom-0 z-50 max-h-[min(52dvh,24rem)] overflow-hidden rounded-t-[1.5rem] bg-white/98 shadow-2xl ring-1 ring-blue-100 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-blue-100 px-4 py-3">
            <p className="text-sm font-black text-[#062a57] capitalize">
              {overflowPanel === "ai" ? "AI assist" : overflowPanel}
            </p>
            <button
              type="button"
              onClick={() => setOverflowPanel(null)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-[#0b63ce]"
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[calc(min(52dvh,24rem)-3.5rem)] overflow-y-auto p-3 sm:p-4">
            <CreatorStudioLayoutEditor
              compact
              design={design}
              onChange={onChange}
              videoFileName={videoFileName}
              photoFileName={photoFileName}
              onVideoSelect={onVideoSelect}
              onPhotoSelect={onPhotoSelect}
              onRemoveVideo={onRemoveVideo}
              onRemovePhoto={onRemovePhoto}
              activePanel={overflowPanel}
              onPanelChange={setOverflowPanel}
              aiControls={aiControls}
              selectedLayer={selectedLayer}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function CanvasOverflowButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="More options"
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md ring-1 ring-white/20 transition hover:bg-black/45"
    >
      <MoreHorizontal className="h-4 w-4" />
    </button>
  );
}
