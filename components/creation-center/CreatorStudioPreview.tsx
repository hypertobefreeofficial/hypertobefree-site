"use client";

import {
  getCreationCenterTemplate,
  type CreationCenterTemplateId,
  type CreatorStudioDesign,
  type CreatorStudioLayoutType,
} from "../../lib/creationCenter";

type CreatorStudioPreviewProps = {
  design?: CreatorStudioDesign | null;
  layoutType?: CreatorStudioLayoutType;
  title?: string;
  overlayText?: string;
  caption?: string;
  category?: string;
  topic?: string;
  mood?: string;
  templateId?: CreationCenterTemplateId;
  videoPreviewUrl?: string | null;
  photoPreviewUrl?: string | null;
  compact?: boolean;
  gallery?: boolean;
};

function cleanText(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function MediaLayer({
  templateId,
  photoPreviewUrl,
  videoPreviewUrl,
}: {
  templateId: CreationCenterTemplateId;
  photoPreviewUrl?: string | null;
  videoPreviewUrl?: string | null;
}) {
  const template = getCreationCenterTemplate(templateId);

  if (photoPreviewUrl) {
    return (
      <img
        src={photoPreviewUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }

  if (videoPreviewUrl) {
    return (
      <video
        src={videoPreviewUrl}
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }

  if (template?.imagePath) {
    return (
      <img
        src={template.imagePath}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }

  return (
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#60a5fa,transparent_34%),linear-gradient(135deg,#062a57,#0b63ce_52%,#dbeafe)]" />
  );
}

function Watermark() {
  return (
    <img
      src="/images/htbf-logo.png"
      alt=""
      className="pointer-events-none absolute right-4 top-4 z-20 h-8 w-auto opacity-80"
    />
  );
}

function PlaceholderTile({ label }: { label: string }) {
  return (
    <div className="flex min-h-[5rem] items-center justify-center rounded-2xl bg-white/15 px-3 text-center text-[10px] font-black uppercase tracking-[0.12em] text-white/80 ring-1 ring-white/20">
      {label}
    </div>
  );
}

export default function CreatorStudioPreview({
  design,
  layoutType,
  title,
  overlayText,
  caption,
  category,
  topic,
  mood,
  templateId,
  videoPreviewUrl,
  photoPreviewUrl,
  compact = false,
  gallery = false,
}: CreatorStudioPreviewProps) {
  const activeLayout =
    design?.layoutType ?? layoutType ?? "text-over-image-testimony";
  const activeTemplateId =
    design?.templateId ?? templateId ?? "scripture-woods";
  const activeTitle = cleanText(design?.title ?? title, "God Is Moving");
  const activeOverlay = cleanText(
    design?.overlayText ?? overlayText,
    activeTitle
  );
  const activeCaption = cleanText(
    design?.caption ?? caption,
    "Tell the story of what God is doing."
  );
  const activeCategory = cleanText(design?.category ?? category, "Testimony");
  const activeTopic = cleanText(design?.topic ?? topic, "Freedom");
  const activeMood = cleanText(design?.styleMood ?? mood, "Hopeful");
  const frameHeight = gallery
    ? "aspect-[9/16] min-h-0"
    : compact
      ? "min-h-[13.5rem]"
      : "min-h-[24rem] sm:min-h-[30rem] lg:min-h-[34rem]";

  const baseShell =
    "relative isolate w-full max-w-full min-w-0 overflow-hidden rounded-[1.75rem] bg-[#062a57] text-white shadow-xl shadow-blue-950/10 ring-1 ring-blue-100";
  const innerPadding = gallery ? "p-4" : compact ? "p-4" : "p-5 sm:p-8";
  const contentFrame = gallery ? "h-full" : frameHeight;
  const smallTitleClass = gallery
    ? "text-xl"
    : "text-2xl font-black leading-none sm:text-3xl";
  const heroTitleClass = gallery
    ? "text-[2.35rem]"
    : "text-[clamp(2rem,9vw,4.5rem)]";
  const magazineTitleClass = gallery
    ? "text-[2.65rem]"
    : "text-[clamp(1.9rem,9vw,5rem)]";
  const splitTitleClass = gallery
    ? "text-2xl"
    : "text-[clamp(1.35rem,6vw,4rem)]";
  const bodyTextClass = gallery
    ? "text-xs leading-5"
    : "text-sm leading-6 sm:text-base";

  if (activeLayout === "split-layout") {
    return (
      <div className={`${baseShell} ${frameHeight}`}>
        <div className="absolute inset-0 grid grid-cols-2">
          <div className="relative overflow-hidden">
            <MediaLayer
              templateId={activeTemplateId}
              photoPreviewUrl={photoPreviewUrl}
              videoPreviewUrl={videoPreviewUrl}
            />
          </div>
          <div className="bg-gradient-to-br from-[#031d3d] via-[#062a57] to-[#0b63ce]" />
        </div>
        <div className="absolute inset-0 bg-black/10" />
        <Watermark />
        <div className={`relative z-10 ml-auto flex ${contentFrame} w-1/2 min-w-0 flex-col justify-center ${innerPadding}`}>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-100">
            {activeCategory} / {activeTopic}
          </p>
          <h4 className={`mt-3 max-w-full break-words font-black leading-none ${splitTitleClass}`}>
            {activeTitle}
          </h4>
          <p className={`mt-4 max-w-full break-words font-semibold text-blue-50 ${bodyTextClass}`}>
            {activeCaption}
          </p>
        </div>
      </div>
    );
  }

  if (activeLayout === "photo-collage") {
    return (
      <div className={`${baseShell} ${frameHeight} ${innerPadding}`}>
        <MediaLayer
          templateId={activeTemplateId}
          photoPreviewUrl={photoPreviewUrl}
          videoPreviewUrl={videoPreviewUrl}
        />
        <div className="absolute inset-0 bg-[#031d3d]/55" />
        <Watermark />
        <div className="relative z-10 grid h-full gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-100">
              Photo collage
            </p>
            <h4 className={`mt-2 max-w-full break-words font-black leading-none ${smallTitleClass}`}>
              {activeTitle}
            </h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <PlaceholderTile label="Photo 1" />
            <PlaceholderTile label="Photo 2" />
            <PlaceholderTile label="Photo 3" />
            <PlaceholderTile label="Photo 4" />
          </div>
          <p className={`font-semibold text-blue-50 ${bodyTextClass}`}>
            {activeCaption}
          </p>
        </div>
      </div>
    );
  }

  if (activeLayout === "video-photo-mixed") {
    return (
      <div className={`${baseShell} ${frameHeight} ${innerPadding}`}>
        <MediaLayer templateId={activeTemplateId} photoPreviewUrl={photoPreviewUrl} />
        <div className="absolute inset-0 bg-[#031d3d]/60" />
        <Watermark />
        <div className="relative z-10 flex h-full flex-col justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-100">
              Video + photo mixed post
            </p>
            <h4 className={`mt-2 max-w-full break-words font-black leading-none ${smallTitleClass}`}>
              {activeTitle}
            </h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1.35fr_0.85fr]">
            <div className="relative min-h-[11rem] overflow-hidden rounded-3xl bg-black ring-1 ring-white/20">
              {videoPreviewUrl ? (
                <video
                  src={videoPreviewUrl}
                  muted
                  playsInline
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <PlaceholderTile label="Video area" />
              )}
            </div>
            <div className="relative min-h-[11rem] overflow-hidden rounded-3xl bg-white/10 ring-1 ring-white/20">
              {photoPreviewUrl ? (
                <img
                  src={photoPreviewUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <PlaceholderTile label="Photo area" />
              )}
            </div>
          </div>
          <p className={`font-semibold text-blue-50 ${bodyTextClass}`}>
            {activeCaption}
          </p>
        </div>
      </div>
    );
  }

  if (activeLayout === "before-after-testimony") {
    return (
      <div className={`${baseShell} ${frameHeight} ${innerPadding}`}>
        <MediaLayer
          templateId={activeTemplateId}
          photoPreviewUrl={photoPreviewUrl}
          videoPreviewUrl={videoPreviewUrl}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#031d3d]/90 via-[#062a57]/45 to-[#0b63ce]/20" />
        <Watermark />
        <div className="relative z-10 flex h-full flex-col justify-between gap-4">
          <h4 className={`max-w-full break-words font-black leading-none ${smallTitleClass}`}>
            {activeTitle}
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl bg-white/12 p-4 ring-1 ring-white/20">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-100">
                Before
              </p>
              <p className={`mt-3 font-semibold text-blue-50 ${bodyTextClass}`}>
                What life felt like before the breakthrough.
              </p>
            </div>
            <div className="rounded-3xl bg-white/18 p-4 ring-1 ring-white/25">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-100">
                After
              </p>
              <p className={`mt-3 font-semibold text-blue-50 ${bodyTextClass}`}>
                {activeOverlay}
              </p>
            </div>
          </div>
          <p className={`font-semibold text-blue-50 ${bodyTextClass}`}>
            {activeCaption}
          </p>
        </div>
      </div>
    );
  }

  if (activeLayout === "timeline-story") {
    return (
      <div className={`${baseShell} ${frameHeight} ${innerPadding}`}>
        <MediaLayer
          templateId={activeTemplateId}
          photoPreviewUrl={photoPreviewUrl}
          videoPreviewUrl={videoPreviewUrl}
        />
        <div className="absolute inset-0 bg-[#031d3d]/70" />
        <Watermark />
        <div className="relative z-10 flex h-full flex-col justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-100">
              Timeline story
            </p>
            <h4 className={`mt-3 max-w-full break-words font-black leading-none ${smallTitleClass}`}>
              {activeTitle}
            </h4>
          </div>
          <div className="space-y-3">
            {["Before", "What God did", "Now"].map((label, index) => (
              <div key={label} className="flex gap-3">
                <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-[#0b63ce]">
                  {index + 1}
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-blue-100">
                    {label}
                  </p>
                  <p className={`mt-1 font-semibold text-blue-50 ${bodyTextClass}`}>
                    {index === 1 ? activeOverlay : activeCaption}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (activeLayout === "magazine-style") {
    return (
      <div className={`${baseShell} ${frameHeight}`}>
        <MediaLayer
          templateId={activeTemplateId}
          photoPreviewUrl={photoPreviewUrl}
          videoPreviewUrl={videoPreviewUrl}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#031d3d]/90 via-[#062a57]/35 to-transparent" />
        <Watermark />
        <div className={`relative z-10 grid ${contentFrame} grid-rows-[auto_1fr_auto] ${innerPadding}`}>
          <div className="flex items-center justify-between gap-3 border-b border-white/20 pb-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-100">
              HTBF Journal
            </p>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-100">
              {activeMood}
            </p>
          </div>
          <div className="flex flex-col justify-center">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-100">
              {activeCategory} / {activeTopic}
            </p>
            <h4 className={`mt-4 max-w-full break-words font-black leading-[0.9] ${magazineTitleClass}`}>
              {activeTitle}
            </h4>
          </div>
          <p className={`max-w-lg font-semibold text-blue-50 ${bodyTextClass}`}>
            {activeCaption}
          </p>
        </div>
      </div>
    );
  }

  if (activeLayout === "journal-style") {
    return (
      <div className={`${baseShell} ${frameHeight} bg-blue-50 ${innerPadding}`}>
        <MediaLayer
          templateId={activeTemplateId}
          photoPreviewUrl={photoPreviewUrl}
          videoPreviewUrl={videoPreviewUrl}
        />
        <div className="absolute inset-0 bg-white/78" />
        <Watermark />
        <div className="relative z-10 flex h-full flex-col justify-center rounded-[1.5rem] border border-[#0b63ce]/15 bg-white/80 p-5 text-[#062a57] shadow-lg shadow-blue-950/10">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0b63ce]">
            Journal style / {activeTopic}
          </p>
          <h4 className={`mt-4 max-w-full break-words font-black leading-none ${gallery ? "text-2xl" : "text-3xl sm:text-4xl"}`}>
            {activeTitle}
          </h4>
          <p className={`mt-5 whitespace-pre-wrap font-semibold ${gallery ? "text-xs leading-5" : "text-base leading-7"}`}>
            {activeCaption}
          </p>
        </div>
      </div>
    );
  }

  const isQuote =
    activeLayout === "quote-card" ||
    activeLayout === "scripture-card" ||
    activeLayout === "prayer-request-card" ||
    activeLayout === "praise-report-card";

  return (
    <div className={`${baseShell} ${frameHeight} ${innerPadding}`}>
      <MediaLayer
        templateId={activeTemplateId}
        photoPreviewUrl={photoPreviewUrl}
        videoPreviewUrl={videoPreviewUrl}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#031d3d]/88 via-[#062a57]/35 to-transparent" />
      <Watermark />
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ring-1 ring-white/20 backdrop-blur-sm">
            {activeCategory}
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ring-white/15 backdrop-blur-sm">
            {activeMood}
          </span>
        </div>
        <div className={isQuote ? "mx-auto max-w-xl text-center" : "max-w-xl"}>
          <h4 className={`whitespace-pre-wrap break-words font-black leading-none text-white drop-shadow-sm ${heroTitleClass}`}>
            {activeLayout === "full-image-poster" ? activeTitle : activeOverlay}
          </h4>
          <p className={`mt-5 whitespace-pre-wrap break-words font-semibold text-blue-50 ${bodyTextClass}`}>
            {activeCaption}
          </p>
        </div>
      </div>
    </div>
  );
}
