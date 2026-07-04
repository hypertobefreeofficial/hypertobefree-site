"use client";

import { useEffect } from "react";
import {
  type CreationCenterFormat,
  type CreationCenterSuggestion,
  type CreationCenterStoryType,
  type CreationCenterTemplateId,
  type CreatorStudioDesign,
  type CreatorStudioImageRequest,
  type CreatorStudioImageResult,
  type CreatorStudioRequestOptions,
  type FaithStream,
} from "../../lib/creationCenter";
import CreatorStudio from "./CreatorStudio";

type CreationCenterProps = {
  format: CreationCenterFormat;
  storyType: CreationCenterStoryType;
  selectedStreams: FaithStream[];
  promptAnswers: Record<string, string>;
  draftText: string;
  selectedTemplateId: CreationCenterTemplateId;
  suggestion: CreationCenterSuggestion | null;
  suggestionLoading: boolean;
  suggestionMessage: string;
  creatorStudioDesigns: CreatorStudioDesign[];
  creatorStudioLoading: boolean;
  creatorStudioMessage: string;
  creatorStudioVideoFileName: string | null;
  creatorStudioPhotoFileName: string | null;
  creatorStudioVideoPreviewUrl: string | null;
  creatorStudioPhotoPreviewUrl: string | null;
  onCreatorStudioVideoSelect: (file: File | null) => void;
  onCreatorStudioPhotoSelect: (file: File | null) => void;
  onCreatorStudioRemoveVideo: () => void;
  onCreatorStudioRemovePhoto: () => void;
  onFormatChange: (format: CreationCenterFormat) => void;
  onTemplateChange: (templateId: CreationCenterTemplateId) => void;
  onStoryTypeChange: (storyType: CreationCenterStoryType) => void;
  onToggleStream: (stream: FaithStream) => void;
  onPromptAnswerChange: (promptId: string, value: string) => void;
  onUsePromptAnswers: () => void;
  onSwitchToQuickShare: () => void;
  onExitStudio?: () => void;
  onRequestSuggestions: () => void;
  onRequestCreatorStudioDesigns: (
    prompt: string,
    inspirationChips: string[],
    options: CreatorStudioRequestOptions
  ) => void;
  onRequestCreatorStudioImage: (
    request: CreatorStudioImageRequest
  ) => Promise<CreatorStudioImageResult | null>;
  onUseCreatorStudioDesign: (design: CreatorStudioDesign) => void;
  onCreatorStudioActiveChange: (active: boolean) => void;
  onUseSuggestedStoryType: (storyType: string) => void;
  onUseSuggestedTitle: (title: string) => void;
  onUseSuggestedStream: (stream: FaithStream) => void;
  onUseSuggestedStreams: (streams: FaithStream[]) => void;
  onUseSuggestedCaption: (caption: string) => void;
  onUseSuggestedScriptureReferences: (references: string[]) => void;
  onUseSuggestedTemplate: (template: string) => void;
  onClearSuggestions: () => void;
};

export default function CreationCenter({
  creatorStudioDesigns,
  creatorStudioLoading,
  creatorStudioMessage,
  creatorStudioVideoFileName,
  creatorStudioPhotoFileName,
  creatorStudioVideoPreviewUrl,
  creatorStudioPhotoPreviewUrl,
  onCreatorStudioVideoSelect,
  onCreatorStudioPhotoSelect,
  onCreatorStudioRemoveVideo,
  onCreatorStudioRemovePhoto,
  onFormatChange,
  onSwitchToQuickShare,
  onExitStudio,
  onRequestCreatorStudioDesigns,
  onRequestCreatorStudioImage,
  onUseCreatorStudioDesign,
  onCreatorStudioActiveChange,
}: CreationCenterProps) {
  useEffect(() => {
    onCreatorStudioActiveChange(true);
    return () => onCreatorStudioActiveChange(false);
  }, [onCreatorStudioActiveChange]);

  return (
    <div className="w-full min-w-0 overflow-hidden">
      <div className="mb-3 flex items-center justify-end px-1 lg:px-0">
        <button
          type="button"
          onClick={onSwitchToQuickShare}
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-black text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-200"
        >
          Quick Share instead
        </button>
      </div>

      <CreatorStudio
        designs={creatorStudioDesigns}
        loading={creatorStudioLoading}
        message={creatorStudioMessage}
        videoFileName={creatorStudioVideoFileName}
        photoFileName={creatorStudioPhotoFileName}
        videoPreviewUrl={creatorStudioVideoPreviewUrl}
        photoPreviewUrl={creatorStudioPhotoPreviewUrl}
        onVideoSelect={onCreatorStudioVideoSelect}
        onPhotoSelect={onCreatorStudioPhotoSelect}
        onRemoveVideo={onCreatorStudioRemoveVideo}
        onRemovePhoto={onCreatorStudioRemovePhoto}
        onFormatChange={onFormatChange}
        onBack={onExitStudio ?? onSwitchToQuickShare}
        onRequestDesigns={onRequestCreatorStudioDesigns}
        onRequestImage={onRequestCreatorStudioImage}
        onUseDesign={onUseCreatorStudioDesign}
      />
    </div>
  );
}
