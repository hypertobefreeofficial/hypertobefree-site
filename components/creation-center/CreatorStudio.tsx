"use client";

import {
  BookOpen,
  Camera,
  Check,
  ImagePlus,
  Layers3,
  Mic2,
  PenLine,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  creationCenterStoryTemplates,
  creatorStudioCategoryOptions,
  creatorStudioLayoutOptions,
  creatorStudioMoodOptions,
  creatorStudioPathOptions,
  getCreationCenterTemplate,
  type CreationCenterFormat,
  type CreationCenterTemplateId,
  type CreatorStudioDesign,
  type CreatorStudioLayoutType,
  type CreatorStudioPath,
  type CreatorStudioRequestOptions,
  type CreatorStudioSourceMode,
} from "../../lib/creationCenter";
import CreatorStudioPreview from "./CreatorStudioPreview";

type CreatorStudioProps = {
  designs: CreatorStudioDesign[];
  loading: boolean;
  message: string;
  videoFileName: string | null;
  photoFileName: string | null;
  videoPreviewUrl: string | null;
  photoPreviewUrl: string | null;
  onVideoSelect: (file: File | null) => void;
  onPhotoSelect: (file: File | null) => void;
  onRemoveVideo: () => void;
  onRemovePhoto: () => void;
  onFormatChange: (format: CreationCenterFormat) => void;
  onBack: () => void;
  onRequestDesigns: (
    prompt: string,
    inspirationChips: string[],
    options: CreatorStudioRequestOptions
  ) => void;
  onUseDesign: (design: CreatorStudioDesign) => void;
};

const pathIcons: Record<
  CreatorStudioPath,
  ComponentType<{ className?: string }>
> = {
  "tell-story": PenLine,
  "create-design": Layers3,
  "scripture-post": BookOpen,
  "ai-surprise": Sparkles,
};

const inspirationChips = [
  "Testimony",
  "Prayer",
  "Healing",
  "Freedom",
  "Encouragement",
  "Worship",
  "Teaching",
  "Prophecy",
  "Deliverance",
  "Praise",
];

const pathDefaults: Record<
  CreatorStudioPath,
  {
    category: string;
    topic: string;
    mood: string;
    layoutType: CreatorStudioLayoutType;
    templateId: CreationCenterTemplateId;
  }
> = {
  "tell-story": {
    category: "Testimony",
    topic: "Freedom",
    mood: "Hopeful and bright",
    layoutType: "text-over-image-testimony",
    templateId: "none",
  },
  "create-design": {
    category: "Encouragement",
    topic: "Hope",
    mood: "Premium cinematic",
    layoutType: "magazine-style",
    templateId: "eagle-freedom",
  },
  "scripture-post": {
    category: "Bible Study",
    topic: "Scripture",
    mood: "Devotional",
    layoutType: "scripture-card",
    templateId: "scripture-woods",
  },
  "ai-surprise": {
    category: "Testimony",
    topic: "Breakthrough",
    mood: "Bold testimony",
    layoutType: "full-image-poster",
    templateId: "breaking-chains-deliverance",
  },
};

function getSourceMode({
  hasVideo,
  hasPhoto,
  templateId,
}: {
  hasVideo: boolean;
  hasPhoto: boolean;
  templateId: CreationCenterTemplateId;
}): CreatorStudioSourceMode {
  if (hasVideo) return "upload-video";
  if (hasPhoto) return "upload-photo";
  if (templateId !== "none") return "start-template";

  return "build-ai";
}

