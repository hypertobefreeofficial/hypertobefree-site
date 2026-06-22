"use client";

import {
  Camera,
  FileText,
  Layers3,
  Mic2,
  PenLine,
  Sparkles,
  Video,
} from "lucide-react";
import { useState, type ComponentType } from "react";
import {
  CREATION_CENTER_IMAGES_ENABLED,
  creationCenterFormats,
  creationCenterStoryTypes,
  getCreationCenterTemplate,
  type CreationCenterFormat,
  type CreationCenterSuggestion,
  type CreationCenterStoryType,
  type CreationCenterTemplateId,
  type FaithStream,
} from "../../lib/creationCenter";
import FaithStreamPicker from "./FaithStreamPicker";
import GuidedPromptPanel from "./GuidedPromptPanel";
import StorySuggestions from "./StorySuggestions";
import StoryTemplatePicker from "./StoryTemplatePicker";

type CreationCenterProps = {
  format: CreationCenterFormat;
  storyType: CreationCenterStoryType;
  selectedStreams: FaithStream[];
  promptAnswers: Record<string, string>;
  draftText: string;
  suggestion: CreationCenterSuggestion | null;
  suggestionLoading: boolean;
  suggestionMessage: string;
  onFormatChange: (format: CreationCenterFormat) => void;
  onStoryTypeChange: (storyType: CreationCenterStoryType) => void;
  onToggleStream: (stream: FaithStream) => void;
  onPromptAnswerChange: (promptId: string, value: string) => void;
  onUsePromptAnswers: () => void;
  onSwitchToQuickShare: () => void;
  onRequestSuggestions: () => void;
  onUseSuggestedStoryType: (storyType: string) => void;
  onUseSuggestedTitle: (title: string) => void;
  onUseSuggestedStream: (stream: FaithStream) => void;
  onUseSuggestedStreams: (streams: FaithStream[]) => void;
  onUseSuggestedCaption: (caption: string) => void;
  onUseSuggestedScriptureReferences: (references: string[]) => void;
  onUseSuggestedTemplate: (template: string) => void;
  onClearSuggestions: () => void;
};

const formatIcons: Record<CreationCenterFormat, ComponentType<{ className?: string }>> = {
  video: Video,
  photo: Camera,
  "written-story": PenLine,
  "voice-message": Mic2,
  "testimony-card": FileText,
  "prayer-card": Layers3,
  "encouragement-card": Sparkles,
};

