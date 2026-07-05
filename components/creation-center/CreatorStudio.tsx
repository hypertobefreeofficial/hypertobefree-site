"use client";

import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  PenLine,
  Sparkles,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  creationCenterStoryTemplates,
  creatorStudioBottomToolbar,
  creatorStudioLayoutOptions,
  creatorStudioPathOptions,
  creatorStudioQuickActions,
  creatorStudioTopCarousel,
  prepareCreatorStudioForEditing,
  type CreationCenterFormat,
  type CreationCenterTemplateId,
  type CreatorStudioDesign,
  type CreatorStudioImageAction,
  type CreatorStudioImageRequest,
  type CreatorStudioImageResult,
  type CreatorStudioLayoutType,
  type CreatorStudioPath,
  type CreatorStudioRequestOptions,
  type CreatorStudioSourceMode,
} from "../../lib/creationCenter";
import CreatorStudioCanvasEditor from "./CreatorStudioCanvasEditor";
import CreatorStudioDesignCards from "./CreatorStudioDesignCards";
import CreatorStudioGeneration from "./CreatorStudioGeneration";
import CreatorStudioLayoutEditor, {
  type CreatorStudioEditorPanel,
} from "./CreatorStudioLayoutEditor";
import CreatorStudioPublishPreview from "./CreatorStudioPublishPreview";
import CreatorStudioPublishing from "./CreatorStudioPublishing";
import CreatorStudioPublishSuccess from "./CreatorStudioPublishSuccess";

export type CreatorStudioPublishResult = {
  success: boolean;
  wentLiveInstantly?: boolean;
  error?: string;
};

type PublishSnapshot = {
  design: CreatorStudioDesign;
  photoPreviewUrl: string | null;
  videoPreviewUrl: string | null;
};

type StudioScreen =
  | "home"
  | "thinking"
  | "choose"
  | "editor"
  | "preview"
  | "publishing"
  | "success";
type HomeStep = "welcome" | "write";

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
  onRequestImage: (
    request: CreatorStudioImageRequest
  ) => Promise<CreatorStudioImageResult | null>;
  onUseDesign: (design: CreatorStudioDesign) => void;
  onPublishTestimony: (
    design: CreatorStudioDesign,
    onProgress: (step: string) => void
  ) => Promise<CreatorStudioPublishResult>;
  onViewFeed: () => void;
  onExitStudio: () => void;
};

type TopTool = (typeof creatorStudioTopCarousel)[number]["value"];
type BottomTool = (typeof creatorStudioBottomToolbar)[number]["value"];

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