export default function CreatorStudio({
  designs,
  loading,
  message,
  videoFileName,
  photoFileName,
  videoPreviewUrl,
  photoPreviewUrl,
  onVideoSelect,
  onPhotoSelect,
  onRemoveVideo,
  onRemovePhoto,
  onFormatChange,
  onBack,
  onRequestDesigns,
  onUseDesign,
}: CreatorStudioProps) {
  const [studioPath, setStudioPath] =
    useState<CreatorStudioPath>("tell-story");
  const [prompt, setPrompt] = useState("");
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [category, setCategory] = useState(pathDefaults["tell-story"].category);
  const [topic, setTopic] = useState(pathDefaults["tell-story"].topic);
  const [mood, setMood] = useState(pathDefaults["tell-story"].mood);
  const [layoutType, setLayoutType] = useState<CreatorStudioLayoutType>(
    pathDefaults["tell-story"].layoutType
  );
  const [templateId, setTemplateId] = useState<CreationCenterTemplateId>(
    pathDefaults["tell-story"].templateId
  );
  const [hasRequested, setHasRequested] = useState(false);
  const [selectedDesignId, setSelectedDesignId] = useState<string | null>(null);
  const [editableDesign, setEditableDesign] =
    useState<CreatorStudioDesign | null>(null);

  const templateOptions = useMemo(
    () => creationCenterStoryTemplates.filter((template) => template.imagePath),
    []
  );
  const selectedTemplate = getCreationCenterTemplate(templateId);
  const sourceMode = getSourceMode({
    hasVideo: Boolean(videoPreviewUrl),
    hasPhoto: Boolean(photoPreviewUrl),
    templateId,
  });

  useEffect(() => {
    if (!hasRequested || designs.length === 0) return;

    const nextDesign =
      designs.find((design) => design.id === selectedDesignId) ?? designs[0];

    setSelectedDesignId(nextDesign.id);
    setEditableDesign(nextDesign);
  }, [designs, hasRequested]);

  function choosePath(nextPath: CreatorStudioPath) {
    const defaults = pathDefaults[nextPath];

    setStudioPath(nextPath);
    setCategory(defaults.category);
    setTopic(defaults.topic);
    setMood(defaults.mood);
    setLayoutType(defaults.layoutType);
    setTemplateId(defaults.templateId);
    setHasRequested(false);
    setSelectedDesignId(null);
    setEditableDesign(null);
    onFormatChange("testimony-card");
  }

  function toggleChip(chip: string) {
    setSelectedChips((current) =>
      current.includes(chip)
        ? current.filter((item) => item !== chip)
        : [...current, chip]
    );
    setTopic(chip);
  }

  function generateDesigns() {
    const cleanPrompt = prompt.trim();
    const fallbackPrompt =
      studioPath === "ai-surprise"
        ? "Surprise me with a polished HTBF post about what God is doing."
        : studioPath === "scripture-post"
          ? "Shape this as a scripture-centered reflection. Suggest references only."
          : studioPath === "create-design"
            ? "Create a beautiful HTBF design from this idea."
            : "Help me tell this story clearly.";

    setHasRequested(true);
    setSelectedDesignId(null);
    setEditableDesign(null);
    onRequestDesigns(cleanPrompt || fallbackPrompt, selectedChips, {
      studioPath,
      sourceMode,
      selectedTemplateId: templateId,
      category,
      topic,
      mood,
      layoutType,
    });
  }

  function updateEditableDesign(updates: Partial<CreatorStudioDesign>) {
    setEditableDesign((current) =>
      current ? { ...current, ...updates } : current
    );
  }

  function selectDesign(design: CreatorStudioDesign) {
    setSelectedDesignId(design.id);
    setEditableDesign(design);
  }

  function useEditableDesign() {
    if (!editableDesign) return;

    onUseDesign(editableDesign);
  }

  return (
    <section className="overflow-hidden rounded-[2rem] bg-white ring-1 ring-blue-100">
      <div className="relative overflow-hidden bg-[#062a57] px-5 py-6 text-white sm:px-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#0b63ce]/60 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-8 h-48 w-48 rounded-full bg-white/10 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-blue-100 ring-1 ring-white/15">
              <Sparkles className="h-3.5 w-3.5" />
              Creator Studio v2
            </div>
            <h3 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Design a faith-centered post with HTBF.
            </h3>
            <p className="mt-3 text-sm font-semibold leading-6 text-blue-100">
              Start with a story, media, scripture reflection, or a blank idea.
              HTBF shapes design directions, then you edit before submitting.
            </p>
          </div>

          <button
            type="button"
            onClick={onBack}
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-white/10 px-4 py-2 text-xs font-black text-white ring-1 ring-white/20 hover:bg-white/15"
          >
            Back to Creation Center
          </button>
        </div>
      </div>

      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-5">
          <section>
            <div className="text-sm font-black text-[#062a57]">
              Choose a path
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {creatorStudioPathOptions.map((option) => {
                const Icon = pathIcons[option.value];
                const selected = studioPath === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => choosePath(option.value)}
                    className={`rounded-[1.5rem] p-4 text-left ring-1 transition ${
                      selected
                        ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                        : "bg-blue-50/70 text-slate-600 ring-blue-100 hover:bg-white"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <div className="mt-3 text-sm font-black">
                      {option.title}
                    </div>
                    <p
                      className={`mt-2 text-xs font-semibold leading-5 ${
                        selected ? "text-blue-100" : "text-slate-500"
                      }`}
                    >
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[1.5rem] bg-blue-50/70 p-4 ring-1 ring-blue-100">
            <div className="text-sm font-black text-[#062a57]">
              Add media if you want
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="flex cursor-pointer flex-col items-center rounded-[1.25rem] bg-white p-4 text-center text-xs font-black text-[#0b63ce] ring-1 ring-blue-100 hover:bg-blue-50">
                <Video className="h-5 w-5" />
                <span className="mt-2">Video</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(event) =>
                    onVideoSelect(event.target.files?.[0] ?? null)
                  }
                  className="hidden"
                />
              </label>
              <label className="flex cursor-pointer flex-col items-center rounded-[1.25rem] bg-white p-4 text-center text-xs font-black text-[#0b63ce] ring-1 ring-blue-100 hover:bg-blue-50">
                <ImagePlus className="h-5 w-5" />
                <span className="mt-2">Photo</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    onPhotoSelect(event.target.files?.[0] ?? null)
                  }
                  className="hidden"
                />
              </label>
              <button
                type="button"
                disabled
                className="flex flex-col items-center rounded-[1.25rem] bg-white/70 p-4 text-center text-xs font-black text-slate-400 ring-1 ring-blue-100"
              >
                <Camera className="h-5 w-5" />
                <span className="mt-2">Multiple photos</span>
                <span className="mt-1 text-[10px]">Coming next</span>
              </button>
              <button
                type="button"
                disabled
                className="flex flex-col items-center rounded-[1.25rem] bg-white/70 p-4 text-center text-xs font-black text-slate-400 ring-1 ring-blue-100"
              >
                <Mic2 className="h-5 w-5" />
                <span className="mt-2">Voice/audio</span>
                <span className="mt-1 text-[10px]">Future-ready</span>
              </button>
            </div>

            {(videoFileName || photoFileName) && (
              <div className="mt-3 space-y-2">
                {videoFileName && (
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-xs font-bold text-[#082f63] ring-1 ring-blue-100">
                    <span className="truncate">{videoFileName}</span>
                    <button
                      type="button"
                      onClick={onRemoveVideo}
                      className="shrink-0 rounded-full bg-red-50 px-3 py-1 text-[10px] font-black text-red-600 ring-1 ring-red-100"
                    >
                      Remove
                    </button>
                  </div>
                )}
                {photoFileName && (
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-xs font-bold text-[#082f63] ring-1 ring-blue-100">
                    <span className="truncate">{photoFileName}</span>
                    <button
                      type="button"
                      onClick={onRemovePhoto}
                      className="shrink-0 rounded-full bg-red-50 px-3 py-1 text-[10px] font-black text-red-600 ring-1 ring-red-100"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          <section>
            <label
              htmlFor="creator-studio-v2-prompt"
              className="text-sm font-black text-[#062a57]"
            >
              Tell us what God is doing...
            </label>
            <textarea
              id="creator-studio-v2-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Tell us what God is doing..."
              rows={7}
              className="mt-3 w-full resize-none rounded-[1.75rem] border border-blue-100 bg-blue-50/70 px-5 py-5 text-lg font-semibold leading-8 text-[#062a57] outline-none transition placeholder:text-slate-400 focus:border-[#0b63ce] focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
              Category
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
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
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="Healing, freedom, prayer..."
                className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
              Mood / style
              <select
                value={mood}
                onChange={(event) => setMood(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
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
                value={layoutType}
                onChange={(event) =>
                  setLayoutType(event.target.value as CreatorStudioLayoutType)
                }
                className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
              >
                {creatorStudioLayoutOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section>
            <div className="text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
              Quick inspiration
            </div>
            <div className="mt-3 flex w-full max-w-full gap-2 overflow-x-auto pb-2">
              {inspirationChips.map((chip) => {
                const selected = selectedChips.includes(chip);

                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => toggleChip(chip)}
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
          </section>

          <section>
            <div className="text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
              Optional background
            </div>
            <div className="mt-3 flex w-full max-w-full gap-3 overflow-x-auto pb-2">
              <button
                type="button"
                onClick={() => setTemplateId("none")}
                className={`flex h-32 w-28 shrink-0 items-center justify-center rounded-[1.25rem] text-center text-xs font-black ring-2 ${
                  templateId === "none"
                    ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                    : "bg-white text-slate-600 ring-slate-200"
                }`}
              >
                No template
              </button>
              {templateOptions.map((template) => {
                const selected = templateId === template.id;

                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setTemplateId(template.id)}
                    className={`relative h-32 w-28 shrink-0 overflow-hidden rounded-[1.25rem] bg-slate-900 text-left ring-2 transition ${
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
            {selectedTemplate?.description && templateId !== "none" && (
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                {selectedTemplate.description}
              </p>
            )}
          </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={generateDesigns}
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {loading ? "Generating..." : "Generate Designs"}
              <Sparkles className="h-4 w-4" />
            </button>
            {message && (
              <p className="text-sm font-semibold leading-6 text-slate-600">
                {message}
              </p>
            )}
          </div>

          {hasRequested && !loading && designs.length === 0 && (
            <div className="rounded-[1.25rem] bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800 ring-1 ring-amber-100">
              No designs came back yet. Add a little more detail or choose a
              different mood/layout, then generate again.
            </div>
          )}
        </div>

        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <CreatorStudioPreview
            layoutType={layoutType}
            title={prompt || pathDefaults[studioPath].category}
            overlayText={prompt || "Your design preview updates here."}
            caption={prompt || "Tell us what God is doing, then generate polished options."}
            category={category}
            topic={topic}
            mood={mood}
            templateId={templateId}
            videoPreviewUrl={videoPreviewUrl}
            photoPreviewUrl={photoPreviewUrl}
          />

          {designs.length > 0 && (
            <section className="space-y-4">
              <div>
                <div className="text-sm font-black text-[#062a57]">
                  Choose a generated direction
                </div>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                  Each design is shaped by your path, prompt, media, mood,
                  layout, and template choices.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {designs.map((design) => {
                  const selected = selectedDesignId === design.id;

                  return (
                    <button
                      key={design.id}
                      type="button"
                      onClick={() => selectDesign(design)}
                      className={`relative text-left ring-2 transition ${
                        selected
                          ? "rounded-[1.5rem] ring-[#0b63ce] ring-offset-2"
                          : "rounded-[1.5rem] ring-transparent hover:ring-blue-200"
                      }`}
                    >
                      <CreatorStudioPreview
                        design={design}
                        videoPreviewUrl={videoPreviewUrl}
                        photoPreviewUrl={photoPreviewUrl}
                        compact
                      />
                      {selected && (
                        <span className="absolute right-3 top-3 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#0b63ce] shadow-sm">
                          <Check className="h-4 w-4" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {editableDesign && (
            <section className="space-y-4 rounded-[1.5rem] bg-blue-50/70 p-4 ring-1 ring-blue-100">
              <div>
                <div className="text-sm font-black text-[#062a57]">
                  Edit selected design
                </div>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                  Make it yours before submitting to the normal HTBF approval
                  flow.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                  Title / overlay text
                  <input
                    value={editableDesign.title}
                    onChange={(event) =>
                      updateEditableDesign({
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
                    value={editableDesign.category}
                    onChange={(event) =>
                      updateEditableDesign({ category: event.target.value })
                    }
                    className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                  />
                </label>
              </div>

              <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                Caption
                <textarea
                  value={editableDesign.caption}
                  onChange={(event) =>
                    updateEditableDesign({ caption: event.target.value })
                  }
                  rows={4}
                  className="mt-2 w-full resize-none rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-semibold normal-case leading-6 tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                  Template
                  <select
                    value={editableDesign.templateId}
                    onChange={(event) =>
                      updateEditableDesign({
                        templateId: event.target.value as CreationCenterTemplateId,
                      })
                    }
                    className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="none">No template</option>
                    {templateOptions.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                  Layout
                  <select
                    value={editableDesign.layoutType}
                    onChange={(event) =>
                      updateEditableDesign({
                        layoutType: event.target.value as CreatorStudioLayoutType,
                      })
                    }
                    className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                  >
                    {creatorStudioLayoutOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                  Mood
                  <input
                    value={editableDesign.styleMood}
                    onChange={(event) =>
                      updateEditableDesign({ styleMood: event.target.value })
                    }
                    className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                  />
                </label>
              </div>

              <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                Scripture suggestion
                <input
                  value={editableDesign.scriptureSuggestion}
                  onChange={(event) =>
                    updateEditableDesign({
                      scriptureSuggestion: event.target.value,
                    })
                  }
                  placeholder="Reference only, such as John 8:36"
                  className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <CreatorStudioPreview
                design={editableDesign}
                videoPreviewUrl={videoPreviewUrl}
                photoPreviewUrl={photoPreviewUrl}
              />

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={useEditableDesign}
                  className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-black text-[#0b63ce] ring-1 ring-blue-100 hover:bg-blue-50"
                >
                  Use This Design
                </button>
                <button
                  type="submit"
                  onClick={useEditableDesign}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-[#084f9f]"
                >
                  Submit Design for Review
                  <Upload className="h-4 w-4" />
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
