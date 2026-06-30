"use client";

import {
  ImagePlus,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  creationCenterStoryTemplates,
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
type StudioTool =
  | "templates"
  | "ai"
  | "filters"
  | "text"
  | "scripture"
  | "layouts";

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

const studioToolOptions: { value: StudioTool; label: string }[] = [
  { value: "templates", label: "Templates" },
  { value: "ai", label: "AI" },
  { value: "filters", label: "Filters" },
  { value: "text", label: "Text" },
  { value: "scripture", label: "Scripture" },
  { value: "layouts", label: "Layouts" },
];

const visualFilterOptions = [
  {
    label: "Clean",
    mood: "Clean and minimal",
    treatment: "Natural media with crisp HTBF contrast",
    palette: ["#0B1D3A", "#FFFFFF", "#D4AF37"],
  },
  {
    label: "Warm",
    mood: "Warm encouragement",
    treatment: "Warm golden glow with soft contrast",
    palette: ["#7C2D12", "#FFF7ED", "#F97316"],
  },
  {
    label: "Cinematic",
    mood: "Premium cinematic",
    treatment: "Deep cinematic shadows with gold accent",
    palette: ["#020617", "#F8FAFC", "#D4AF37"],
  },
  {
    label: "Peaceful",
    mood: "Calm and prayerful",
    treatment: "Prayerful blue wash with gentle light",
    palette: ["#062A57", "#E0F2FE", "#93C5FD"],
  },
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
  const [activeTool, setActiveTool] = useState<StudioTool>("templates");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftOverlayText, setDraftOverlayText] = useState("");
  const [draftCaption, setDraftCaption] = useState("");
  const [scriptureSuggestion, setScriptureSuggestion] = useState("");
  const [colorPalette, setColorPalette] = useState<string[]>([
    "#0B1D3A",
    "#FFFFFF",
    "#D4AF37",
  ]);
  const [textStyle, setTextStyle] = useState<
    NonNullable<CreatorStudioDesign["textStyle"]>
  >({
    fontSize: "large",
    weight: "bold",
    italic: false,
    align: "left",
    color: "#FFFFFF",
    position: "bottom",
  });
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
  const promptPreview = prompt.trim();
  const canvasTitle =
    draftTitle.trim() ||
    promptPreview.split(/[.!?]/)[0]?.trim().slice(0, 64) ||
    "What God Is Doing";
  const canvasOverlayText =
    draftOverlayText.trim() || canvasTitle || "Share what God is doing";
  const canvasCaption =
    draftCaption.trim() ||
    promptPreview ||
    "Upload media, choose a template, or use AI to shape this post.";
  const canvasDesign: CreatorStudioDesign = {
    id: "creator-studio-live-canvas",
    studioPath,
    sourceMode,
    title: canvasTitle,
    overlayText: canvasOverlayText,
    caption: canvasCaption,
    category,
    topic,
    templateId,
    styleMood: mood,
    layoutType,
    scriptureSuggestion,
    suggestedPostFormat:
      sourceMode === "upload-video"
        ? "HTBF video post"
        : sourceMode === "upload-photo"
          ? "HTBF photo post"
          : "HTBF design post",
    colorPalette,
    typographyStyle: textStyle.weight === "bold" ? "Bold HTBF headline" : "Clean HTBF type",
    designTreatment: mood,
    textStyle,
  };

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

  function handlePhotoSelect(file: File | null) {
    onFormatChange("photo");
    onPhotoSelect(file);
    if (file) setTemplateId("none");
  }

  function handleVideoSelect(file: File | null) {
    onFormatChange("video");
    onVideoSelect(file);
    if (file) setTemplateId("none");
  }

  function prepareDraftForPublish() {
    setEditableDesign(canvasDesign);
    setSelectedDesignId(canvasDesign.id);
    setScreen("publish");
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
          <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-4">
            <section className="overflow-hidden rounded-[2rem] bg-[#031d3d] p-3 shadow-2xl shadow-blue-950/20 ring-1 ring-blue-100 sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-2 pt-1 text-white">
                <div>
                  <div className="text-sm font-black">Create from media</div>
                  <p className="mt-1 text-xs font-semibold text-blue-100">
                    Upload first, then use tools to shape the post.
                  </p>
                </div>
                <div className="flex gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-[#0b63ce] shadow-sm transition hover:bg-blue-50">
                    <ImagePlus className="h-4 w-4" />
                    Photo
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) =>
                        handlePhotoSelect(event.target.files?.[0] ?? null)
                      }
                      className="hidden"
                    />
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-xs font-black text-white ring-1 ring-white/20 transition hover:bg-white/18">
                    <Video className="h-4 w-4" />
                    Video
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(event) =>
                        handleVideoSelect(event.target.files?.[0] ?? null)
                      }
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="mx-auto w-full max-w-[42rem]">
                <CreatorStudioPreview
                  design={canvasDesign}
                  videoPreviewUrl={videoPreviewUrl}
                  photoPreviewUrl={photoPreviewUrl}
                  canvas
                />
              </div>

              {hasMedia && (
                <div className="mt-3 grid gap-2 px-1 sm:grid-cols-2">
                  {photoFileName && (
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-3 text-xs font-bold text-white ring-1 ring-white/15">
                      <span className="truncate">{photoFileName}</span>
                      <button
                        type="button"
                        onClick={onRemovePhoto}
                        className="shrink-0 rounded-full bg-white px-3 py-1 text-[10px] font-black text-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  {videoFileName && (
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-3 text-xs font-bold text-white ring-1 ring-white/15">
                      <span className="truncate">{videoFileName}</span>
                      <button
                        type="button"
                        onClick={onRemoveVideo}
                        className="shrink-0 rounded-full bg-white px-3 py-1 text-[10px] font-black text-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-[2rem] bg-white shadow-xl shadow-blue-950/5 ring-1 ring-blue-100">
              <div className="flex w-full max-w-full gap-2 overflow-x-auto border-b border-blue-100 px-4 py-3 [-webkit-overflow-scrolling:touch] sm:px-5">
                {studioToolOptions.map((tool) => {
                  const selected = activeTool === tool.value;

                  return (
                    <button
                      key={tool.value}
                      type="button"
                      onClick={() => setActiveTool(tool.value)}
                      className={`shrink-0 rounded-full px-4 py-2.5 text-xs font-black ring-1 transition ${
                        selected
                          ? "bg-[#0b63ce] text-white ring-[#0b63ce] shadow-lg shadow-blue-900/15"
                          : "bg-white text-slate-600 ring-blue-100 hover:bg-blue-50"
                      }`}
                    >
                      {tool.label}
                    </button>
                  );
                })}
              </div>

              <div className="p-4 sm:p-5">
                {activeTool === "templates" && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {creationCenterStoryTemplates
                      .filter((template) => template.id === "none" || template.imagePath)
                      .map((template) => {
                        const selected = templateId === template.id;

                        return (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => {
                              setTemplateId(template.id);
                              if (template.id !== "none") {
                                onFormatChange("testimony-card");
                              }
                            }}
                            className={`overflow-hidden rounded-2xl text-left ring-2 transition ${
                              selected
                                ? "ring-[#0b63ce] ring-offset-2 shadow-xl shadow-blue-900/15"
                                : "ring-blue-100 hover:-translate-y-0.5 hover:ring-blue-200"
                            }`}
                          >
                            <div className="relative aspect-[4/3] bg-blue-50">
                              {template.imagePath ? (
                                <img
                                  src={template.imagePath}
                                  alt=""
                                  className="absolute inset-0 h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#062a57] to-[#0b63ce] text-xs font-black uppercase tracking-[0.14em] text-white">
                                  Clean
                                </div>
                              )}
                            </div>
                            <div className="bg-white px-3 py-3">
                              <div className="text-sm font-black text-[#062a57]">
                                {template.label}
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">
                                {template.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                )}

                {activeTool === "ai" && (
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <div>
                      <label
                        htmlFor="creator-studio-media-prompt"
                        className="text-sm font-black text-[#062a57]"
                      >
                        Tell us what God is doing
                      </label>
                      <textarea
                        id="creator-studio-media-prompt"
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        placeholder="Describe the story, prayer, worship moment, or what this media means..."
                        rows={4}
                        className="mt-3 w-full resize-none rounded-[1.5rem] border border-blue-100 bg-blue-50/70 px-5 py-4 text-base font-semibold leading-7 text-[#062a57] outline-none transition placeholder:text-slate-400 focus:border-[#0b63ce] focus:bg-white focus:ring-4 focus:ring-blue-100"
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
                                  ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                                  : "bg-white text-slate-600 ring-blue-100 hover:bg-blue-50"
                              }`}
                            >
                              {chip}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={generateDesigns}
                      disabled={loading}
                      className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-6 py-3 text-sm font-black text-white shadow-xl shadow-blue-900/20 transition hover:-translate-y-0.5 hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60 lg:self-end"
                    >
                      Generate Designs
                      <Sparkles className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {activeTool === "filters" && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {visualFilterOptions.map((filter) => (
                      <button
                        key={filter.label}
                        type="button"
                        onClick={() => {
                          setMood(filter.mood);
                          setColorPalette(filter.palette);
                          setTextStyle((current) => ({
                            ...current,
                            color: filter.palette[1],
                          }));
                        }}
                        className="rounded-2xl bg-white p-4 text-left ring-1 ring-blue-100 transition hover:-translate-y-0.5 hover:bg-blue-50 hover:shadow-lg hover:shadow-blue-950/10"
                      >
                        <div className="flex gap-1">
                          {filter.palette.map((color) => (
                            <span
                              key={color}
                              className="h-8 w-8 rounded-full ring-1 ring-white"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                        <div className="mt-3 text-sm font-black text-[#062a57]">
                          {filter.label}
                        </div>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                          {filter.treatment}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {activeTool === "text" && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <input
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      placeholder="Title"
                      className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base font-bold text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                    />
                    <input
                      value={draftOverlayText}
                      onChange={(event) => setDraftOverlayText(event.target.value)}
                      placeholder="Overlay text"
                      className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base font-bold text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                    />
                    <textarea
                      value={draftCaption}
                      onChange={(event) => setDraftCaption(event.target.value)}
                      placeholder="Caption"
                      rows={3}
                      className="w-full resize-none rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base font-semibold leading-7 text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100 lg:col-span-2"
                    />
                    <select
                      value={textStyle.fontSize}
                      onChange={(event) =>
                        setTextStyle((current) => ({
                          ...current,
                          fontSize: event.target.value as NonNullable<
                            CreatorStudioDesign["textStyle"]
                          >["fontSize"],
                        }))
                      }
                      className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base font-bold text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                      <option value="hero">Hero</option>
                    </select>
                    <select
                      value={textStyle.align}
                      onChange={(event) =>
                        setTextStyle((current) => ({
                          ...current,
                          align: event.target.value as NonNullable<
                            CreatorStudioDesign["textStyle"]
                          >["align"],
                        }))
                      }
                      className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base font-bold text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                )}

                {activeTool === "scripture" && (
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      value={scriptureSuggestion}
                      onChange={(event) => setScriptureSuggestion(event.target.value)}
                      placeholder="Scripture reference, such as John 8:36"
                      className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base font-bold text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={() => setScriptureSuggestion("John 8:36")}
                      className="rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white"
                    >
                      Suggest Scripture
                    </button>
                  </div>
                )}

                {activeTool === "layouts" && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {creatorStudioLayoutOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setLayoutType(option.value)}
                        className={`rounded-2xl px-4 py-4 text-left text-sm font-black ring-1 transition ${
                          layoutType === option.value
                            ? "bg-[#0b63ce] text-white ring-[#0b63ce] shadow-lg shadow-blue-900/15"
                            : "bg-white text-[#062a57] ring-blue-100 hover:-translate-y-0.5 hover:bg-blue-50"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}

                {hasRequested && !loading && designs.length === 0 && (
                  <div className="mt-4 rounded-[1.5rem] bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-700 ring-1 ring-red-100">
                    Couldn&apos;t generate designs. Try again.
                  </div>
                )}
              </div>
            </section>

            <div className="fixed inset-x-0 bottom-0 z-40 bg-white/92 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl shadow-blue-950/15 ring-1 ring-blue-100 backdrop-blur-xl sm:static sm:rounded-[2rem] sm:px-4 sm:pb-4 sm:shadow-xl">
              <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto [-webkit-overflow-scrolling:touch] sm:justify-center">
                {studioToolOptions.map((tool) => (
                  <button
                    key={tool.value}
                    type="button"
                    onClick={() => setActiveTool(tool.value)}
                    className={`shrink-0 rounded-full px-4 py-2.5 text-xs font-black ring-1 transition ${
                      activeTool === tool.value
                        ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                        : "bg-white text-slate-600 ring-blue-100"
                    }`}
                  >
                    {tool.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={prepareDraftForPublish}
                  className="shrink-0 rounded-full bg-[#062a57] px-5 py-2.5 text-xs font-black text-white"
                >
                  Publish
                </button>
              </div>
            </div>
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
          <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-5">
            <section className="overflow-hidden rounded-[2.25rem] bg-[#031d3d] p-3 shadow-2xl shadow-blue-950/20 ring-1 ring-blue-100 sm:p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-2 pt-1 text-white">
                <div>
                  <div className="text-sm font-black">Live canvas</div>
                  <p className="mt-1 text-xs font-semibold text-blue-100">
                    The artwork stays in view while you shape the design.
                  </p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-100 ring-1 ring-white/15">
                  {currentLayoutLabel}
                </span>
              </div>
              <div className="mx-auto w-full max-w-[44rem]">
                <CreatorStudioPreview
                  design={editableDesign}
                  videoPreviewUrl={videoPreviewUrl}
                  photoPreviewUrl={photoPreviewUrl}
                  canvas
                />
              </div>
            </section>

            <CreatorStudioLayoutEditor
              design={editableDesign}
              onChange={updateEditableDesign}
              videoFileName={videoFileName}
              photoFileName={photoFileName}
              onVideoSelect={onVideoSelect}
              onPhotoSelect={onPhotoSelect}
              onRemoveVideo={onRemoveVideo}
              onRemovePhoto={onRemovePhoto}
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setScreen("choose")}
                className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-black text-[#0b63ce] ring-1 ring-blue-100 transition hover:-translate-y-0.5 hover:bg-blue-50 sm:min-w-44"
              >
                Back to Designs
              </button>
              <button
                type="button"
                onClick={() => setScreen("publish")}
                className="inline-flex items-center justify-center rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-900/20 transition hover:-translate-y-0.5 hover:bg-[#084f9f] sm:min-w-52"
              >
                Continue to Publish
              </button>
            </div>
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