function mapBottomToEditorPanel(tool: BottomTool): CreatorStudioEditorPanel {
  if (tool === "layout") return "layout";
  if (tool === "ai") return "ai";
  if (tool === "filters") return "fonts";
  if (tool === "scripture") return "scripture";
  if (tool === "colors") return "colors";
  if (tool === "fonts") return "fonts";
  if (tool === "text") return "text";
  return "templates";
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
  onRequestImage,
  onUseDesign,
  onPublishTestimony,
  onViewFeed,
  onExitStudio,
}: CreatorStudioProps) {
  const [screen, setScreen] = useState<StudioScreen>("home");
  const [homeStep, setHomeStep] = useState<HomeStep>("welcome");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [studioPath, setStudioPath] = useState<CreatorStudioPath>("tell-story");
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
  const [draftTitle, setDraftTitle] = useState("");
  const [draftOverlayText, setDraftOverlayText] = useState("");
  const [draftCaption, setDraftCaption] = useState("");
  const [editableDesign, setEditableDesign] = useState<CreatorStudioDesign | null>(null);
  const [scriptureSuggestion, setScriptureSuggestion] = useState("");
  const [selectedDesignId, setSelectedDesignId] = useState<string | null>(null);
  const [imageEnhancedDesign, setImageEnhancedDesign] = useState<CreatorStudioDesign | null>(null);
  const [imageGeneratingAction, setImageGeneratingAction] = useState<CreatorStudioImageAction | null>(null);
  const [imageMessage, setImageMessage] = useState("");
  const [generatedCanvasImageUrl, setGeneratedCanvasImageUrl] = useState("");
  const [generatedCanvasImagePath, setGeneratedCanvasImagePath] = useState("");
  const [generatedCanvasImageBucket, setGeneratedCanvasImageBucket] = useState("");
  const [generatedCanvasImagePrompt, setGeneratedCanvasImagePrompt] = useState("");
  const [activeTopTool, setActiveTopTool] = useState<TopTool>("ai");
  const [activeBottomTool, setActiveBottomTool] = useState<BottomTool>("text");
  const [activeEditorPanel, setActiveEditorPanel] =
    useState<CreatorStudioEditorPanel>("text");
  const [showHomeExtras, setShowHomeExtras] = useState(false);
  const [hasRequested, setHasRequested] = useState(false);
  const [resultTouchStartX, setResultTouchStartX] = useState<number | null>(null);
  const [publishSnapshot, setPublishSnapshot] = useState<PublishSnapshot | null>(
    null
  );
  const [publishStep, setPublishStep] = useState("Publishing your testimony...");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishResult, setPublishResult] =
    useState<CreatorStudioPublishResult | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [textStyle, setTextStyle] = useState<NonNullable<CreatorStudioDesign["textStyle"]>>({
    fontSize: "large",
    weight: "bold",
    italic: false,
    align: "left",
    color: "#FFFFFF",
    position: "bottom",
  });
  const [colorPalette, setColorPalette] = useState<string[]>(["#0B1D3A", "#FFFFFF", "#D4AF37"]);

  useEffect(() => {
    if (!hasRequested || loading || designs.length > 0 || !message) {
      return;
    }

    setScreen("home");
  }, [hasRequested, loading, designs.length, message]);

  const sourceMode = getSourceMode({
    hasVideo: Boolean(videoPreviewUrl),
    hasPhoto: Boolean(photoPreviewUrl),
    templateId,
  });
  const currentScreen: StudioScreen = loading ? "thinking" : screen;
  const activeDesignIndex = Math.max(designs.findIndex((d) => d.id === selectedDesignId), 0);
  const baseResultDesign = designs[activeDesignIndex] ?? editableDesign ?? designs[0] ?? null;
  const activeResultDesign =
    imageEnhancedDesign && baseResultDesign && imageEnhancedDesign.id === baseResultDesign.id
      ? imageEnhancedDesign
      : baseResultDesign;

  const canvasDesign: CreatorStudioDesign = {
    id: "creator-studio-live-canvas",
    studioPath,
    sourceMode,
    title: draftTitle.trim() || prompt.trim().slice(0, 64) || "What God Is Doing",
    overlayText: draftOverlayText.trim() || draftTitle.trim() || "Share what God is doing",
    caption: draftCaption.trim() || prompt.trim() || "Upload media, choose a template, or use AI to shape this post.",
    category,
    topic,
    templateId,
    styleMood: mood,
    layoutType,
    scriptureSuggestion,
    suggestedPostFormat:
      sourceMode === "upload-video" ? "HTBF video post" : sourceMode === "upload-photo" ? "HTBF photo post" : "HTBF design post",
    colorPalette,
    typographyStyle: textStyle.weight === "bold" ? "Bold HTBF headline" : "Clean HTBF type",
    designTreatment: mood,
    generatedImageUrl: generatedCanvasImageUrl || undefined,
    generatedImagePath: generatedCanvasImagePath || undefined,
    generatedImageBucket: generatedCanvasImageBucket || undefined,
    imageGenerationPrompt: generatedCanvasImagePrompt || undefined,
    textStyle,
  };

  const toolbarContextDesign = editableDesign ?? activeResultDesign ?? canvasDesign;
  const currentPathLabel = creatorStudioPathOptions.find((o) => o.value === studioPath)?.title ?? "Creator Studio";
  const currentLayoutLabel =
    creatorStudioLayoutOptions.find((o) => o.value === toolbarContextDesign.layoutType)?.label ?? "Creative direction";

  function handleGenerationTransitionComplete() {
    if (!hasRequested || designs.length === 0) return;

    const nextDesign =
      designs.find((design) => design.id === selectedDesignId) ?? designs[0];
    setSelectedDesignId(nextDesign.id);
    setImageEnhancedDesign(null);
    setScreen("choose");
  }

  function openEditorFromMedia(design?: CreatorStudioDesign) {
    const base = design ?? {
      ...canvasDesign,
      caption: prompt.trim() || canvasDesign.caption,
      title:
        prompt.trim().slice(0, 64) ||
        canvasDesign.title ||
        "What God has done",
      overlayText:
        prompt.trim().slice(0, 120) ||
        canvasDesign.overlayText ||
        "Share what God is doing",
    };
    const nextDesign = prepareCreatorStudioForEditing({
      ...base,
      layerStyles: undefined,
    });
    setEditableDesign(nextDesign);
    setScreen("editor");
  }

  function handlePhotoSelected(file: File | null) {
    if (!file) return;
    onFormatChange("photo");
    onPhotoSelect(file);
    setTemplateId("none");
    openEditorFromMedia();
  }

  function handleVideoSelected(file: File | null) {
    if (!file) return;
    onFormatChange("video");
    onVideoSelect(file);
    setTemplateId("none");
    openEditorFromMedia();
  }

  function handleWriteContinue() {
    if (!prompt.trim()) return;
    generateDesigns();
  }

  const designsReady = hasRequested && !loading && designs.length > 0;

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
    setImageEnhancedDesign(null);
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

  function requestQuickAiAction(action: (typeof creatorStudioQuickActions)[number]) {
    if (action === "New Background") return void requestGeneratedVisual("New Background");
    const activeDesign = activeResultDesign;
    const basePrompt = prompt.trim() || activeDesign?.caption || activeDesign?.overlayText || "Create a polished HTBF faith-centered post.";
    const actionPrompt = [
      basePrompt,
      `AI action: ${action}.`,
      activeDesign
        ? `Current concept: ${activeDesign.visualTheme || activeDesign.styleMood}. Keep what works, but make the next six options meaningfully different.`
        : "Create six visually distinct concepts.",
    ].join("\n\n");
    setHasRequested(true);
    setSelectedDesignId(null);
    setEditableDesign(null);
    setImageEnhancedDesign(null);
    setScreen("thinking");
    onRequestDesigns(actionPrompt, selectedChips, {
      studioPath,
      sourceMode,
      selectedTemplateId: templateId,
      category: activeDesign?.category || category,
      topic: activeDesign?.topic || topic,
      mood: action === "Surprise Me" ? "Unexpected but polished HTBF direction" : activeDesign?.styleMood || mood,
      layoutType: activeDesign?.layoutType || layoutType,
    });
  }

  async function requestGeneratedVisual(action: CreatorStudioImageAction) {
    const baseDesign = currentScreen === "editor" || currentScreen === "preview" || currentScreen === "publishing" || currentScreen === "success" ? toolbarContextDesign : activeResultDesign ?? toolbarContextDesign;
    const cleanPrompt = prompt.trim() || baseDesign.caption || baseDesign.overlayText || baseDesign.title || "Create a polished HTBF faith-centered visual design.";
    setImageGeneratingAction(action);
    setImageMessage("");
    try {
      const result = await onRequestImage({ action, prompt: cleanPrompt, design: baseDesign });
      if (!result) throw new Error("Could not create a visual design right now.");
      const nextDesign: CreatorStudioDesign = {
        ...baseDesign,
        generatedImageUrl: result.imageUrl,
        generatedImagePath: result.imagePath,
        generatedImageBucket: result.bucket,
        imageGenerationPrompt: result.prompt,
        templateId: baseDesign.sourceMode === "upload-video" || baseDesign.sourceMode === "upload-photo" ? baseDesign.templateId : "none",
        backgroundTreatment: baseDesign.backgroundTreatment || `${action} created by HTBF`,
      };
      if (baseDesign.id === canvasDesign.id) {
        setGeneratedCanvasImageUrl(result.imageUrl);
        setGeneratedCanvasImagePath(result.imagePath);
        setGeneratedCanvasImageBucket(result.bucket);
        setGeneratedCanvasImagePrompt(result.prompt);
        setTemplateId("none");
      }
      setImageEnhancedDesign(nextDesign);
      setSelectedDesignId(nextDesign.id);
      if (editableDesign?.id === baseDesign.id) setEditableDesign(nextDesign);
      setImageMessage(`${action} is ready. It has been saved for this design.`);
    } catch (error) {
      setImageMessage(error instanceof Error ? error.message : "Could not create a visual design right now.");
    } finally {
      setImageGeneratingAction(null);
    }
  }

  function openEditor(design?: CreatorStudioDesign | null) {
    const baseDesign = design ?? toolbarContextDesign;
    const nextDesign = prepareCreatorStudioForEditing(baseDesign);
    setEditableDesign(nextDesign);
    setScreen("editor");
  }

  function handleBottomTool(tool: BottomTool) {
    setActiveBottomTool(tool);
    if (tool === "publish") {
      setEditableDesign(toolbarContextDesign);
      continueToPreview();
      return;
    }

    setActiveEditorPanel(mapBottomToEditorPanel(tool));

    if (currentScreen === "choose" || currentScreen === "home") {
      openEditor(toolbarContextDesign);
      return;
    }

    if (currentScreen !== "editor") {
      openEditor(toolbarContextDesign);
    }
  }

  function handleSwipe(endX: number) {
    if (resultTouchStartX === null || designs.length === 0) return;
    const delta = endX - resultTouchStartX;
    setResultTouchStartX(null);
    if (Math.abs(delta) < 40) return;
    const next = (activeDesignIndex + (delta < 0 ? 1 : -1) + designs.length) % designs.length;
    const design = designs[next];
    setSelectedDesignId(design.id);
    setEditableDesign(design);
    setImageEnhancedDesign(null);
  }

  function moveDesign(direction: 1 | -1) {
    if (designs.length === 0) return;
    const next = (activeDesignIndex + direction + designs.length) % designs.length;
    const design = designs[next];
    setSelectedDesignId(design.id);
    setEditableDesign(design);
    setImageEnhancedDesign(null);
  }

  function continueToPreview() {
    if (!toolbarContextDesign) return;
    const readyDesign = prepareCreatorStudioForEditing(toolbarContextDesign);
    setEditableDesign(readyDesign);
    setPublishError(null);
    setScreen("preview");
  }

  async function shareTestimony() {
    if (!toolbarContextDesign || isPublishing) return;

    const preparedDesign = prepareCreatorStudioForEditing(toolbarContextDesign);
    setPublishSnapshot({
      design: preparedDesign,
      photoPreviewUrl,
      videoPreviewUrl,
    });
    setPublishError(null);
    setPublishStep("Publishing your testimony...");
    setScreen("publishing");
    setIsPublishing(true);

    const result = await onPublishTestimony(preparedDesign, (step) => {
      setPublishStep(step);
    });

    setIsPublishing(false);

    if (result.success) {
      setPublishResult(result);
      setScreen("success");
      return;
    }

    setPublishError(result.error ?? "Something went wrong while publishing.");
    setScreen("publishing");
  }

  function resetStudioForAnother() {
    setScreen("home");
    setHomeStep("welcome");
    setEditableDesign(null);
    setSelectedDesignId(null);
    setImageEnhancedDesign(null);
    setPublishSnapshot(null);
    setPublishResult(null);
    setPublishError(null);
    setPublishStep("Publishing your testimony...");
    setHasRequested(false);
    setPrompt("");
    setSelectedChips([]);
  }

  const flowScreen =
    currentScreen === "editor" ||
    currentScreen === "preview" ||
    currentScreen === "publishing" ||
    currentScreen === "success";

  return (
    <section
      className={`relative w-full min-w-0 overflow-hidden ${
        flowScreen
          ? "bg-[#020617] rounded-none shadow-none ring-0"
          : "rounded-[2rem] bg-[#f8fafc] shadow-2xl shadow-blue-950/10 ring-1 ring-blue-100"
      }`}
    >
      {!flowScreen && (
      <header className="flex items-center justify-between border-b border-blue-100 bg-white px-4 py-4 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-blue-50 px-4 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <h2 className="text-lg font-black text-[#062a57]">Creator Studio</h2>
        <span className="w-16" />
      </header>
      )}

      <div
        className={`${
          flowScreen
            ? "p-0"
            : currentScreen === "thinking"
              ? "min-h-0 flex flex-col p-3 sm:p-5"
              : "p-3 sm:p-5"
        }`}
      >
        {currentScreen === "thinking" && (
          <CreatorStudioGeneration
            message={message}
            loading={loading}
            ready={designsReady}
            prompt={prompt}
            category={category}
            topic={topic}
            mood={mood}
            scriptureSuggestion={scriptureSuggestion}
            designs={designs}
            onTransitionComplete={handleGenerationTransitionComplete}
          />
        )}

        {currentScreen === "home" && (
          <div className="mx-auto grid min-w-0 max-w-lg gap-6 py-6 sm:py-10">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              className="hidden"
              onChange={(event) => {
                handlePhotoSelected(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(event) => {
                handleVideoSelected(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />

            {homeStep === "welcome" ? (
              <section className="overflow-hidden rounded-[2rem] bg-white p-6 text-center ring-1 ring-blue-100 sm:p-10">
                <h3 className="text-3xl font-black leading-tight text-[#062a57] sm:text-4xl">
                  Share Your Story
                </h3>
                <p className="mx-auto mt-3 max-w-sm text-sm font-medium leading-7 text-slate-500">
                  Photo, video, or words only — your media becomes the canvas.
                </p>

                <div className="mt-8 grid gap-3">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-[1.25rem] bg-[#062a57] px-5 text-base font-black text-white transition hover:bg-[#0b63ce]"
                  >
                    <ImagePlus className="h-5 w-5" />
                    Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-[1.25rem] bg-white px-5 text-base font-black text-[#062a57] ring-1 ring-blue-100 transition hover:bg-blue-50"
                  >
                    <Video className="h-5 w-5" />
                    Video
                  </button>
                  <button
                    type="button"
                    onClick={() => setHomeStep("write")}
                    className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-[1.25rem] bg-white px-5 text-base font-black text-[#062a57] ring-1 ring-blue-100 transition hover:bg-blue-50"
                  >
                    <PenLine className="h-5 w-5" />
                    Write Only
                  </button>
                </div>
              </section>
            ) : (
              <section className="overflow-hidden rounded-[2rem] bg-white p-6 ring-1 ring-blue-100 sm:p-8">
                <button
                  type="button"
                  onClick={() => setHomeStep("welcome")}
                  className="text-xs font-semibold text-slate-400"
                >
                  ← Back
                </button>
                <h3 className="mt-4 text-2xl font-black text-[#062a57]">
                  What has God done?
                </h3>
                <p className="mt-2 text-sm font-medium leading-7 text-slate-500">
                  Write freely. We&apos;ll shape six beautiful directions from
                  your words.
                </p>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={6}
                  autoFocus
                  placeholder="Tell your story in your own words..."
                  className="mt-5 w-full resize-none rounded-[1.25rem] border-0 bg-blue-50/80 px-4 py-4 text-base font-medium leading-7 text-[#062a57] outline-none ring-1 ring-blue-100 focus:ring-2 focus:ring-[#0b63ce]"
                />
                <button
                  type="button"
                  onClick={handleWriteContinue}
                  disabled={!prompt.trim()}
                  className="mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-4 text-sm font-black text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#062a57] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" />
                  Continue
                </button>
              </section>
            )}
          </div>
        )}

        {currentScreen === "choose" && designs.length > 0 && (
          <div className="mx-auto grid max-w-6xl min-w-0 gap-4">
            <section className="rounded-[1.5rem] bg-white/80 p-4 ring-1 ring-blue-100 sm:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0b63ce]">
                Six editorial directions
              </p>
              <h3 className="mt-1 text-xl font-black text-[#062a57]">
                Each one tells your story differently
              </h3>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                Quiet reflection, magazine cover, bold declaration, and more.
                Pick the one that feels closest — then refine on your canvas.
              </p>
            </section>

            <CreatorStudioDesignCards
              designs={designs}
              selectedDesignId={selectedDesignId}
              videoPreviewUrl={videoPreviewUrl}
              photoPreviewUrl={photoPreviewUrl}
              onSelect={(design) => {
                setSelectedDesignId(design.id);
                setImageEnhancedDesign(null);
                openEditor({ ...design, layerStyles: undefined });
              }}
            />
          </div>
        )}

        {currentScreen === "editor" && toolbarContextDesign && (
          <CreatorStudioCanvasEditor
            design={toolbarContextDesign}
            onChange={(updates) =>
              setEditableDesign((current) => ({
                ...(current ?? toolbarContextDesign),
                ...updates,
              }))
            }
            videoPreviewUrl={videoPreviewUrl}
            photoPreviewUrl={photoPreviewUrl}
            videoFileName={videoFileName}
            photoFileName={photoFileName}
            onVideoSelect={onVideoSelect}
            onPhotoSelect={onPhotoSelect}
            onRemoveVideo={onRemoveVideo}
            onRemovePhoto={onRemovePhoto}
            showChangeConcept={designs.length > 0}
            showGenerateConcepts={
              designs.length === 0 &&
              Boolean(prompt.trim() || toolbarContextDesign.caption.trim())
            }
            conceptsLoading={loading}
            designs={designs}
            selectedDesignId={selectedDesignId}
            onSelectDesign={(concept) => {
              setSelectedDesignId(concept.id);
              setImageEnhancedDesign(null);
              setEditableDesign(prepareCreatorStudioForEditing(concept));
            }}
            onGenerateConcepts={generateDesigns}
            onChangeConcept={() => setScreen("choose")}
            onContinueToPublish={continueToPreview}
            onStartOver={resetStudioForAnother}
            aiControls={null}
          />
        )}

        {currentScreen === "preview" && toolbarContextDesign && (
          <CreatorStudioPublishPreview
            design={toolbarContextDesign}
            videoPreviewUrl={videoPreviewUrl}
            photoPreviewUrl={photoPreviewUrl}
            onBackToEdit={() => setScreen("editor")}
            onShare={() => void shareTestimony()}
            sharing={isPublishing}
          />
        )}

        {currentScreen === "publishing" && (
          <CreatorStudioPublishing
            activeStep={publishStep}
            error={publishError}
            onRetry={
              publishError && toolbarContextDesign
                ? () => void shareTestimony()
                : undefined
            }
            onBackToEdit={
              publishError ? () => setScreen("editor") : undefined
            }
          />
        )}

        {currentScreen === "success" && publishSnapshot && publishResult?.success && (
          <CreatorStudioPublishSuccess
            design={publishSnapshot.design}
            videoPreviewUrl={publishSnapshot.videoPreviewUrl}
            photoPreviewUrl={publishSnapshot.photoPreviewUrl}
            wentLiveInstantly={Boolean(publishResult.wentLiveInstantly)}
            onViewFeed={onViewFeed}
            onCreateAnother={resetStudioForAnother}
            onDone={onExitStudio}
          />
        )}

        {(hasRequested && !loading && designs.length === 0 && message) ||
        imageMessage ? (
          <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-[#082f63] ring-1 ring-blue-100">
            {hasRequested && !loading && designs.length === 0 && message
              ? message
              : imageMessage}
          </div>
        ) : null}
      </div>
    </section>
  );
}
