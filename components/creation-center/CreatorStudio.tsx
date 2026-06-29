"use client";

import {
  BookOpen,
  ImagePlus,
  Layers3,
  PenLine,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import {
  creatorStudioCategoryOptions,
  creatorStudioLayoutOptions,
  creatorStudioMoodOptions,
  creatorStudioPathOptions,
  type CreationCenterFormat,
  type CreationCenterTemplateId,
  type CreatorStudioDesign,
  type CreatorStudioLayoutType,
  type CreatorStudioPath,
  type CreatorStudioRequestOptions,
  type CreatorStudioSourceMode,
} from "../../lib/creationCenter";
import CreatorStudioDesignCards from "./CreatorStudioDesignCards";
import CreatorStudioGeneration from "./CreatorStudioGeneration";
import CreatorStudioLayoutEditor from "./CreatorStudioLayoutEditor";
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

type StudioScreen = "home" | "thinking" | "choose" | "editor" | "publish";

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
  "Healing",
  "Prayer",
  "Freedom",
  "Praise",
  "Worship",
  "Testimony",
  "Teaching",
  "Prophecy",
];

const studioSteps: { key: StudioScreen; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "thinking", label: "AI Thinking" },
  { key: "choose", label: "Choose Design" },
  { key: "editor", label: "Editor" },
  { key: "publish", label: "Publish" },
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
  const [screen, setScreen] = useState<StudioScreen>("home");
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

  const sourceMode = getSourceMode({
    hasVideo: Boolean(videoPreviewUrl),
    hasPhoto: Boolean(photoPreviewUrl),
    templateId,
  });
  const currentScreen: StudioScreen = loading ? "thinking" : screen;
  const currentLayoutLabel = getLayoutLabel(
    editableDesign?.layoutType ?? layoutType
  );
  const currentPathLabel = getPathLabel(studioPath);
  const hasMedia = Boolean(videoFileName || photoFileName);

  useEffect(() => {
    if (!hasRequested || loading || designs.length === 0) return;

    const nextDesign =
      designs.find((design) => design.id === selectedDesignId) ?? designs[0];

    setSelectedDesignId(nextDesign.id);
    setEditableDesign(nextDesign);
    setScreen("choose");
  }, [designs, hasRequested, loading]);

  useEffect(() => {
    if (!hasRequested || loading || designs.length > 0 || screen !== "thinking") {
      return;
    }

    setScreen("home");
  }, [designs.length, hasRequested, loading, screen]);

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
    setScreen("home");
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
    setScreen("thinking");
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
    <section className="w-full max-w-full min-w-0 overflow-hidden rounded-[2rem] bg-[#f8fafc] shadow-2xl shadow-blue-950/10 ring-1 ring-blue-100">
      <header className="relative overflow-hidden bg-white px-5 py-5 sm:px-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#0b63ce]/10 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#0b63ce] ring-1 ring-blue-100">
              <Sparkles className="h-3.5 w-3.5" />
              Creator Studio
            </div>
            <h3 className="mt-3 text-3xl font-black tracking-tight text-[#062a57] sm:text-5xl">
              Create beautiful faith-filled stories.
            </h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              Tell HTBF what God is doing. The studio shapes creative concepts,
              then you choose, edit, and submit for review.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
            <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#0b63ce]">
              <span className="rounded-full bg-blue-50 px-3 py-1 ring-1 ring-blue-100">
                {currentPathLabel}
              </span>
              <span className="rounded-full bg-blue-50 px-3 py-1 ring-1 ring-blue-100">
                {currentLayoutLabel}
              </span>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#062a57] px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-[#0b63ce]"
            >
              Back to Creation Center
            </button>
          </div>
        </div>

        <div className="relative z-10 mt-5 hidden items-center gap-3 overflow-hidden border-t border-blue-100 pt-4 lg:flex">
          {studioSteps.map((step, index) => {
            const active = currentScreen === step.key;
            const complete =
              studioSteps.findIndex((item) => item.key === currentScreen) >
              index;

            return (
              <div key={step.key} className="flex min-w-0 flex-1 items-center gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                    active || complete
                      ? "bg-[#0b63ce] text-white"
                      : "bg-blue-50 text-[#0b63ce] ring-1 ring-blue-100"
                  }`}
                >
                  {index + 1}
                </span>
                <span
                  className={`truncate text-xs font-black ${
                    active ? "text-[#062a57]" : "text-slate-400"
                  }`}
                >
                  {step.label}
                </span>
                {index < studioSteps.length - 1 && (
                  <span className="h-px flex-1 border-t border-dashed border-blue-200" />
                )}
              </div>
            );
          })}
        </div>
      </header>

      <div className="w-full max-w-full min-w-0 p-3 sm:p-5">
        {currentScreen === "thinking" && (
          <CreatorStudioGeneration message={message} />
        )}

        {currentScreen === "home" && (
          <div className="grid w-full max-w-full min-w-0 gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(20rem,0.55fr)]">
            <div className="min-w-0 space-y-5">
              <section className="rounded-[2rem] bg-white p-4 shadow-xl shadow-blue-950/5 ring-1 ring-blue-100 sm:p-5">
                <div className="mb-4 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-[#062a57]">
                      Start here
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Choose what you want HTBF to help create.
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                    Home
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {creatorStudioPathOptions.map((option, index) => {
                    const Icon = pathIcons[option.value];
                    const selected = studioPath === option.value;
                    const gradients = [
                      "from-[#0b63ce] to-[#084f9f]",
                      "from-[#6d5dfc] to-[#4f46e5]",
                      "from-[#0f9f9a] to-[#0b63ce]",
                      "from-[#f97316] to-[#ef4444]",
                    ];

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => choosePath(option.value)}
                        className={`group relative min-h-[10rem] overflow-hidden rounded-[1.6rem] bg-gradient-to-br ${
                          gradients[index] ?? gradients[0]
                        } p-4 text-left text-white shadow-lg transition hover:-translate-y-1 hover:shadow-2xl ${
                          selected
                            ? "ring-4 ring-[#0b63ce]/20"
                            : "ring-1 ring-white/20"
                        }`}
                      >
                        <span className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/15" />
                        <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white/18 ring-1 ring-white/20">
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="relative mt-4 text-base font-black">
                          {option.title}
                        </div>
                        <p className="relative mt-2 max-w-[13rem] text-xs font-semibold leading-5 text-white/85">
                          {option.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[2rem] bg-white p-4 shadow-xl shadow-blue-950/5 ring-1 ring-blue-100 sm:p-5">
                <label
                  htmlFor="creator-studio-v3-prompt"
                  className="text-sm font-black text-[#062a57]"
                >
                  What has God done?
                </label>
                <textarea
                  id="creator-studio-v3-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Tell us your testimony, prayer, worship moment, or what God placed on your heart..."
                  rows={5}
                  className="mt-3 w-full resize-none rounded-[1.5rem] border border-blue-100 bg-blue-50/70 px-5 py-5 text-base font-semibold leading-7 text-[#062a57] outline-none transition placeholder:text-slate-400 focus:border-[#0b63ce] focus:bg-white focus:ring-4 focus:ring-blue-100 sm:text-lg sm:leading-8"
                />

                <div className="mt-4 flex w-full max-w-full gap-2 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
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
                            : "bg-white text-slate-600 ring-blue-100 hover:-translate-y-0.5 hover:bg-blue-50"
                        }`}
                      >
                        {chip}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={generateDesigns}
                  disabled={loading}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-5 py-3.5 text-sm font-black text-white shadow-xl shadow-blue-900/20 transition hover:-translate-y-0.5 hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Generate Designs
                  <Sparkles className="h-4 w-4" />
                </button>
              </section>

              {hasRequested && !loading && designs.length === 0 && (
                <div className="rounded-[1.5rem] bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-700 ring-1 ring-red-100">
                  Couldn&apos;t generate designs. Try again.
                </div>
              )}
            </div>

            <aside className="min-w-0 space-y-4">
              <section className="rounded-[2rem] bg-white p-4 shadow-xl shadow-blue-950/5 ring-1 ring-blue-100">
                <div className="text-sm font-black text-[#062a57]">
                  Add media
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Optional. Uploads still use the existing HTBF flow.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="flex min-h-[7rem] cursor-pointer flex-col items-center justify-center rounded-[1.35rem] bg-gradient-to-br from-blue-50 to-white p-4 text-center text-xs font-black text-[#0b63ce] ring-1 ring-blue-100 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-950/10">
                    <ImagePlus className="h-6 w-6" />
                    <span className="mt-2">Upload Photo</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) =>
                        onPhotoSelect(event.target.files?.[0] ?? null)
                      }
                      className="hidden"
                    />
                  </label>

                  <label className="flex min-h-[7rem] cursor-pointer flex-col items-center justify-center rounded-[1.35rem] bg-gradient-to-br from-blue-50 to-white p-4 text-center text-xs font-black text-[#0b63ce] ring-1 ring-blue-100 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-950/10">
                    <Video className="h-6 w-6" />
                    <span className="mt-2">Upload Video</span>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(event) =>
                        onVideoSelect(event.target.files?.[0] ?? null)
                      }
                      className="hidden"
                    />
                  </label>
                </div>

                {hasMedia && (
                  <div className="mt-4 space-y-2">
                    {photoFileName && (
                      <div className="flex items-center justify-between gap-3 rounded-2xl bg-blue-50 px-4 py-3 text-xs font-bold text-[#082f63] ring-1 ring-blue-100">
                        <span className="truncate">{photoFileName}</span>
                        <button
                          type="button"
                          onClick={onRemovePhoto}
                          className="shrink-0 rounded-full bg-white px-3 py-1 text-[10px] font-black text-red-600 ring-1 ring-red-100"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    {videoFileName && (
                      <div className="flex items-center justify-between gap-3 rounded-2xl bg-blue-50 px-4 py-3 text-xs font-bold text-[#082f63] ring-1 ring-blue-100">
                        <span className="truncate">{videoFileName}</span>
                        <button
                          type="button"
                          onClick={onRemoveVideo}
                          className="shrink-0 rounded-full bg-white px-3 py-1 text-[10px] font-black text-red-600 ring-1 ring-red-100"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section className="rounded-[2rem] bg-white p-4 shadow-xl shadow-blue-950/5 ring-1 ring-blue-100">
                <div className="text-sm font-black text-[#062a57]">
                  Creative settings
                </div>
                <div className="mt-4 grid gap-3">
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
                    Mood
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
                        setLayoutType(
                          event.target.value as CreatorStudioLayoutType
                        )
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
            </aside>
          </div>
        )}

        {currentScreen === "choose" && designs.length > 0 && (
          <div className="grid w-full max-w-full min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.58fr)]">
            <CreatorStudioDesignCards
              designs={designs}
              selectedDesignId={selectedDesignId}
              videoPreviewUrl={videoPreviewUrl}
              photoPreviewUrl={photoPreviewUrl}
              onSelect={selectDesign}
            />

            <aside className="min-w-0 space-y-4">
              <section className="overflow-hidden rounded-[2rem] bg-[#031d3d] p-3 shadow-2xl shadow-blue-950/20 ring-1 ring-blue-100">
                <div className="mb-3 flex items-center justify-between gap-3 px-2 pt-1 text-white">
                  <div>
                    <div className="text-sm font-black">Preview</div>
                    <p className="mt-1 text-xs font-semibold text-blue-100">
                      Tap a concept to update this canvas.
                    </p>
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-100 ring-1 ring-white/15">
                    {currentLayoutLabel}
                  </span>
                </div>
                <CreatorStudioPreview
                  design={editableDesign}
                  videoPreviewUrl={videoPreviewUrl}
                  photoPreviewUrl={photoPreviewUrl}
                />
              </section>

              <button
                type="button"
                onClick={() => editableDesign && setScreen("editor")}
                disabled={!editableDesign}
                className="inline-flex w-full items-center justify-center rounded-full bg-[#0b63ce] px-5 py-3.5 text-sm font-black text-white shadow-xl shadow-blue-900/20 transition hover:-translate-y-0.5 hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Edit Selected Design
              </button>
            </aside>
          </div>
        )}

        {currentScreen === "editor" && editableDesign && (
          <div className="grid w-full max-w-full min-w-0 gap-5 xl:grid-cols-[minmax(0,0.66fr)_minmax(20rem,0.68fr)]">
            <CreatorStudioLayoutEditor
              design={editableDesign}
              onChange={updateEditableDesign}
            />

            <aside className="min-w-0 space-y-4 xl:sticky xl:top-5 xl:self-start">
              <section className="overflow-hidden rounded-[2rem] bg-[#031d3d] p-3 shadow-2xl shadow-blue-950/20 ring-1 ring-blue-100">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-2 pt-1 text-white">
                  <div>
                    <div className="text-sm font-black">Editor preview</div>
                    <p className="mt-1 text-xs font-semibold text-blue-100">
                      Your changes update live.
                    </p>
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-100 ring-1 ring-white/15">
                    {currentLayoutLabel}
                  </span>
                </div>
                <CreatorStudioPreview
                  design={editableDesign}
                  videoPreviewUrl={videoPreviewUrl}
                  photoPreviewUrl={photoPreviewUrl}
                />
              </section>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setScreen("choose")}
                  className="inline-flex flex-1 items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-black text-[#0b63ce] ring-1 ring-blue-100 transition hover:-translate-y-0.5 hover:bg-blue-50"
                >
                  Back to Designs
                </button>
                <button
                  type="button"
                  onClick={() => setScreen("publish")}
                  className="inline-flex flex-1 items-center justify-center rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-900/20 transition hover:-translate-y-0.5 hover:bg-[#084f9f]"
                >
                  Continue to Publish
                </button>
              </div>
            </aside>
          </div>
        )}

        {currentScreen === "publish" && editableDesign && (
          <div className="grid w-full max-w-full min-w-0 gap-5 xl:grid-cols-[minmax(0,0.72fr)_minmax(20rem,0.58fr)]">
            <section className="overflow-hidden rounded-[2rem] bg-[#031d3d] p-3 shadow-2xl shadow-blue-950/20 ring-1 ring-blue-100">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-2 pt-1 text-white">
                <div>
                  <div className="text-sm font-black">Publish preview</div>
                  <p className="mt-1 text-xs font-semibold text-blue-100">
                    Final check before sending to review.
                  </p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-100 ring-1 ring-white/15">
                  Approval flow
                </span>
              </div>
              <CreatorStudioPreview
                design={editableDesign}
                videoPreviewUrl={videoPreviewUrl}
                photoPreviewUrl={photoPreviewUrl}
              />
            </section>

            <aside className="min-w-0 space-y-4">
              <section className="rounded-[2rem] bg-white p-4 shadow-xl shadow-blue-950/5 ring-1 ring-blue-100">
                <div className="text-sm font-black text-[#062a57]">
                  Ready to submit?
                </div>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                  Your design will use HTBF&apos;s existing approval workflow
                  before appearing in the feed.
                </p>

                <label className="mt-4 block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
                  Caption
                  <textarea
                    value={editableDesign.caption}
                    onChange={(event) =>
                      updateEditableDesign({ caption: event.target.value })
                    }
                    rows={5}
                    className="mt-2 w-full resize-none rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-semibold normal-case leading-6 tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                  />
                </label>

                <div className="mt-4 grid gap-2 text-xs font-bold text-slate-500">
                  <div className="flex items-center justify-between rounded-2xl bg-blue-50 px-4 py-3">
                    <span>Category</span>
                    <span className="text-[#062a57]">
                      {editableDesign.category}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-blue-50 px-4 py-3">
                    <span>Destination</span>
                    <span className="text-[#062a57]">HTBF Feed</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-blue-50 px-4 py-3">
                    <span>Status</span>
                    <span className="text-[#062a57]">Submit for approval</span>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3">
                  <button
                    type="submit"
                    onClick={useEditableDesign}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-5 py-3.5 text-sm font-black text-white shadow-xl shadow-blue-900/20 transition hover:-translate-y-0.5 hover:bg-[#084f9f]"
                  >
                    Submit for Approval
                    <Upload className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setScreen("editor")}
                    className="inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-black text-[#0b63ce] ring-1 ring-blue-100 transition hover:-translate-y-0.5 hover:bg-blue-50"
                  >
                    Back to Editor
                  </button>
                </div>
              </section>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
