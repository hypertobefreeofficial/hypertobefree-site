"use client";

import {
  Camera,
  Check,
  FileText,
  ImagePlus,
  Layers3,
  Mic2,
  PenLine,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";
import {
  CREATION_CENTER_IMAGES_ENABLED,
  creationCenterFormats,
  creationCenterStoryTemplates,
  creationCenterStoryTypes,
  creatorStudioCategoryOptions,
  creatorStudioLayoutOptions,
  creatorStudioMoodOptions,
  getCreationCenterTemplate,
  type CreationCenterFormat,
  type CreationCenterSuggestion,
  type CreationCenterStoryType,
  type CreationCenterTemplateId,
  type CreatorStudioDesign,
  type CreatorStudioRequestOptions,
  type FaithStream,
} from "../../lib/creationCenter";
import FaithStreamPicker from "./FaithStreamPicker";
import GuidedPromptPanel from "./GuidedPromptPanel";
import StorySuggestions from "./StorySuggestions";
import StoryTemplatePicker from "./StoryTemplatePicker";

type CreatorStudioMode = CreatorStudioDesign["sourceMode"];

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
  onRequestSuggestions: () => void;
  onRequestCreatorStudioDesigns: (
    prompt: string,
    inspirationChips: string[],
    options: CreatorStudioRequestOptions
  ) => void;
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

const formatIcons: Record<
  CreationCenterFormat,
  ComponentType<{ className?: string }>
> = {
  video: Video,
  photo: Camera,
  "written-story": PenLine,
  "voice-message": Mic2,
  "testimony-card": FileText,
  "prayer-card": Layers3,
  "encouragement-card": Sparkles,
};

const creatorStudioChips = [
  "Testimony",
  "Prayer",
  "Healing",
  "Freedom",
  "Encouragement",
  "Worship",
  "Teaching",
  "Prophecy",
];

const creatorStudioModes: {
  value: CreatorStudioMode;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  {
    value: "upload-video",
    title: "Upload Video",
    description: "Add your video, then let HTBF suggest text and styling.",
    icon: Video,
  },
  {
    value: "upload-photo",
    title: "Upload Photo",
    description: "Use one photo now. Multi-photo layouts can come later.",
    icon: ImagePlus,
  },
  {
    value: "build-ai",
    title: "Build with AI",
    description: "Describe the moment and receive complete design concepts.",
    icon: Sparkles,
  },
  {
    value: "start-template",
    title: "Start from Template",
    description: "Choose a background first, then let HTBF shape the words.",
    icon: Layers3,
  },
];

const layoutLabels = Object.fromEntries(
  creatorStudioLayoutOptions.map((option) => [option.value, option.label])
) as Record<CreatorStudioDesign["layoutType"], string>;

export default function CreationCenter({
  format,
  storyType,
  selectedStreams,
  promptAnswers,
  draftText,
  selectedTemplateId,
  suggestion,
  suggestionLoading,
  suggestionMessage,
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
  onTemplateChange,
  onStoryTypeChange,
  onToggleStream,
  onPromptAnswerChange,
  onUsePromptAnswers,
  onSwitchToQuickShare,
  onRequestSuggestions,
  onRequestCreatorStudioDesigns,
  onUseCreatorStudioDesign,
  onCreatorStudioActiveChange,
  onUseSuggestedStoryType,
  onUseSuggestedTitle,
  onUseSuggestedStream,
  onUseSuggestedStreams,
  onUseSuggestedCaption,
  onUseSuggestedScriptureReferences,
  onUseSuggestedTemplate,
  onClearSuggestions,
}: CreationCenterProps) {
  const [creatorStudioOpen, setCreatorStudioOpen] = useState(false);
  const [creatorStudioMode, setCreatorStudioMode] =
    useState<CreatorStudioMode | null>(null);
  const [creatorStudioPrompt, setCreatorStudioPrompt] = useState("");
  const [creatorStudioSelectedChips, setCreatorStudioSelectedChips] = useState<
    string[]
  >([]);
  const [creatorStudioTemplateId, setCreatorStudioTemplateId] =
    useState<CreationCenterTemplateId>("scripture-woods");
  const [creatorStudioCategory, setCreatorStudioCategory] =
    useState("Testimony");
  const [creatorStudioTopic, setCreatorStudioTopic] =
    useState("Freedom");
  const [creatorStudioMood, setCreatorStudioMood] =
    useState("Hopeful and bright");
  const [creatorStudioLayoutType, setCreatorStudioLayoutType] =
    useState<CreatorStudioDesign["layoutType"]>(
      "text-over-image-testimony"
    );
  const [creatorStudioHasRequested, setCreatorStudioHasRequested] =
    useState(false);
  const [selectedCreatorStudioDesignId, setSelectedCreatorStudioDesignId] =
    useState<string | null>(null);
  const [editableCreatorStudioDesign, setEditableCreatorStudioDesign] =
    useState<CreatorStudioDesign | null>(null);

  const supportsStoryTemplates = format !== "video" && format !== "photo";
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
  const creatorStudioTemplateOptions = useMemo(
    () => creationCenterStoryTemplates.filter((template) => template.imagePath),
    []
  );
  const editableCreatorStudioTemplate = editableCreatorStudioDesign
    ? getCreationCenterTemplate(editableCreatorStudioDesign.templateId)
    : null;
  const creatorStudioSelectedTemplate = getCreationCenterTemplate(
    creatorStudioTemplateId
  );

  useEffect(() => {
    onCreatorStudioActiveChange(creatorStudioOpen);

    return () => onCreatorStudioActiveChange(false);
  }, [creatorStudioOpen, onCreatorStudioActiveChange]);

  useEffect(() => {
    if (!creatorStudioHasRequested || creatorStudioDesigns.length === 0) return;

    const nextDesign =
      creatorStudioDesigns.find(
        (design) => design.id === selectedCreatorStudioDesignId
      ) ?? creatorStudioDesigns[0];

    setSelectedCreatorStudioDesignId(nextDesign.id);
    setEditableCreatorStudioDesign(nextDesign);
  }, [creatorStudioDesigns, creatorStudioHasRequested]);

  function selectCreatorStudioMode(nextMode: CreatorStudioMode) {
    setCreatorStudioMode(nextMode);
    setCreatorStudioHasRequested(false);
    setSelectedCreatorStudioDesignId(null);
    setEditableCreatorStudioDesign(null);

    if (nextMode === "upload-video") {
      onFormatChange("video");
      return;
    }

    if (nextMode === "upload-photo") {
      onFormatChange("photo");
      return;
    }

    onFormatChange("testimony-card");
  }

  function toggleCreatorStudioChip(chip: string) {
    setCreatorStudioSelectedChips((current) =>
      current.includes(chip)
        ? current.filter((item) => item !== chip)
        : [...current, chip]
    );

    if (!creatorStudioCategory || creatorStudioCategory === "Testimony") {
      setCreatorStudioCategory(chip);
    }

    setCreatorStudioTopic(chip);
  }

  function generateCreatorStudioDesigns() {
    if (!creatorStudioMode) return;

    setCreatorStudioHasRequested(true);
    setSelectedCreatorStudioDesignId(null);
    setEditableCreatorStudioDesign(null);
    onRequestCreatorStudioDesigns(
      creatorStudioPrompt,
      creatorStudioSelectedChips,
      {
        sourceMode: creatorStudioMode,
        selectedTemplateId:
          creatorStudioMode === "start-template"
            ? creatorStudioTemplateId
            : "none",
        category: creatorStudioCategory,
        topic: creatorStudioTopic,
        mood: creatorStudioMood,
        layoutType: creatorStudioLayoutType,
      }
    );
  }

  function selectCreatorStudioDesign(design: CreatorStudioDesign) {
    setSelectedCreatorStudioDesignId(design.id);
    setEditableCreatorStudioDesign(design);
  }

  function updateEditableCreatorStudioDesign(
    updates: Partial<CreatorStudioDesign>
  ) {
    setEditableCreatorStudioDesign((current) =>
      current ? { ...current, ...updates } : current
    );
  }

  function useEditableCreatorStudioDesign() {
    if (!editableCreatorStudioDesign) return;

    onUseCreatorStudioDesign(editableCreatorStudioDesign);
  }

  function renderCreatorStudioMediaStep() {
    if (creatorStudioMode === "upload-video") {
      return (
        <div className="rounded-[1.5rem] border border-dashed border-blue-200 bg-blue-50/60 p-4">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-[1.25rem] bg-white px-4 py-6 text-center ring-1 ring-blue-100 hover:bg-blue-50">
            <Upload className="h-8 w-8 text-[#0b63ce]" />
            <div className="mt-3 text-sm font-black text-[#062a57]">
              Upload your video
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-500">
              Existing HTBF video upload and approval still handles publishing.
            </div>
            <input
              type="file"
              accept="video/*"
              onChange={(event) =>
                onCreatorStudioVideoSelect(event.target.files?.[0] ?? null)
              }
              className="hidden"
            />
          </label>

          {creatorStudioVideoPreviewUrl && (
            <video
              src={creatorStudioVideoPreviewUrl}
              controls
              playsInline
              className="mt-4 max-h-[420px] w-full rounded-[1.25rem] bg-black object-contain"
            />
          )}

          {creatorStudioVideoFileName && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#082f63] ring-1 ring-blue-100">
              <span className="truncate">{creatorStudioVideoFileName}</span>
              <button
                type="button"
                onClick={onCreatorStudioRemoveVideo}
                className="shrink-0 rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-600 ring-1 ring-red-100"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      );
    }

    if (creatorStudioMode === "upload-photo") {
      return (
        <div className="rounded-[1.5rem] border border-dashed border-blue-200 bg-blue-50/60 p-4">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-[1.25rem] bg-white px-4 py-6 text-center ring-1 ring-blue-100 hover:bg-blue-50">
            <ImagePlus className="h-8 w-8 text-[#0b63ce]" />
            <div className="mt-3 text-sm font-black text-[#062a57]">
              Upload your photo
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-500">
              One photo is supported now. Multi-photo layouts are ready for
              later.
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) =>
                onCreatorStudioPhotoSelect(event.target.files?.[0] ?? null)
              }
              className="hidden"
            />
          </label>

          {creatorStudioPhotoPreviewUrl && (
            <img
              src={creatorStudioPhotoPreviewUrl}
              alt=""
              className="mt-4 max-h-[420px] w-full rounded-[1.25rem] object-contain"
            />
          )}

          {creatorStudioPhotoFileName && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#082f63] ring-1 ring-blue-100">
              <span className="truncate">{creatorStudioPhotoFileName}</span>
              <button
                type="button"
                onClick={onCreatorStudioRemovePhoto}
                className="shrink-0 rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-600 ring-1 ring-red-100"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      );
    }

    if (creatorStudioMode === "start-template") {
      return (
        <div>
          <div className="text-sm font-black text-[#062a57]">
            Choose a starting template
          </div>
          <div className="mt-3 flex w-full max-w-full gap-3 overflow-x-auto pb-2">
            {creatorStudioTemplateOptions.map((template) => {
              const selected = creatorStudioTemplateId === template.id;

              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setCreatorStudioTemplateId(template.id)}
                  className={`relative h-40 w-32 shrink-0 overflow-hidden rounded-[1.25rem] bg-slate-900 text-left ring-2 transition ${
                    selected
                      ? "ring-[#0b63ce] ring-offset-2"
                      : "ring-transparent hover:ring-blue-200"
                  }`}
                >
                  {template.imagePath && (
                    <img
                      src={template.imagePath}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-[#031d3d]/90 via-transparent to-transparent" />
                  <span className="absolute inset-x-2 bottom-2 z-10 text-xs font-black leading-4 text-white">
                    {template.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    return null;
  }

  function renderCreatorStudioWorkingPreview() {
    if (creatorStudioMode === "upload-video" && creatorStudioVideoPreviewUrl) {
      return (
        <video
          src={creatorStudioVideoPreviewUrl}
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
      );
    }

    if (creatorStudioMode === "upload-photo" && creatorStudioPhotoPreviewUrl) {
      return (
        <img
          src={creatorStudioPhotoPreviewUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      );
    }

    if (
      creatorStudioMode === "start-template" &&
      creatorStudioSelectedTemplate?.imagePath
    ) {
      return (
        <img
          src={creatorStudioSelectedTemplate.imagePath}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      );
    }

    return null;
  }

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
        {creatorStudioOpen ? (
          <section className="overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-blue-100">
            <div className="relative overflow-hidden bg-[#062a57] px-5 py-6 text-white sm:px-7">
              <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#0b63ce]/55 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-16 left-8 h-44 w-44 rounded-full bg-white/10 blur-3xl" />

              <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-blue-100 ring-1 ring-white/15">
                    <Sparkles className="h-3.5 w-3.5" />
                    Creator Studio
                  </div>
                  <h3 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
                    Upload media or describe the moment.
                  </h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-blue-100">
                    HTBF helps shape the title, overlay text, caption, category,
                    layout, mood, and visual direction. You always preview and
                    edit before submitting.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setCreatorStudioOpen(false)}
                  className="inline-flex shrink-0 items-center justify-center rounded-full bg-white/10 px-4 py-2 text-xs font-black text-white ring-1 ring-white/20 hover:bg-white/15"
                >
                  Back to Creation Center
                </button>
              </div>
            </div>

            <div className="space-y-6 p-4 sm:p-6">
              <section>
                <div className="text-sm font-black text-[#062a57]">
                  How do you want to create?
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {creatorStudioModes.map((mode) => {
                    const Icon = mode.icon;
                    const selected = creatorStudioMode === mode.value;

                    return (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => selectCreatorStudioMode(mode.value)}
                        className={`rounded-[1.5rem] p-4 text-left ring-1 transition ${
                          selected
                            ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                            : "bg-white text-slate-600 ring-slate-200 hover:bg-blue-50"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        <div className="mt-3 text-sm font-black">
                          {mode.title}
                        </div>
                        <p
                          className={`mt-2 text-xs font-semibold leading-5 ${
                            selected ? "text-blue-100" : "text-slate-500"
                          }`}
                        >
                          {mode.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {creatorStudioMode && (
                <>
                  {renderCreatorStudioMediaStep()}

                  <section>
                    <label
                      htmlFor="creator-studio-prompt"
                      className="text-sm font-black text-[#062a57]"
                    >
                      Tell us what God is doing...
                    </label>
                    <textarea
                      id="creator-studio-prompt"
                      value={creatorStudioPrompt}
                      onChange={(event) =>
                        setCreatorStudioPrompt(event.target.value)
                      }
                      placeholder="Tell us what God is doing..."
                      rows={7}
                      className="mt-3 w-full resize-none rounded-[1.75rem] border border-blue-100 bg-blue-50/70 px-5 py-5 text-lg font-semibold leading-8 text-[#062a57] outline-none transition placeholder:text-slate-400 focus:border-[#0b63ce] focus:bg-white focus:ring-4 focus:ring-blue-100 sm:text-xl sm:leading-9"
                    />
                  </section>

                  <section className="grid gap-3 rounded-[1.5rem] bg-white p-4 ring-1 ring-blue-100 sm:grid-cols-4">
                    <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                      Category
                      <select
                        value={creatorStudioCategory}
                        onChange={(event) =>
                          setCreatorStudioCategory(event.target.value)
                        }
                        className="mt-2 w-full rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:bg-white focus:ring-4 focus:ring-blue-100"
                      >
                        {creatorStudioCategoryOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                      Topic
                      <input
                        value={creatorStudioTopic}
                        onChange={(event) =>
                          setCreatorStudioTopic(event.target.value)
                        }
                        placeholder="Freedom, healing, worship..."
                        className="mt-2 w-full rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:bg-white focus:ring-4 focus:ring-blue-100"
                      />
                    </label>

                    <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                      Mood
                      <select
                        value={creatorStudioMood}
                        onChange={(event) =>
                          setCreatorStudioMood(event.target.value)
                        }
                        className="mt-2 w-full rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:bg-white focus:ring-4 focus:ring-blue-100"
                      >
                        {creatorStudioMoodOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                      Layout
                      <select
                        value={creatorStudioLayoutType}
                        onChange={(event) =>
                          setCreatorStudioLayoutType(
                            event.target
                              .value as CreatorStudioDesign["layoutType"]
                          )
                        }
                        className="mt-2 w-full rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:bg-white focus:ring-4 focus:ring-blue-100"
                      >
                        {creatorStudioLayoutOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </section>

                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
                      Quick inspiration
                    </div>
                    <div className="mt-3 flex w-full max-w-full gap-2 overflow-x-auto pb-2">
                      {creatorStudioChips.map((chip) => {
                        const selected =
                          creatorStudioSelectedChips.includes(chip);

                        return (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => toggleCreatorStudioChip(chip)}
                            className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-black ring-1 transition ${
                              selected
                                ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                                : "bg-white text-slate-600 ring-slate-200 hover:bg-blue-50"
                            }`}
                          >
                            {chip}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="relative min-h-[18rem] overflow-hidden rounded-[1.5rem] bg-[#062a57] p-5 text-white ring-1 ring-blue-100">
                    {renderCreatorStudioWorkingPreview()}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#031d3d]/85 via-[#062a57]/35 to-transparent" />
                    <div className="relative z-10 flex min-h-[15rem] flex-col justify-between">
                      <div className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ring-1 ring-white/20 backdrop-blur-sm">
                        {creatorStudioModes.find(
                          (mode) => mode.value === creatorStudioMode
                        )?.title ?? "Creator Studio"}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ring-1 ring-white/20 backdrop-blur-sm">
                          {creatorStudioCategory}
                        </span>
                        <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ring-white/15 backdrop-blur-sm">
                          {layoutLabels[creatorStudioLayoutType]}
                        </span>
                      </div>
                      <p className="max-w-lg whitespace-pre-wrap break-words text-2xl font-black leading-tight text-white drop-shadow-sm">
                        {creatorStudioPrompt.trim() ||
                          "Your Creator Studio preview will appear here."}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={generateCreatorStudioDesigns}
                      disabled={creatorStudioLoading}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                      <Sparkles className="h-4 w-4" />
                      {creatorStudioLoading
                        ? "Generating..."
                        : "Generate Designs ✨"}
                    </button>

                      {creatorStudioMessage && (
                        <p className="text-sm font-semibold leading-6 text-slate-600">
                          {creatorStudioMessage}
                        </p>
                      )}
                  </div>

                  {creatorStudioHasRequested &&
                    !creatorStudioLoading &&
                    creatorStudioDesigns.length === 0 && (
                      <div className="rounded-[1.25rem] bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800 ring-1 ring-amber-100">
                        No designs came back yet. Try adding a little more
                        detail, or choose a mood and layout before generating
                        again.
                      </div>
                    )}
                </>
              )}

              {creatorStudioDesigns.length > 0 && (
                <div className="space-y-5">
                  <div>
                    <div className="text-sm font-black text-[#062a57]">
                      Choose a completed direction
                    </div>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                      Each option includes title, overlay text, caption,
                      category, topic, mood, layout, and post format.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {creatorStudioDesigns.map((design) => {
                      const selected =
                        selectedCreatorStudioDesignId === design.id;
                      const designTemplate = getCreationCenterTemplate(
                        design.templateId
                      );

                      return (
                        <button
                          key={design.id}
                          type="button"
                          onClick={() => selectCreatorStudioDesign(design)}
                          className={`group relative aspect-[4/5] overflow-hidden rounded-[1.25rem] bg-slate-900 text-left ring-2 transition ${
                            selected
                              ? "ring-[#0b63ce] ring-offset-2"
                              : "ring-transparent hover:ring-blue-200"
                          }`}
                        >
                          {designTemplate?.imagePath ? (
                            <img
                              src={designTemplate.imagePath}
                              alt=""
                              loading="lazy"
                              className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                            />
                          ) : (
                            renderCreatorStudioWorkingPreview()
                          )}
                          <span className="absolute inset-0 bg-gradient-to-t from-[#031d3d]/90 via-[#062a57]/20 to-transparent" />
                          {selected && (
                            <span className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#0b63ce]">
                              <Check className="h-4 w-4" />
                            </span>
                          )}
                          <span className="absolute inset-x-3 bottom-3 z-10">
                            <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-blue-100">
                              {design.category} •{" "}
                              {layoutLabels[design.layoutType]}
                            </span>
                            <span className="mt-1 line-clamp-2 block text-sm font-black leading-5 text-white">
                              {design.title}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {editableCreatorStudioDesign && (
                    <div className="space-y-4 rounded-[1.5rem] bg-blue-50/70 p-4 ring-1 ring-blue-100">
                      <div>
                        <div className="text-sm font-black text-[#062a57]">
                          Edit selected design
                        </div>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                          Adjust anything before it goes through the normal HTBF
                          approval flow.
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                          Title / overlay text
                          <input
                            value={editableCreatorStudioDesign.title}
                            onChange={(event) =>
                              updateEditableCreatorStudioDesign({
                                title: event.target.value,
                                overlayText: event.target.value,
                              })
                            }
                            className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                          />
                        </label>

                        <label className="text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                          Category
                          <input
                            value={editableCreatorStudioDesign.category}
                            onChange={(event) =>
                              updateEditableCreatorStudioDesign({
                                category: event.target.value,
                              })
                            }
                            className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                          />
                        </label>

                        <label className="text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                          Topic
                          <input
                            value={editableCreatorStudioDesign.topic}
                            onChange={(event) =>
                              updateEditableCreatorStudioDesign({
                                topic: event.target.value,
                              })
                            }
                            className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                          />
                        </label>
                      </div>

                      <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                        Caption
                        <textarea
                          value={editableCreatorStudioDesign.caption}
                          onChange={(event) =>
                            updateEditableCreatorStudioDesign({
                              caption: event.target.value,
                            })
                          }
                          rows={4}
                          className="mt-2 w-full resize-none rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-semibold normal-case leading-6 tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                        />
                      </label>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                          Template / background
                          <select
                            value={editableCreatorStudioDesign.templateId}
                            onChange={(event) =>
                              updateEditableCreatorStudioDesign({
                                templateId: event.target
                                  .value as CreationCenterTemplateId,
                              })
                            }
                            className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                          >
                            <option value="none">No template</option>
                            {creatorStudioTemplateOptions.map((template) => (
                              <option key={template.id} value={template.id}>
                                {template.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                          Layout
                          <select
                            value={editableCreatorStudioDesign.layoutType}
                            onChange={(event) =>
                              updateEditableCreatorStudioDesign({
                                layoutType: event.target
                                  .value as CreatorStudioDesign["layoutType"],
                              })
                            }
                            className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                          >
                            {Object.entries(layoutLabels).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                          Mood / style
                          <input
                            value={editableCreatorStudioDesign.styleMood}
                            onChange={(event) =>
                              updateEditableCreatorStudioDesign({
                                styleMood: event.target.value,
                              })
                            }
                            className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                          />
                        </label>
                      </div>

                      <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                        Scripture suggestion
                        <input
                          value={editableCreatorStudioDesign.scriptureSuggestion}
                          onChange={(event) =>
                            updateEditableCreatorStudioDesign({
                              scriptureSuggestion: event.target.value,
                            })
                          }
                          placeholder="Reference only, such as John 8:36"
                          className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                        />
                      </label>

                      <div className="relative min-h-[24rem] overflow-hidden rounded-[1.75rem] bg-[#062a57] p-5 text-white shadow-xl shadow-blue-950/10 ring-1 ring-blue-100 sm:min-h-[32rem] sm:p-8">
                        {editableCreatorStudioTemplate?.imagePath ? (
                          <img
                            src={editableCreatorStudioTemplate.imagePath}
                            alt=""
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          renderCreatorStudioWorkingPreview()
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#031d3d]/85 via-[#062a57]/35 to-transparent" />
                        <div className="relative z-10 flex min-h-[21rem] flex-col justify-between sm:min-h-[28rem]">
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ring-1 ring-white/20 backdrop-blur-sm">
                              {editableCreatorStudioDesign.category}
                            </span>
                            <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ring-white/15 backdrop-blur-sm">
                              {layoutLabels[editableCreatorStudioDesign.layoutType]}
                            </span>
                          </div>

                          <div>
                            <h4 className="max-w-xl whitespace-pre-wrap break-words text-[clamp(2rem,9vw,4.25rem)] font-black leading-none text-white drop-shadow-sm">
                              {editableCreatorStudioDesign.title ||
                                "God Is Moving"}
                            </h4>
                            <p className="mt-5 max-w-lg whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-blue-50 sm:text-base">
                              {editableCreatorStudioDesign.caption}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={useEditableCreatorStudioDesign}
                          className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-black text-[#0b63ce] ring-1 ring-blue-100 hover:bg-blue-50"
                        >
                          Use This Design
                        </button>
                        <button
                          type="submit"
                          onClick={useEditableCreatorStudioDesign}
                          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-[#084f9f]"
                        >
                          Submit Design for Review
                          <Sparkles className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        ) : (
          <>
            <section className="overflow-hidden rounded-[1.5rem] bg-white ring-1 ring-blue-100">
              <div className="relative overflow-hidden bg-gradient-to-br from-[#062a57] via-[#0b63ce] to-[#084f9f] p-5 text-white sm:p-6">
                <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
                <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="max-w-xl">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-blue-100 ring-1 ring-white/15">
                      <Sparkles className="h-3.5 w-3.5" />
                      Creator Studio
                    </div>
                    <h3 className="mt-3 text-xl font-black tracking-tight">
                      Creator Studio
                    </h3>
                    <p className="mt-2 text-base font-black text-white">
                      Upload media or build something beautiful with AI.
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-blue-100">
                      Start with your video, photo, template, or prompt, then
                      preview/edit the design before review.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setCreatorStudioOpen(true)}
                    className="inline-flex shrink-0 items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-black text-[#0b63ce] shadow-sm transition hover:bg-blue-50"
                  >
                    Open Creator Studio
                  </button>
                </div>
              </div>
            </section>

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
                      onClick={() =>
                        option.available && onFormatChange(option.value)
                      }
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

            {supportsStoryTemplates && (
              <>
                <StoryTemplatePicker
                  value={selectedTemplateId}
                  onChange={onTemplateChange}
                />

                <section>
                  <div className="text-sm font-black text-[#062a57]">
                    Live preview
                  </div>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                    See the creative direction before choosing story details.
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
              </>
            )}

            <section>
              <div className="text-sm font-black text-[#062a57]">
                What kind of story is this?
              </div>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                This simply changes the guidance. It does not put your story in
                a box.
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
              templateSuggestionsEnabled={supportsStoryTemplates}
              onClear={onClearSuggestions}
            />
          </>
        )}
      </div>
    </div>
  );
}
