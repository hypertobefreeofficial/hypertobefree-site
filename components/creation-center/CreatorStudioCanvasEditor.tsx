"use client";

import { Sparkles, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  creatorStudioTextLayers,
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

const secondaryPanels: { value: CreatorStudioEditorPanel; label: string }[] = [
  { value: "layout", label: "Layout" },
  { value: "colors", label: "Colors" },
  { value: "media", label: "Media" },
  { value: "ai", label: "AI" },
  { value: "templates", label: "Templates" },
];

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
  const [drawerPanel, setDrawerPanel] =
    useState<CreatorStudioEditorPanel | null>(null);

  function toggleDrawer(panel: CreatorStudioEditorPanel) {
    setDrawerPanel((current) => (current === panel ? null : panel));
  }

  return (
    <div className="mx-auto min-w-0 max-w-4xl space-y-3">
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
      />

      <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        {secondaryPanels.map((panel) => (
          <button
            key={panel.value}
            type="button"
            onClick={() => toggleDrawer(panel.value)}
            className={`min-h-10 shrink-0 rounded-full px-4 text-xs font-black ring-1 ${
              drawerPanel === panel.value
                ? "bg-[#062a57] text-white ring-[#062a57]"
                : "bg-white text-slate-600 ring-blue-100"
            }`}
          >
            {panel.label}
          </button>
        ))}
      </div>

      {drawerPanel && (
        <div className="fixed inset-x-0 bottom-0 z-50 max-h-[min(68dvh,32rem)] overflow-hidden rounded-t-[1.5rem] bg-white shadow-2xl ring-1 ring-blue-100">
          <div className="flex items-center justify-between border-b border-blue-100 px-4 py-3">
            <p className="text-sm font-black capitalize text-[#062a57]">
              {drawerPanel}
            </p>
            <button
              type="button"
              onClick={() => setDrawerPanel(null)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-[#0b63ce]"
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[calc(min(68dvh,32rem)-3.5rem)] overflow-y-auto p-3 sm:p-4">
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
              activePanel={drawerPanel}
              onPanelChange={setDrawerPanel}
              aiControls={aiControls}
            />
          </div>
        </div>
      )}

      <div className="rounded-[1rem] bg-blue-50/80 px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.12em] text-blue-400">
        Tap text on the canvas to edit in place · drag to move ·{" "}
        <Sparkles className="mr-1 inline h-3 w-3" />
        {creatorStudioTextLayers.map((layer) => layer.label).join(" · ")}
      </div>
    </div>
  );
}
