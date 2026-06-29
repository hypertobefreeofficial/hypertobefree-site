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

function getLayoutLabel(layoutType: CreatorStudioLayoutType) {
  return (
    creatorStudioLayoutOptions.find((option) => option.value === layoutType)
      ?.label ?? "Creative direction"
  );
}

function getPathLabel(path: CreatorStudioPath) {
  return (
    creatorStudioPathOptions.find((option) => option.value === path)?.title ??
    "Creator Studio"
  );
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
  const statusTone = message.toLowerCase().includes("couldn")
    ? "error"
    : message.toLowerCase().includes("not connected") ||
        message.toLowerCase().includes("safe draft")
      ? "warning"
      : "success";
  const currentLayoutLabel = getLayoutLabel(
    editableDesign?.layoutType ?? layoutType
  );
  const currentPathLabel = getPathLabel(studioPath);

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
    <section className="w-full max-w-full min-w-0 overflow-hidden rounded-[2rem] bg-gradient-to-b from-white via-blue-50/60 to-white shadow-2xl shadow-blue-950/10 ring-1 ring-blue-100">
      <div className="relative overflow-hidden bg-[#062a57] px-5 py-6 text-white sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#0b63ce]/70 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-4 h-60 w-60 rounded-full bg-[#d4af37]/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />

        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-blue-100 ring-1 ring-white/15 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Creator Studio
            </div>
            <h3 className="mt-3 max-w-2xl text-3xl font-black tracking-tight sm:text-5xl">
              Turn what God is doing into a beautiful post.
            </h3>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-blue-100 sm:text-base">
              Choose a direction, tell the story, then pick the design that
              feels most alive before sending it through the normal HTBF review.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
            <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-blue-100">
              <span className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
                {currentPathLabel}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
                {currentLayoutLabel}
              </span>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex shrink-0 items-center justify-center rounded-full bg-white/10 px-4 py-2 text-xs font-black text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/15"
            >
              Back to Creation Center
            </button>
          </div>
        </div>
      </div>

      <div className="grid w-full max-w-full min-w-0 grid-cols-1 gap-5 p-3 sm:p-5 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] xl:gap-6">
        <div className="min-w-0 space-y-4">
          <section className="rounded-[1.75rem] bg-white/90 p-3 shadow-sm ring-1 ring-blue-100/80 backdrop-blur">
            <div className="flex items-end justify-between gap-3 px-1">
              <div>
                <div className="text-sm font-black text-[#062a57]">
                  Creative path
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Pick the mindset for this design.
                </p>
              </div>
              <span className="hidden rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#0b63ce] sm:inline-flex">
                Step 1
              </span>
            </div>
            <div className="mt-3 flex w-full max-w-full gap-3 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch] sm:grid sm:grid-cols-2 sm:overflow-visible xl:grid-cols-1">
              {creatorStudioPathOptions.map((option) => {
                const Icon = pathIcons[option.value];
                const selected = studioPath === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => choosePath(option.value)}
                    className={`group relative min-h-[8.5rem] w-[15.5rem] shrink-0 overflow-hidden rounded-[1.5rem] p-4 text-left ring-1 transition sm:w-auto ${
                      selected
                        ? "bg-[#0b63ce] text-white ring-[#0b63ce] shadow-xl shadow-blue-900/20"
                        : "bg-gradient-to-br from-blue-50 to-white text-slate-600 ring-blue-100 hover:-translate-y-0.5 hover:bg-white hover:shadow-lg hover:shadow-blue-950/10"
                    }`}
                  >
                    <span
                      className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full ${
                        selected ? "bg-white/15" : "bg-[#0b63ce]/5"
                      }`}
                    />
                    <span
                      className={`relative flex h-10 w-10 items-center justify-center rounded-2xl ${
                        selected
                          ? "bg-white/15 text-white ring-1 ring-white/20"
                          : "bg-white text-[#0b63ce] ring-1 ring-blue-100"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="relative mt-3 text-sm font-black">
                      {option.title}
                    </div>
                    <p
                      className={`relative mt-2 text-xs font-semibold leading-5 ${
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

          <section className="min-w-0 rounded-[1.75rem] bg-white/90 p-4 shadow-sm ring-1 ring-blue-100/80 backdrop-blur">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-sm font-black text-[#062a57]">
                  Add media
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Optional. Your prompt can stand alone.
                </p>
              </div>
              <span className="rounded-full bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                Optional
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
              <label className="flex cursor-pointer flex-col items-center rounded-[1.35rem] bg-gradient-to-br from-blue-50 to-white p-4 text-center text-xs font-black text-[#0b63ce] ring-1 ring-blue-100 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-950/10">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white ring-1 ring-blue-100">
                  <Video className="h-5 w-5" />
                </span>
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
              <label className="flex cursor-pointer flex-col items-center rounded-[1.35rem] bg-gradient-to-br from-blue-50 to-white p-4 text-center text-xs font-black text-[#0b63ce] ring-1 ring-blue-100 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-950/10">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white ring-1 ring-blue-100">
                  <ImagePlus className="h-5 w-5" />
                </span>
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
                className="flex flex-col items-center rounded-[1.35rem] bg-slate-50/80 p-4 text-center text-xs font-black text-slate-400 ring-1 ring-blue-100"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white ring-1 ring-slate-100">
                  <Camera className="h-5 w-5" />
                </span>
                <span className="mt-2">Multiple photos</span>
                <span className="mt-1 text-[10px]">Coming next</span>
              </button>
              <button
                type="button"
                disabled
                className="flex flex-col items-center rounded-[1.35rem] bg-slate-50/80 p-4 text-center text-xs font-black text-slate-400 ring-1 ring-blue-100"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white ring-1 ring-slate-100">
                  <Mic2 className="h-5 w-5" />
                </span>
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

          <section className="rounded-[1.75rem] bg-white/95 p-4 shadow-sm ring-1 ring-blue-100/80">
            <div className="flex items-end justify-between gap-3">
              <label
                htmlFor="creator-studio-v2-prompt"
                className="text-sm font-black text-[#062a57]"
              >
                Tell us what God is doing...
              </label>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                Story seed
              </span>
            </div>
            <textarea
              id="creator-studio-v2-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Tell us what God is doing..."
              rows={7}
              className="mt-3 w-full resize-none rounded-[1.5rem] border border-blue-100 bg-gradient-to-br from-blue-50/90 to-white px-5 py-5 text-lg font-semibold leading-8 text-[#062a57] outline-none transition placeholder:text-slate-400 focus:border-[#0b63ce] focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </section>

          <section className="rounded-[1.75rem] bg-white/95 p-4 shadow-sm ring-1 ring-blue-100/80">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <div className="text-sm font-black text-[#062a57]">
                  Design guidance
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  These choices shape the designs that come back.
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                Direction
              </span>
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
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
            </div>
          </section>

          <section className="rounded-[1.75rem] bg-white/90 p-4 shadow-sm ring-1 ring-blue-100/80">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
                Quick inspiration
              </div>
              <span className="text-[11px] font-bold text-slate-400">
                Swipe
              </span>
            </div>
            <div className="mt-3 flex w-full max-w-full gap-2 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
              {inspirationChips.map((chip) => {
                const selected = selectedChips.includes(chip);

                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => toggleChip(chip)}
                    className={`shrink-0 rounded-full px-4 py-2.5 text-xs font-black ring-1 transition ${
                      selected
                        ? "bg-[#0b63ce] text-white ring-[#0b63ce] shadow-lg shadow-blue-900/15"
                        : "bg-gradient-to-br from-white to-blue-50/70 text-slate-600 ring-blue-100 hover:-translate-y-0.5 hover:bg-blue-50"
                    }`}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[1.75rem] bg-white/90 p-4 shadow-sm ring-1 ring-blue-100/80">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
                  Optional background
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  A visual starting point for the design.
                </p>
              </div>
              <span className="text-[11px] font-bold text-slate-400">
                Swipe
              </span>
            </div>
            <div className="mt-3 flex w-full max-w-full gap-3 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
              <button
                type="button"
                onClick={() => setTemplateId("none")}
                className={`flex h-32 w-28 shrink-0 items-center justify-center rounded-[1.25rem] text-center text-xs font-black ring-2 transition ${
                  templateId === "none"
                    ? "bg-[#0b63ce] text-white ring-[#0b63ce] shadow-xl shadow-blue-900/20"
                    : "bg-gradient-to-br from-white to-blue-50 text-slate-600 ring-blue-100 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-950/10"
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
                        ? "scale-[1.02] ring-[#0b63ce] ring-offset-2 shadow-xl shadow-blue-900/20"
                        : "ring-transparent hover:-translate-y-0.5 hover:ring-blue-200 hover:shadow-lg hover:shadow-blue-950/10"
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

          <div className="rounded-[1.75rem] bg-[#062a57] p-3 shadow-xl shadow-blue-950/10 ring-1 ring-blue-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={generateDesigns}
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3.5 text-sm font-black text-[#0b63ce] shadow-lg shadow-blue-950/20 transition hover:-translate-y-0.5 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {loading ? "Creating your designs..." : "Generate Designs"}
              <Sparkles className="h-4 w-4" />
            </button>
            {message && (
              <p
                className={`rounded-2xl px-4 py-3 text-sm font-semibold leading-6 ring-1 ${
                  statusTone === "error"
                    ? "bg-red-50 text-red-700 ring-red-100"
                    : statusTone === "warning"
                      ? "bg-amber-50 text-amber-800 ring-amber-100"
                      : "bg-white/10 text-blue-50 ring-white/15"
                }`}
              >
                {message}
              </p>
            )}
            </div>
          </div>

          {loading && (
            <div className="rounded-[1.5rem] bg-blue-50 px-4 py-4 text-sm font-black text-[#0b63ce] ring-1 ring-blue-100">
              Creating your designs...
            </div>
          )}

          {hasRequested && !loading && designs.length === 0 && (
            <div className="rounded-[1.25rem] bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-700 ring-1 ring-red-100">
              Couldn&apos;t generate designs. Try again with a little more
              detail, or choose a different mood/layout.
            </div>
          )}

          {designs.length > 0 && (
            <section className="min-w-0 space-y-4 overflow-hidden rounded-[1.9rem] bg-white p-4 shadow-xl shadow-blue-950/10 ring-1 ring-blue-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-[#062a57]">
                    Choose a creative direction
                  </div>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                    Swipe the concepts. Select one to bring it into the canvas.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[#0b63ce] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">
                  {designs.length} ideas
                </span>
              </div>

              <div className="flex w-full max-w-full gap-4 overflow-x-auto pb-2 pt-1 [-webkit-overflow-scrolling:touch] sm:grid sm:grid-cols-2 sm:overflow-visible">
                {designs.map((design) => {
                  const selected = selectedDesignId === design.id;
                  const designLayoutLabel = getLayoutLabel(design.layoutType);

                  return (
                    <button
                      key={design.id}
                      type="button"
                      onClick={() => selectDesign(design)}
                      className={`group relative w-[17rem] shrink-0 overflow-hidden rounded-[1.75rem] bg-white p-2 text-left ring-2 transition sm:w-auto ${
                        selected
                          ? "scale-[1.01] ring-[#0b63ce] ring-offset-2 shadow-2xl shadow-blue-900/20"
                          : "ring-transparent shadow-sm shadow-blue-950/5 hover:-translate-y-1 hover:ring-blue-200 hover:shadow-xl hover:shadow-blue-950/10"
                      }`}
                    >
                      <div className="absolute inset-x-4 top-4 z-30 flex items-center justify-between gap-2">
                        <span className="rounded-full bg-white/90 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#0b63ce] shadow-sm backdrop-blur">
                          {designLayoutLabel}
                        </span>
                        <span className="rounded-full bg-[#062a57]/75 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white backdrop-blur">
                          {design.styleMood}
                        </span>
                      </div>
                      <CreatorStudioPreview
                        design={design}
                        videoPreviewUrl={videoPreviewUrl}
                        photoPreviewUrl={photoPreviewUrl}
                        compact
                      />
                      <div className="space-y-1 px-2 pb-2 pt-3">
                        <div className="line-clamp-1 text-sm font-black text-[#062a57]">
                          {design.title}
                        </div>
                        <p className="line-clamp-2 text-xs font-semibold leading-5 text-slate-500">
                          {design.caption}
                        </p>
                      </div>
                      {selected && (
                        <span className="absolute right-3 bottom-3 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-[#0b63ce] text-white shadow-lg shadow-blue-900/25">
                          <Check className="h-4 w-4" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <div className="min-w-0 space-y-5 xl:sticky xl:top-5 xl:self-start">
          <section className="overflow-hidden rounded-[2rem] bg-[#031d3d] p-3 shadow-2xl shadow-blue-950/20 ring-1 ring-blue-100">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-2 pt-1 text-white">
              <div>
                <div className="text-sm font-black">Live canvas</div>
                <p className="mt-1 text-xs font-semibold text-blue-100">
                  This updates as you choose a direction.
                </p>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-100 ring-1 ring-white/15">
                {currentLayoutLabel}
              </span>
            </div>
            <CreatorStudioPreview
              design={editableDesign}
              layoutType={layoutType}
              title={prompt || pathDefaults[studioPath].category}
              overlayText={prompt || "Your design preview updates here."}
              caption={
                prompt ||
                "Tell us what God is doing, then generate polished options."
              }
              category={category}
              topic={topic}
              mood={mood}
              templateId={templateId}
              videoPreviewUrl={videoPreviewUrl}
              photoPreviewUrl={photoPreviewUrl}
            />
          </section>

          {editableDesign && (
            <section className="space-y-4 rounded-[1.75rem] bg-white/95 p-4 shadow-xl shadow-blue-950/10 ring-1 ring-blue-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-[#062a57]">
                    Refine selected design
                  </div>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                    Make it yours before submitting to the normal HTBF approval
                    flow.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                  Edit
                </span>
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

              <div className="rounded-[1.5rem] bg-blue-50 p-2 ring-1 ring-blue-100">
                <CreatorStudioPreview
                  design={editableDesign}
                  videoPreviewUrl={videoPreviewUrl}
                  photoPreviewUrl={photoPreviewUrl}
                  compact
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={useEditableDesign}
                  className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-black text-[#0b63ce] ring-1 ring-blue-100 transition hover:-translate-y-0.5 hover:bg-blue-50"
                >
                  Use This Design
                </button>
                <button
                  type="submit"
                  onClick={useEditableDesign}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-900/20 transition hover:-translate-y-0.5 hover:bg-[#084f9f]"
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