export default function CreationCenter({
  format,
  storyType,
  selectedStreams,
  promptAnswers,
  draftText,
  suggestion,
  suggestionLoading,
  suggestionMessage,
  onFormatChange,
  onStoryTypeChange,
  onToggleStream,
  onPromptAnswerChange,
  onUsePromptAnswers,
  onSwitchToQuickShare,
  onRequestSuggestions,
  onUseSuggestedStoryType,
  onUseSuggestedTitle,
  onUseSuggestedStream,
  onUseSuggestedStreams,
  onUseSuggestedCaption,
  onUseSuggestedScriptureReferences,
  onUseSuggestedTemplate,
  onClearSuggestions,
}: CreationCenterProps) {
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<CreationCenterTemplateId>("none");
  const selectedTemplate = getCreationCenterTemplate(selectedTemplateId);
  const visualImage = CREATION_CENTER_IMAGES_ENABLED
    ? selectedTemplate?.imagePath ?? null
    : null;
  const previewText =
    draftText.trim() ||
    Object.values(promptAnswers).find((answer) => answer.trim()) ||
    "Your story will begin to take shape here.";
  const formatLabel =
    creationCenterFormats.find((option) => option.value === format)?.label ??
    "Story";
  const templateLabel = selectedTemplate?.label ?? "No Template";

  return (
    <div className="w-full max-w-full overflow-hidden rounded-[2rem] bg-gradient-to-b from-blue-50 via-white to-white ring-1 ring-blue-100">
      <header className="relative overflow-hidden bg-[#062a57] px-5 py-6 text-white sm:px-7 sm:py-8">
        <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-[#0b63ce]/45 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xl">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">
              HTBF Creation Center
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              What has God done?
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-blue-100">
              Start with the story. Add only the guidance that helps you share
              it clearly and honestly.
            </p>
          </div>

          <button
            type="button"
            onClick={onSwitchToQuickShare}
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-white/10 px-4 py-2 text-xs font-black text-white ring-1 ring-white/20 hover:bg-white/15"
          >
            Use Quick Share
          </button>
        </div>
      </header>

      <div className="space-y-6 p-4 sm:p-6">
        <section>
          <div className="text-sm font-black text-[#062a57]">
            How would you like to share it?
          </div>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            Your existing HTBF photo and video tools will open below.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {creationCenterFormats.slice(0, 3).map((option) => {
              const Icon = formatIcons[option.value];
              const active = format === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onFormatChange(option.value)}
                  className={`min-w-0 rounded-[1.25rem] px-2 py-4 text-center ring-1 transition sm:px-4 ${
                    active
                      ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                      : "bg-white text-slate-600 ring-slate-200 hover:bg-blue-50"
                  }`}
                >
                  <Icon className="mx-auto h-5 w-5" />
                  <span className="mt-2 block truncate text-xs font-black sm:text-sm">
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex w-full max-w-full gap-2 overflow-x-auto pb-2">
            {creationCenterFormats.slice(3).map((option) => {
              const Icon = formatIcons[option.value];
              const active = format === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => option.available && onFormatChange(option.value)}
                  disabled={!option.available}
                  title={option.description}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-black ring-1 transition ${
                    active
                      ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                      : "bg-white text-slate-600 ring-slate-200 hover:bg-blue-50"
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                  {!option.available && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] uppercase text-slate-500">
                      Soon
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <StoryTemplatePicker
          value={selectedTemplateId}
          onChange={setSelectedTemplateId}
        />

        <section>
          <div className="text-sm font-black text-[#062a57]">
            Live preview
          </div>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            See the creative direction before choosing story details. Your
            existing photo or video editor continues below.
          </p>

          <div className="relative mt-3 min-h-[20rem] overflow-hidden rounded-[1.5rem] bg-[#062a57] p-5 text-white shadow-lg shadow-blue-950/10 ring-1 ring-blue-100 sm:min-h-[26rem] sm:p-7">
            {visualImage && (
              <img
                src={visualImage}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-[#031d3d]/90 via-[#062a57]/55 to-transparent" />
            <div className="relative z-10 flex min-h-[17.5rem] max-w-lg flex-col justify-between sm:min-h-[22.5rem]">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ring-white/20 backdrop-blur-sm">
                  {templateLabel}
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ring-white/15 backdrop-blur-sm">
                  {formatLabel}
                </span>
              </div>
              <p className="mt-6 line-clamp-4 whitespace-pre-wrap break-words text-lg font-black leading-7 text-white sm:text-xl">
                {previewText}
              </p>
            </div>
          </div>
        </section>

        <section>
          <div className="text-sm font-black text-[#062a57]">
            What kind of story is this?
          </div>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            This simply changes the guidance. It does not put your story in a
            box.
          </p>
          <div className="mt-3 flex w-full max-w-full gap-2 overflow-x-auto pb-2">
            {creationCenterStoryTypes.map((option) => {
              const active = storyType === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onStoryTypeChange(option.value)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-black ring-1 transition ${
                    active
                      ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                      : "bg-white text-slate-600 ring-slate-200 hover:bg-blue-50"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>

        <div className="h-px bg-slate-200" />

        <FaithStreamPicker
          selected={selectedStreams}
          onToggle={onToggleStream}
        />

        <div className="h-px bg-slate-200" />

        <GuidedPromptPanel
          storyType={storyType}
          answers={promptAnswers}
          onAnswerChange={onPromptAnswerChange}
          onUseAnswers={onUsePromptAnswers}
        />

        <StorySuggestions
          suggestion={suggestion}
          loading={suggestionLoading}
          message={suggestionMessage}
          selectedStreams={selectedStreams}
          onRequest={onRequestSuggestions}
          onUseStoryType={onUseSuggestedStoryType}
          onUseTitle={onUseSuggestedTitle}
          onUseFaithStream={onUseSuggestedStream}
          onUseAllFaithStreams={onUseSuggestedStreams}
          onUseCaption={onUseSuggestedCaption}
          onUseScriptureReferences={onUseSuggestedScriptureReferences}
          onUseTemplate={onUseSuggestedTemplate}
          onClear={onClearSuggestions}
        />
      </div>
    </div>
  );
}
