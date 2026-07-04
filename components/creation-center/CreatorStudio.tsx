"use client";

import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import { useEffect, useState } from "react";
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
import CreatorStudioPreview from "./CreatorStudioPreview";

type StudioScreen = "home" | "thinking" | "choose" | "editor" | "publish";

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
}: CreatorStudioProps) {
  const [screen, setScreen] = useState<StudioScreen>("home");
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
    openEditor({ ...nextDesign, layerStyles: undefined });
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
    const baseDesign = currentScreen === "editor" || currentScreen === "publish" ? toolbarContextDesign : activeResultDesign ?? toolbarContextDesign;
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
      setScreen("publish");
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

  return (
    <section className="w-full min-w-0 overflow-hidden rounded-[2rem] bg-[#f8fafc] shadow-2xl shadow-blue-950/10 ring-1 ring-blue-100">
      <header className="flex items-center justify-between border-b border-blue-100 bg-white px-4 py-4 sm:px-6">
        <button type="button" onClick={onBack} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-blue-50 px-4 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100">
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <h2 className="text-lg font-black text-[#062a57]">Creator Studio</h2>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#0b63ce] ring-1 ring-blue-100">{currentPathLabel}</span>
      </header>

      <div
        className={`p-3 sm:p-5 ${
          currentScreen === "thinking" ? "min-h-0 flex flex-col" : ""
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
          <div className="mx-auto grid min-w-0 max-w-3xl gap-5">
            <section className="overflow-hidden rounded-[1.75rem] bg-white p-5 ring-1 ring-blue-100 sm:p-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0b63ce]">
                Share what God has done
              </p>
              <h3 className="mt-2 text-2xl font-black leading-tight text-[#062a57] sm:text-3xl">
                Tell your story. We&apos;ll help it shine.
              </h3>
              <p className="mt-3 text-sm font-medium leading-7 text-slate-500">
                Add a photo or video, write a few words, and HTBF will compose
                six beautiful directions — already styled for you to refine.
              </p>

              <div className="mt-5 flex min-w-0 flex-wrap gap-2">
                <label className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-[#062a57] px-4 text-xs font-black text-white transition hover:bg-[#0b63ce]">
                  <ImagePlus className="h-4 w-4" /> Photo
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { onFormatChange("photo"); onPhotoSelect(e.target.files?.[0] ?? null); setTemplateId("none"); }} />
                </label>
                <label className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-[#0b63ce] px-4 text-xs font-black text-white">
                  <Video className="h-4 w-4" /> Video
                  <input type="file" accept="video/*" className="hidden" onChange={(e) => { onFormatChange("video"); onVideoSelect(e.target.files?.[0] ?? null); setTemplateId("none"); }} />
                </label>
              </div>

              {(photoPreviewUrl || videoPreviewUrl) && (
                <div className="mt-5 overflow-hidden rounded-[1.25rem] ring-1 ring-blue-100">
                  <CreatorStudioPreview design={canvasDesign} videoPreviewUrl={videoPreviewUrl} photoPreviewUrl={photoPreviewUrl} canvas />
                </div>
              )}

              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder="What has God done in your life?" className="mt-5 w-full resize-none rounded-[1.25rem] border-0 bg-blue-50/80 px-4 py-4 text-sm font-medium leading-7 text-[#062a57] outline-none ring-1 ring-blue-100 focus:ring-2 focus:ring-[#0b63ce]" />

              <button type="button" onClick={generateDesigns} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-4 text-sm font-black text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#062a57]">
                <Sparkles className="h-4 w-4" /> Create my testimony
              </button>

              <button type="button" onClick={() => openEditor(canvasDesign)} className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-full text-xs font-semibold text-slate-500 transition hover:text-[#0b63ce]">
                Or start with a blank canvas
              </button>
            </section>
          </div>
        )}

        {currentScreen === "choose" && designs.length > 0 && (
          <div className="mx-auto grid max-w-6xl min-w-0 gap-4">
            <section className="rounded-[1.5rem] bg-white/80 p-4 ring-1 ring-blue-100 sm:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0b63ce]">
                Six directions
              </p>
              <h3 className="mt-1 text-xl font-black text-[#062a57]">
                Each concept has its own visual personality
              </h3>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                Tap one to continue editing on the canvas. Your words stay
                exactly as you wrote them.
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
            onChangeConcept={() => setScreen("choose")}
            onContinueToPublish={() => {
              const readyDesign = prepareCreatorStudioForEditing(toolbarContextDesign);
              setEditableDesign(readyDesign);
              setScreen("publish");
            }}
            aiControls={
              <>
                <button
                  type="button"
                  onClick={generateDesigns}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-4 text-sm font-black text-white"
                >
                  <Sparkles className="h-4 w-4" /> Regenerate 6 Concepts
                </button>
                <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
                  {creatorStudioQuickActions.map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => requestQuickAiAction(action)}
                      disabled={
                        action === "New Background" &&
                        Boolean(imageGeneratingAction)
                      }
                      className="min-h-11 shrink-0 rounded-full bg-blue-50 px-4 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100"
                    >
                      {action}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void requestGeneratedVisual("AI Background")}
                  disabled={Boolean(imageGeneratingAction)}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#062a57] px-4 text-sm font-black text-white"
                >
                  {imageGeneratingAction === "AI Background"
                    ? "Creating background..."
                    : "Generate AI Background"}
                </button>
              </>
            }
          />
        )}

        {currentScreen === "publish" && toolbarContextDesign && (
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.68fr)_minmax(0,0.32fr)]">
            <CreatorStudioPreview design={toolbarContextDesign} videoPreviewUrl={videoPreviewUrl} photoPreviewUrl={photoPreviewUrl} variant="publish" />
            <aside className="rounded-[1.75rem] bg-white p-5 ring-1 ring-blue-100">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0b63ce]">
                You&apos;re ready
              </p>
              <p className="mt-2 text-lg font-black text-[#062a57]">
                Your testimony looks beautiful.
              </p>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                Share it with the HTBF community when you feel confident. You can
                still adjust the caption below.
              </p>
              <textarea value={toolbarContextDesign.caption} onChange={(e) => setEditableDesign((current) => ({ ...(current ?? toolbarContextDesign), caption: e.target.value }))} rows={5} placeholder="A few words about what God has done..." className="mt-4 w-full resize-none rounded-[1.25rem] border-0 bg-blue-50/70 px-4 py-3 text-sm font-medium leading-7 text-[#062a57] outline-none ring-1 ring-blue-100 focus:ring-2 focus:ring-[#0b63ce]" />
              <button type="submit" onClick={() => onUseDesign(prepareCreatorStudioForEditing(toolbarContextDesign))} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-4 text-sm font-black text-white shadow-lg shadow-blue-900/15">
                Share my testimony <Upload className="h-4 w-4" />
              </button>
            </aside>
          </div>
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
