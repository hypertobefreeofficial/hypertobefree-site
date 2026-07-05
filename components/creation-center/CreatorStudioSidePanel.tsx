"use client";

import { Loader2, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type {
  CreatorStudioDesign,
  CreatorStudioTextLayer,
} from "../../lib/creationCenter";
import type { CreatorStudioEditorPanel } from "./CreatorStudioLayoutEditor";
import CreatorStudioLayoutEditor from "./CreatorStudioLayoutEditor";
import CreatorStudioPreview from "./CreatorStudioPreview";
import type { CreatorStudioRailTool } from "./CreatorStudioToolRail";
import { mapRailToolToEditorPanel } from "./CreatorStudioToolRail";

type CreatorStudioSidePanelProps = {
  design: CreatorStudioDesign;
  onChange: (updates: Partial<CreatorStudioDesign>) => void;
  activeTool: CreatorStudioRailTool;
  activePanel: CreatorStudioEditorPanel;
  selectedLayer: CreatorStudioTextLayer;
  videoPreviewUrl: string | null;
  photoPreviewUrl: string | null;
  videoFileName: string | null;
  photoFileName: string | null;
  onVideoSelect: (file: File | null) => void;
  onPhotoSelect: (file: File | null) => void;
  onRemoveVideo: () => void;
  onRemovePhoto: () => void;
  aiControls?: ReactNode;
  designs?: CreatorStudioDesign[];
  selectedDesignId?: string | null;
  onSelectDesign?: (design: CreatorStudioDesign) => void;
  onGenerateConcepts?: () => void;
  conceptsLoading?: boolean;
  className?: string;
};

function getPanelTitle(activeTool: CreatorStudioRailTool) {
  if (activeTool === "design") return "AI Design Assistant";
  if (activeTool === "scripture") return "Scripture";
  if (activeTool === "filters") return "Filters & Effects";
  return "Text Settings";
}

function getPanelDescription(
  activeTool: CreatorStudioRailTool,
  selectedLayer: CreatorStudioTextLayer
) {
  if (activeTool === "design") {
    return "Style options from your media and words — typography, placement, and color only.";
  }
  if (activeTool === "scripture") {
    return "Add a reference that supports your testimony.";
  }
  if (activeTool === "filters") {
    return "Adjust color, contrast, and advanced visual settings.";
  }
  return `Edit the ${selectedLayer} layer — fonts, size, alignment, and story coach.`;
}

export default function CreatorStudioSidePanel({
  design,
  onChange,
  activeTool,
  activePanel,
  selectedLayer,
  videoPreviewUrl,
  photoPreviewUrl,
  videoFileName,
  photoFileName,
  onVideoSelect,
  onPhotoSelect,
  onRemoveVideo,
  onRemovePhoto,
  aiControls,
  designs = [],
  selectedDesignId,
  onSelectDesign,
  onGenerateConcepts,
  conceptsLoading = false,
  className = "",
}: CreatorStudioSidePanelProps) {
  const resolvedPanel =
    activePanel === "style" ? mapRailToolToEditorPanel(activeTool) : activePanel;

  const editorPanel: CreatorStudioEditorPanel =
    activeTool === "scripture"
      ? "scripture"
      : activeTool === "filters"
        ? resolvedPanel === "colors"
          ? "colors"
          : "advanced"
        : activeTool === "text"
          ? "fonts"
          : "ai";

  return (
    <aside
      className={`flex w-80 shrink-0 flex-col border-l border-white/10 bg-[#041527] text-white xl:w-96 2xl:w-[26rem] ${className}`}
      aria-label="Creator Studio panels"
    >
      <div className="shrink-0 border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-2">
          {activeTool === "design" && (
            <Sparkles className="h-4 w-4 text-[#69b7ff]" />
          )}
          <h3 className="text-sm font-black text-white">
            {getPanelTitle(activeTool)}
          </h3>
        </div>
        <p className="mt-1 text-xs font-medium leading-5 text-blue-100/70">
          {getPanelDescription(activeTool, selectedLayer)}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {activeTool === "design" && (
          <section className="space-y-4">
            {designs.length > 0 && onSelectDesign && (
              <div className="grid grid-cols-2 gap-2">
                {designs.slice(0, 6).map((concept) => {
                  const selected = selectedDesignId === concept.id;

                  return (
                    <button
                      key={concept.id}
                      type="button"
                      onClick={() => onSelectDesign(concept)}
                      className={`overflow-hidden rounded-xl ring-2 transition ${
                        selected
                          ? "ring-[#69b7ff] ring-offset-2 ring-offset-[#041527]"
                          : "ring-transparent hover:ring-white/20"
                      }`}
                    >
                      <CreatorStudioPreview
                        design={concept}
                        videoPreviewUrl={videoPreviewUrl}
                        photoPreviewUrl={photoPreviewUrl}
                        gallery
                      />
                    </button>
                  );
                })}
              </div>
            )}

            {onGenerateConcepts && (
              <button
                type="button"
                onClick={onGenerateConcepts}
                disabled={conceptsLoading}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-4 text-sm font-black text-white transition hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {conceptsLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Styling...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {designs.length > 0
                      ? "Generate more styles"
                      : "Style my testimony"}
                  </>
                )}
              </button>
            )}

            {aiControls ? (
              <div className="space-y-2 [&_*]:text-[#062a57]">{aiControls}</div>
            ) : null}
          </section>
        )}

        {activeTool !== "design" && (
          <section>
            <div className="rounded-2xl bg-white p-3 ring-1 ring-blue-100">
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
                activePanel={
                  activeTool === "text"
                    ? "fonts"
                    : activeTool === "filters"
                      ? "advanced"
                      : editorPanel
                }
                selectedLayer={selectedLayer}
              />
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
