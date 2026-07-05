"use client";

import { ChevronRight, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  type CreatorStudioDesign,
  type CreatorStudioTextLayer,
} from "../../lib/creationCenter";
import CreatorStudioInteractiveCanvas from "./CreatorStudioInteractiveCanvas";
import CreatorStudioLayoutEditor, {
  type CreatorStudioEditorPanel,
} from "./CreatorStudioLayoutEditor";
import CreatorStudioPreview from "./CreatorStudioPreview";
import CreatorStudioSidePanel from "./CreatorStudioSidePanel";
import CreatorStudioToolRail, {
  CreatorStudioMobileToolbar,
  mapRailToolToEditorPanel,
  type CreatorStudioRailTool,
} from "./CreatorStudioToolRail";

export type CreatorStudioCanvasEditorProps = {
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
  onStartOver?: () => void;
  onChangeConcept?: () => void;
  showChangeConcept?: boolean;
  onGenerateConcepts?: () => void;
  showGenerateConcepts?: boolean;
  conceptsLoading?: boolean;
  designs?: CreatorStudioDesign[];
  selectedDesignId?: string | null;
  onSelectDesign?: (design: CreatorStudioDesign) => void;
  aiControls?: ReactNode;
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
  onStartOver,
  onChangeConcept,
  showChangeConcept = false,
  onGenerateConcepts,
  showGenerateConcepts = false,
  conceptsLoading = false,
  designs = [],
  selectedDesignId,
  onSelectDesign,
  aiControls,
}: CreatorStudioCanvasEditorProps) {
  const [selectedLayer, setSelectedLayer] =
    useState<CreatorStudioTextLayer>("title");
  const [activeTool, setActiveTool] = useState<CreatorStudioRailTool>("text");
  const [mobilePanel, setMobilePanel] =
    useState<CreatorStudioEditorPanel | null>(null);

  const desktopPanel = mapRailToolToEditorPanel(activeTool);

  useEffect(() => {
    if (activeTool === "text") {
      setSelectedLayer("title");
    }
  }, [activeTool]);

  function handleToolChange(tool: CreatorStudioRailTool) {
    setActiveTool(tool);
    setMobilePanel(mapRailToolToEditorPanel(tool));
  }

  function handleOpenOverflow(panel: CreatorStudioEditorPanel) {
    setMobilePanel(panel);
  }

  return (
    <div className="relative flex min-h-[min(100dvh,56rem)] min-w-0 flex-col bg-[#020617] lg:min-h-[calc(100dvh-5rem)]">
      <div className="relative z-[60] hidden shrink-0 items-center justify-between border-b border-white/10 bg-[#031d3d] px-4 py-3 lg:flex">
        <div className="flex items-center gap-3">
          <div className="text-sm font-black text-white">Creator Studio</div>
          {onStartOver && (
            <button
              type="button"
              onClick={onStartOver}
              className="text-xs font-semibold text-blue-200/80 underline-offset-2 hover:text-white hover:underline"
            >
              Start Over
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showChangeConcept && onChangeConcept && (
            <button
              type="button"
              onClick={onChangeConcept}
              className="inline-flex min-h-10 items-center rounded-full bg-white/10 px-4 text-xs font-bold text-white ring-1 ring-white/15 hover:bg-white/15"
            >
              Other directions
            </button>
          )}
          {showGenerateConcepts && onGenerateConcepts && (
            <button
              type="button"
              onClick={onGenerateConcepts}
              disabled={conceptsLoading}
              className="inline-flex min-h-10 items-center rounded-full bg-white/10 px-4 text-xs font-bold text-white ring-1 ring-white/15 hover:bg-white/15 disabled:opacity-60"
            >
              Style my testimony
            </button>
          )}
          <button
            type="button"
            onClick={onContinueToPublish}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0b63ce] px-6 text-sm font-black text-white shadow-lg shadow-blue-900/30 transition hover:bg-[#084f9f]"
          >
            Continue
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        <CreatorStudioToolRail
          activeTool={activeTool}
          onToolChange={handleToolChange}
          className="hidden lg:flex"
        />

        <div className="relative min-h-0 min-w-0 flex-1 pb-[calc(11.5rem+4.75rem+env(safe-area-inset-bottom))] lg:pb-0">
          <CreatorStudioInteractiveCanvas
            design={design}
            onChange={onChange}
            videoPreviewUrl={videoPreviewUrl}
            photoPreviewUrl={photoPreviewUrl}
            selectedLayer={selectedLayer}
            onSelectLayer={setSelectedLayer}
            onChangeConcept={onChangeConcept}
            showChangeConcept={showChangeConcept}
            onGenerateConcepts={onGenerateConcepts}
            showGenerateConcepts={showGenerateConcepts}
            onOpenOverflow={handleOpenOverflow}
            hideTopActionsOnDesktop
            fillAvailableSpace
          />
        </div>

        <CreatorStudioSidePanel
          className="hidden lg:flex"
          design={design}
          onChange={onChange}
          activeTool={activeTool}
          activePanel={desktopPanel}
          selectedLayer={selectedLayer}
          videoPreviewUrl={videoPreviewUrl}
          photoPreviewUrl={photoPreviewUrl}
          videoFileName={videoFileName}
          photoFileName={photoFileName}
          onVideoSelect={onVideoSelect}
          onPhotoSelect={onPhotoSelect}
          onRemoveVideo={onRemoveVideo}
          onRemovePhoto={onRemovePhoto}
          aiControls={aiControls}
          designs={designs}
          selectedDesignId={selectedDesignId}
          onSelectDesign={onSelectDesign}
          onGenerateConcepts={onGenerateConcepts}
          conceptsLoading={conceptsLoading}
        />
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[45] lg:hidden">
        <div className="pointer-events-auto border-t border-white/10 bg-[#031d3d]/98 px-4 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          {onStartOver && (
            <div className="mb-2 text-center">
              <button
                type="button"
                onClick={onStartOver}
                className="text-[11px] font-semibold text-blue-200/80 underline-offset-2 hover:text-white hover:underline"
              >
                Start Over
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onContinueToPublish}
            className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-6 text-base font-black text-white shadow-lg shadow-blue-900/30 transition hover:bg-[#084f9f]"
          >
            Continue
            <ChevronRight className="h-5 w-5" />
          </button>
          <CreatorStudioMobileToolbar
            embedded
            activeTool={activeTool}
            onToolChange={handleToolChange}
          />
        </div>
      </div>

      {mobilePanel && (
        <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[80] max-h-[min(58dvh,26rem)] overflow-hidden rounded-t-[1.5rem] bg-white/98 shadow-2xl ring-1 ring-blue-100 backdrop-blur-xl lg:hidden">
          <div className="flex items-center justify-between border-b border-blue-100 px-4 py-3">
            <p className="text-sm font-black capitalize text-[#062a57]">
              {mobilePanel === "ai" ? "AI Design" : mobilePanel}
            </p>
            <button
              type="button"
              onClick={() => setMobilePanel(null)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-[#0b63ce]"
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[calc(min(58dvh,26rem)-3.5rem)] overflow-y-auto p-3 sm:p-4">
            {mobilePanel === "ai" ? (
              <div className="space-y-4">
                {designs.length > 0 && onSelectDesign && (
                  <div className="grid grid-cols-2 gap-2">
                    {designs.slice(0, 4).map((concept) => (
                      <button
                        key={concept.id}
                        type="button"
                        onClick={() => {
                          onSelectDesign(concept);
                          setMobilePanel(null);
                        }}
                        className="overflow-hidden rounded-xl ring-1 ring-blue-100"
                      >
                        <CreatorStudioPreview
                          design={concept}
                          videoPreviewUrl={videoPreviewUrl}
                          photoPreviewUrl={photoPreviewUrl}
                          gallery
                        />
                      </button>
                    ))}
                  </div>
                )}
                {onGenerateConcepts && (
                  <button
                    type="button"
                    onClick={onGenerateConcepts}
                    disabled={conceptsLoading}
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#0b63ce] px-4 text-sm font-black text-white disabled:opacity-60"
                  >
                    {conceptsLoading
                      ? "Styling..."
                      : designs.length > 0
                        ? "Generate more styles"
                        : "Style my testimony"}
                  </button>
                )}
                {aiControls}
              </div>
            ) : (
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
                activePanel={mobilePanel}
                onPanelChange={setMobilePanel}
                aiControls={aiControls}
                selectedLayer={selectedLayer}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
