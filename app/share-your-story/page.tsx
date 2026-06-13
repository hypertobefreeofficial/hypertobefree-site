"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  FileText,
  Globe2,
  HeartHandshake,
  ImagePlus,
  Send,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  username: string | null;
  real_name?: string | null;
  location: string | null;
  profile_completed: boolean | null;
};

type MediaMode = "text" | "photo" | "video";
type PhotoDisplayStyle = "original" | "soft-rounded" | "full-width" | "framed";
type CaptionStyle =
  | "classic-caption"
  | "bold-center"
  | "bottom-banner"
  | "highlight-box"
  | "scripture-card"
  | "praise-glow"
  | "testimony-quote"
  | "minimal-white"
  | "black-outline"
  | "soft-gradient";
type CaptionPosition = "top" | "center" | "bottom";
type CaptionSize = "small" | "medium" | "large" | "extra-large";
type CaptionAlign = "left" | "center" | "right";
type CaptionColorPreset =
  | "white"
  | "black"
  | "soft-gold"
  | "prayer-blue"
  | "warm-cream"
  | "praise-green";
type CaptionColor = CaptionColorPreset | `#${string}`;
type TextEditorPanel = "style" | "color" | "align" | "size" | "position";
type MobileVideoTool =
  | "message"
  | "style"
  | "color"
  | "size"
  | "position"
  | "preview";

type AiModerationDecision = {
  statusToUse: "approved" | "submitted";
  aiRiskLevel: "low" | "medium" | "high";
  aiSuggestedAction: "approve" | "review" | "reject";
  aiSummary: string;
  aiFlags: string[];
  aiReviewStatus: string;
};

const STORY_IMAGE_BUCKET = "story-images";

const mediaOptions: {
  label: string;
  value: MediaMode;
  icon: typeof FileText;
  description: string;
}[] = [
  {
    label: "Text Story",
    value: "text",
    icon: FileText,
    description: "Share a written testimony, praise report, or prayer request.",
  },
  {
    label: "Photo Story",
    value: "photo",
    icon: Camera,
    description: "Upload a photo and add the story behind it.",
  },
  {
    label: "Video Story",
    value: "video",
    icon: Video,
    description: "Upload a video testimony or encouragement.",
  },
];

const storyTypes = [
  {
    label: "Testimony",
    value: "Testimony",
    icon: Sparkles,
    description: "Share what God has done in your life.",
  },
  {
    label: "Praise Report",
    value: "Praise Report",
    icon: CheckCircle2,
    description: "Share a quick praise or answered moment.",
  },
  {
    label: "Prayer Request",
    value: "Prayer Encouragement",
    icon: HeartHandshake,
    description: "Ask the HTBF community to pray with you.",
  },
];

const emojiOptions = ["🙏", "❤️", "✝️", "🙌", "🕊️", "🔥", "😭", "✨", "🤍"];

const photoDisplayOptions: { label: string; value: PhotoDisplayStyle }[] = [
  { label: "Original", value: "original" },
  { label: "Soft Rounded", value: "soft-rounded" },
  { label: "Full Width", value: "full-width" },
  { label: "Framed", value: "framed" },
];

const captionStyleOptions: {
  label: string;
  value: CaptionStyle;
}[] = [
  {
    label: "Classic",
    value: "classic-caption",
  },
  {
    label: "Bold",
    value: "bold-center",
  },
  {
    label: "Scripture",
    value: "scripture-card",
  },
  {
    label: "Praise",
    value: "praise-glow",
  },
  {
    label: "Testimony",
    value: "testimony-quote",
  },
  {
    label: "Minimal",
    value: "minimal-white",
  },
];

const mobileCaptionStyleOptions: {
  label: string;
  value: CaptionStyle;
}[] = [
  { label: "Classic", value: "classic-caption" },
  { label: "Bold", value: "bold-center" },
  { label: "Scripture", value: "scripture-card" },
  { label: "Praise", value: "praise-glow" },
  { label: "Testimony", value: "testimony-quote" },
  { label: "Minimal", value: "minimal-white" },
  { label: "Glow", value: "soft-gradient" },
  { label: "Outline", value: "black-outline" },
];

const captionColorOptions: {
  label: string;
  value: CaptionColorPreset;
  swatchClass: string;
  hex: `#${string}`;
}[] = [
  { label: "White", value: "white", swatchClass: "bg-white", hex: "#ffffff" },
  { label: "Black", value: "black", swatchClass: "bg-slate-950", hex: "#020617" },
  { label: "Prayer Blue", value: "prayer-blue", swatchClass: "bg-blue-200", hex: "#bfdbfe" },
  { label: "Soft Gold", value: "soft-gold", swatchClass: "bg-amber-200", hex: "#fde68a" },
  { label: "Warm Cream", value: "warm-cream", swatchClass: "bg-[#fff4d6]", hex: "#fff4d6" },
  { label: "Praise Green", value: "praise-green", swatchClass: "bg-emerald-200", hex: "#a7f3d0" },
];

const captionAlignOptions: { label: string; value: CaptionAlign }[] = [
  { label: "Left", value: "left" },
  { label: "Center", value: "center" },
  { label: "Right", value: "right" },
];

const captionSizeOptions: { label: string; value: CaptionSize }[] = [
  { label: "Small", value: "small" },
  { label: "Medium", value: "medium" },
  { label: "Large", value: "large" },
  { label: "XL", value: "extra-large" },
];

const captionPositionOptions: { label: string; value: CaptionPosition }[] = [
  { label: "Top", value: "top" },
  { label: "Center", value: "center" },
  { label: "Bottom", value: "bottom" },
];

const mobileVideoToolOptions: { label: string; value: MobileVideoTool }[] = [
  { label: "Message", value: "message" },
  { label: "Style", value: "style" },
  { label: "Color", value: "color" },
  { label: "Size", value: "size" },
  { label: "Position", value: "position" },
  { label: "Preview", value: "preview" },
];

export default function ShareYourStoryPage() {
  const [checkingUser, setCheckingUser] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const [mediaMode, setMediaMode] = useState<MediaMode>("text");
  const [storyType, setStoryType] = useState("Testimony");
  const [storyText, setStoryText] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoDisplayStyle, setPhotoDisplayStyle] =
    useState<PhotoDisplayStyle>("soft-rounded");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [captionStyle, setCaptionStyle] =
    useState<CaptionStyle>("classic-caption");
  // TODO: Persist caption_color, caption size, position, and alignment when dedicated columns exist.
  const [captionColor, setCaptionColor] = useState<CaptionColor>("white");
  const [captionPosition, setCaptionPosition] =
    useState<CaptionPosition>("bottom");
  const [captionSize, setCaptionSize] = useState<CaptionSize>("medium");
  const [captionAlign, setCaptionAlign] = useState<CaptionAlign>("center");
  const [mobileVideoTool, setMobileVideoTool] =
    useState<MobileVideoTool>("message");
  const [message, setMessage] = useState("");

  const previewText = useMemo(() => storyText.trim(), [storyText]);
  const hasSelectedVideo = mediaMode === "video" && Boolean(videoFile);
  const shouldShowMessageInput = mediaMode !== "video" || hasSelectedVideo;
  const captionSizeSliderIndex = Math.max(
    0,
    captionSizeOptions.findIndex((option) => option.value === captionSize)
  );

  useEffect(() => {
    async function loadPage() {
      setCheckingUser(true);
      setMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setUserId(user.id);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select(
          "id, email, display_name, username, real_name, location, profile_completed"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        setMessage(`Could not load your profile: ${profileError.message}`);
        setCheckingUser(false);
        return;
      }

      if (
        !profileData ||
        !profileData.display_name ||
        !profileData.username ||
        profileData.profile_completed !== true
      ) {
        window.location.href = "/profile-setup";
        return;
      }

      setProfile(profileData as ProfileRow);

      const params = new URLSearchParams(window.location.search);
      const typeParam = params.get("type");

      if (typeParam === "video") {
        setMediaMode("video");
      }

      if (typeParam === "photo") {
        setMediaMode("photo");
      }

      if (typeParam === "prayer") {
        setStoryType("Prayer Encouragement");
      }

      setCheckingUser(false);
    }

    loadPage();
  }, []);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [photoFile]);

  useEffect(() => {
    if (!videoFile) {
      setVideoPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(videoFile);
    setVideoPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [videoFile]);

  function getPostingName() {
    return (
      profile?.display_name?.trim() ||
      profile?.username?.trim() ||
      profile?.real_name?.trim() ||
      "HTBF Community"
    );
  }

  function getPostingLocation() {
    return profile?.location?.trim() || null;
  }

  function selectMediaMode(nextMode: MediaMode) {
    setMediaMode(nextMode);
    setMessage("");

    if (nextMode !== "photo") {
      removePhoto();
    }

    if (nextMode !== "video") {
      removeVideo();
    }
  }

  function addEmoji(emoji: string) {
    setStoryText((current) => {
      if (!current.trim()) {
        return emoji;
      }

      return `${current} ${emoji}`;
    });
  }

  function removePhoto() {
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoDisplayStyle("soft-rounded");
  }

  function removeVideo() {
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setMobileVideoTool("message");
  }

  function handlePhotoSelect(file: File | null) {
    if (!file) {
      setPhotoFile(null);
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      setMessage("Please upload a JPEG, PNG, or WebP photo.");
      return;
    }

    setMessage("");
    setPhotoFile(file);
    setMediaMode("photo");
  }

  function handleVideoSelect(file: File | null) {
    setMessage("");
    setVideoFile(file);

    if (file) {
      setMediaMode("video");
      setMobileVideoTool("message");
    }
  }

  async function moderateStoryText({
    finalStoryType,
    cleanStoryText,
    hasVideo,
    hasPhoto,
  }: {
    finalStoryType: string;
    cleanStoryText: string;
    hasVideo: boolean;
    hasPhoto: boolean;
  }): Promise<AiModerationDecision> {
    try {
      const response = await fetch("/api/moderate-story", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          story_type: finalStoryType,
          story_text: cleanStoryText,
          has_video: hasVideo,
          has_photo: hasPhoto,
        }),
      });

      if (!response.ok) {
        throw new Error("AI moderation route failed.");
      }

      const data = await response.json();

      return {
        statusToUse:
          data.statusToUse === "approved" ? "approved" : "submitted",
        aiRiskLevel:
          data.aiRiskLevel === "low" ||
          data.aiRiskLevel === "medium" ||
          data.aiRiskLevel === "high"
            ? data.aiRiskLevel
            : "medium",
        aiSuggestedAction:
          data.aiSuggestedAction === "approve" ||
          data.aiSuggestedAction === "review" ||
          data.aiSuggestedAction === "reject"
            ? data.aiSuggestedAction
            : "review",
        aiSummary:
          typeof data.aiSummary === "string"
            ? data.aiSummary
            : "AI Assist completed with no summary.",
        aiFlags: Array.isArray(data.aiFlags) ? data.aiFlags : [],
        aiReviewStatus:
          typeof data.aiReviewStatus === "string"
            ? data.aiReviewStatus
            : "completed",
      };
    } catch (error) {
      console.error("Moderation failed:", error);

      return {
        statusToUse: "submitted",
        aiRiskLevel: "medium",
        aiSuggestedAction: "review",
        aiSummary:
          "AI Assist could not complete the review, so this upload was sent to admin review.",
        aiFlags: ["moderation_unavailable"],
        aiReviewStatus: "failed",
      };
    }
  }

  function createVideoThumbnail(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      const canvas = document.createElement("canvas");
      const objectUrl = URL.createObjectURL(file);

      video.src = objectUrl;
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";

      video.onloadedmetadata = () => {
        try {
          video.currentTime = Math.min(0.5, video.duration || 0.5);
        } catch {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Could not seek video for thumbnail."));
        }
      };

      video.onseeked = () => {
        try {
          canvas.width = video.videoWidth || 720;
          canvas.height = video.videoHeight || 1280;

          const context = canvas.getContext("2d");

          if (!context) {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Could not create thumbnail canvas."));
            return;
          }

          context.drawImage(video, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(objectUrl);

              if (!blob) {
                reject(new Error("Could not create video thumbnail."));
                return;
              }

              resolve(blob);
            },
            "image/jpeg",
            0.82
          );
        } catch {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Could not capture video thumbnail."));
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not load video for thumbnail."));
      };
    });
  }

  async function uploadPhotoIfNeeded(
    currentUserId: string
  ): Promise<string | null> {
    if (!photoFile) return null;

    const fileExtension = photoFile.name.split(".").pop() || "jpg";
    const cleanExtension = fileExtension.toLowerCase();
    const photoFileName = `${currentUserId}/${Date.now()}-${crypto.randomUUID()}.${cleanExtension}`;

    const { error: photoUploadError } = await supabase.storage
      .from(STORY_IMAGE_BUCKET)
      .upload(photoFileName, photoFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: photoFile.type || "image/jpeg",
      });

    if (photoUploadError) {
      throw new Error(photoUploadError.message);
    }

    return photoFileName;
  }

  async function uploadVideoIfNeeded(currentUserId: string) {
    if (!videoFile) {
      return {
        videoUrl: null as string | null,
        thumbnailUrl: null as string | null,
      };
    }

    const fileExtension = videoFile.name.split(".").pop() || "mp4";
    const cleanExtension = fileExtension.toLowerCase();
    const videoFileName = `${currentUserId}/${Date.now()}-${crypto.randomUUID()}.${cleanExtension}`;

    const { error: videoUploadError } = await supabase.storage
      .from("story-videos")
      .upload(videoFileName, videoFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: videoFile.type || "video/mp4",
      });

    if (videoUploadError) {
      throw new Error(videoUploadError.message);
    }

    const { data: videoPublicData } = supabase.storage
      .from("story-videos")
      .getPublicUrl(videoFileName);

    const videoPublicUrl = videoPublicData.publicUrl;

    let thumbnailUrl: string | null = null;

    try {
      const thumbnailBlob = await createVideoThumbnail(videoFile);
      const thumbnailFileName = `${currentUserId}/${Date.now()}-${crypto.randomUUID()}.jpg`;

      const { error: thumbnailUploadError } = await supabase.storage
        .from("story-thumbnails")
        .upload(thumbnailFileName, thumbnailBlob, {
          cacheControl: "3600",
          upsert: false,
          contentType: "image/jpeg",
        });

      if (thumbnailUploadError) {
        throw new Error(
          `Thumbnail upload failed: ${thumbnailUploadError.message}`
        );
      }

      const { data: thumbnailPublicData } = supabase.storage
        .from("story-thumbnails")
        .getPublicUrl(thumbnailFileName);

      thumbnailUrl = thumbnailPublicData.publicUrl;
    } catch (thumbnailError) {
      const errorMessage =
        thumbnailError instanceof Error
          ? thumbnailError.message
          : "Thumbnail creation failed.";

      throw new Error(errorMessage);
    }

    return {
      videoUrl: videoPublicUrl,
      thumbnailUrl,
    };
  }

  async function submitStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!userId || !profile) {
      setMessage("Please sign in before sharing.");
      return;
    }

    const cleanStoryText = storyText.trim();
    const hasPhoto = mediaMode === "photo" && Boolean(photoFile);
    const hasVideo = mediaMode === "video" && Boolean(videoFile);

    if (!cleanStoryText && !hasPhoto && !hasVideo) {
      setMessage(
        "Please write a story, prayer request, praise report, or upload a photo or video."
      );
      return;
    }

    if (mediaMode === "photo" && !hasPhoto) {
      setMessage("Please upload a photo or choose text story only.");
      return;
    }

    if (mediaMode === "video" && !hasVideo) {
      setMessage("Please upload a video or choose text story only.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const finalStoryType =
        mediaMode === "video"
          ? "Video Testimony"
          : mediaMode === "photo"
            ? "Photo Story"
            : storyType;

      setMessage("Checking your post...");

      const moderationDecision = await moderateStoryText({
        finalStoryType,
        cleanStoryText,
        hasVideo,
        hasPhoto,
      });

      setMessage("Uploading your post...");

      const imagePath = hasPhoto ? await uploadPhotoIfNeeded(userId) : null;
      const { videoUrl, thumbnailUrl } = hasVideo
        ? await uploadVideoIfNeeded(userId)
        : { videoUrl: null, thumbnailUrl: null };

      const { error } = await supabase.from("stories").insert({
        user_id: userId,
        name: getPostingName(),
        location: getPostingLocation(),
        story_type: finalStoryType,
        story_text: cleanStoryText || null,
        image_url: imagePath,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        caption_style:
          mediaMode === "photo" || mediaMode === "video"
            ? captionStyle
            : null,
        text_size: "text-medium",
        text_style: "style-clean",
        text_position: "position-bottom-left",
        text_background: "background-dark",
        status: moderationDecision.statusToUse,
        ai_review_status: moderationDecision.aiReviewStatus,
        ai_reviewed_at: new Date().toISOString(),
        ai_risk_level: moderationDecision.aiRiskLevel,
        ai_suggested_action: moderationDecision.aiSuggestedAction,
        ai_flags: moderationDecision.aiFlags,
        ai_summary: moderationDecision.aiSummary,
      });

      if (error) {
        throw new Error(error.message);
      }

      const wentLiveInstantly = moderationDecision.statusToUse === "approved";

      setStoryText("");
      removePhoto();
      removeVideo();
      setMediaMode("text");
      setStoryType("Testimony");

      setMessage(
        wentLiveInstantly
          ? "Your post is live on HTBF."
          : "Your post was submitted for admin review before appearing publicly."
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Something went wrong.";

      setMessage(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  function renderMessageInput({
    label,
    placeholder,
    rows = 8,
  }: {
    label: string;
    placeholder: string;
    rows?: number;
  }) {
    return (
      <div className="w-full max-w-full overflow-hidden">
        <label className="mb-2 block text-sm font-black text-[#062a57]">
          {label}
        </label>

        <textarea
          value={storyText}
          onChange={(event) => setStoryText(event.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="w-full max-w-full resize-none overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-base leading-7 text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
          style={{
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        />

        <div className="mt-3 flex max-w-full flex-wrap gap-2 overflow-hidden">
          {emojiOptions.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => addEmoji(emoji)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-50 text-xl ring-1 ring-slate-200 transition hover:bg-blue-50"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderSafetyNotice() {
    return (
      <div className="rounded-[1.5rem] bg-amber-50 p-4 text-sm leading-6 text-amber-900 ring-1 ring-amber-100">
        <div className="font-black">AI-assisted safety review</div>
        <p className="mt-1">
          Most low-risk posts can appear quickly. Posts that need a closer look
          may go to admin review before appearing publicly.
        </p>
      </div>
    );
  }

  function renderStatusMessage() {
    if (!message) return null;

    return (
      <div className="rounded-[1.5rem] bg-blue-50 p-4 text-sm font-bold leading-6 text-[#082f63] ring-1 ring-blue-100">
        {message}
      </div>
    );
  }

  function renderSubmitControls() {
    return (
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Link
          href="/journey"
          className="inline-flex items-center justify-center rounded-full bg-slate-100 px-6 py-4 text-base font-black text-slate-700 hover:bg-slate-200"
        >
          Not Yet
        </Link>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-6 py-4 text-base font-black text-white shadow-sm hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-48"
        >
          {submitting ? "Submitting..." : "Submit for Review"}
          <Send className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (checkingUser) {
    return (
      <main className="min-h-screen overflow-x-hidden bg-[#f8fbff] px-6 py-12 text-slate-900">
        <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-[2rem] bg-white p-8 shadow-sm ring-1 ring-slate-200">
          Loading share page...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f8fbff] pb-24 text-slate-900">
      <div className="mx-auto w-full max-w-3xl overflow-x-hidden px-4 py-6">
        <div className="mb-5 flex items-center justify-between">
          <Link
            href="/journey"
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-[#082f63] shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Cancel
          </Link>

          <div className="rounded-full bg-blue-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
            SHARE YOUR STORY
          </div>
        </div>

        <section className="w-full max-w-full overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#082f63] via-[#0b63ce] to-[#69b7ff] p-6 text-white shadow-xl shadow-blue-950/10">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-black text-blue-100 ring-1 ring-white/15">
            <Sparkles className="h-4 w-4" />
            SHARE YOUR STORY
          </div>

          <h1 className="mt-4 text-4xl font-black tracking-tight">
            What has God done?
          </h1>

          <p className="mt-3 max-w-2xl leading-7 text-blue-100">
            Share a testimony, praise report, prayer request, photo, or video
            with the HTBF community.
          </p>
        </section>

        <section className="mt-5 w-full max-w-full overflow-hidden rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              Posting as
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#062a57] ring-1 ring-slate-200">
                {getPostingName()}
              </span>

              {getPostingLocation() && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-600 ring-1 ring-slate-200">
                  <Globe2 className="h-4 w-4" />
                  {getPostingLocation()}
                </span>
              )}
            </div>
          </div>

          <form onSubmit={submitStory} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-black text-[#062a57]">
                Choose your story format
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                {mediaOptions.map((item) => {
                  const Icon = item.icon;
                  const selected = mediaMode === item.value;

                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => selectMediaMode(item.value)}
                      className={`rounded-[1.5rem] p-4 text-left ring-1 transition ${
                        selected
                          ? "bg-blue-50 ring-blue-200"
                          : "bg-white ring-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                            selected
                              ? "bg-[#0b63ce] text-white"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>

                        <div className="font-black text-[#062a57]">
                          {item.label}
                        </div>
                      </div>

                      <p className="mt-3 text-sm leading-6 text-slate-500">
                        {item.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {mediaMode === "text" && (
              <div>
                <label className="mb-2 block text-sm font-black text-[#062a57]">
                  What are you sharing?
                </label>

                <div className="grid gap-3 sm:grid-cols-3">
                  {storyTypes.map((item) => {
                    const Icon = item.icon;
                    const selected = storyType === item.value;

                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setStoryType(item.value)}
                        className={`rounded-[1.5rem] p-4 text-left ring-1 transition ${
                          selected
                            ? "bg-blue-50 ring-blue-200"
                            : "bg-white ring-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <Icon
                          className={`h-5 w-5 ${
                            selected ? "text-[#0b63ce]" : "text-slate-500"
                          }`}
                        />
                        <div className="mt-2 font-black text-[#062a57]">
                          {item.label}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          {item.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {shouldShowMessageInput &&
              mediaMode !== "video" &&
              renderMessageInput({
                label: "Your message",
                placeholder:
                  "Share what God did, what you’re praying for, or what encouraged you...",
              })}

            {mediaMode === "photo" && (
              <div>
                <label className="mb-2 block text-sm font-black text-[#062a57]">
                  Photo
                </label>

                <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-4">
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-[1.25rem] bg-white px-4 py-6 text-center ring-1 ring-slate-200 hover:bg-slate-50">
                    <ImagePlus className="h-8 w-8 text-[#0b63ce]" />

                    <div className="mt-3 text-sm font-black text-[#062a57]">
                      Upload a photo
                    </div>

                    <div className="mt-1 text-xs font-semibold text-slate-500">
                      JPEG, PNG, and WebP images are supported.
                    </div>

                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) =>
                        handlePhotoSelect(event.target.files?.[0] ?? null)
                      }
                      className="hidden"
                    />
                  </label>

                  {photoFile && (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-[#082f63]">
                      <div className="flex min-w-0 items-center gap-2">
                        <ImagePlus className="h-4 w-4 shrink-0" />
                        <span className="truncate">{photoFile.name}</span>
                      </div>

                      <button
                        type="button"
                        onClick={removePhoto}
                        className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-black text-red-600 ring-1 ring-red-100"
                      >
                        Remove Photo
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {photoPreviewUrl && (
              <div className="w-full max-w-full overflow-hidden rounded-[1.75rem] bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-[#0b63ce]">
                      Preview
                    </div>
                    <div className="mt-1 text-lg font-black text-[#062a57]">
                      Photo Story
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Choose how your message should appear with this photo.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={removePhoto}
                    className="inline-flex shrink-0 items-center justify-center rounded-full bg-red-50 px-4 py-2 text-sm font-black text-red-700 ring-1 ring-red-100 hover:bg-red-100"
                  >
                    Remove Photo
                  </button>
                </div>

                <div className="mb-4">
                  <div className="mb-2 text-sm font-black text-[#062a57]">
                    Display style
                  </div>
                  <SegmentedOptionGroup
                    options={photoDisplayOptions}
                    value={photoDisplayStyle}
                    onChange={(value) =>
                      setPhotoDisplayStyle(value as PhotoDisplayStyle)
                    }
                  />
                </div>

                <div className="max-w-full overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
                  <div className="p-5">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-lg font-black text-[#0b63ce]">
                        {getPostingName().charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <div
                            className="min-w-0 max-w-full break-words font-black text-slate-900"
                            style={{
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                            }}
                          >
                            {getPostingName()}
                          </div>

                          <span className="text-sm text-slate-400">•</span>

                          <span className="max-w-full break-words rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-[#0b63ce]">
                            Photo Story
                          </span>
                        </div>

                        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-sm font-medium text-slate-500">
                          <Globe2 className="h-4 w-4 shrink-0" />
                          <span
                            className="min-w-0 max-w-full break-words"
                            style={{
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                            }}
                          >
                            {getPostingLocation() || "Location not shared"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className={getPhotoFeedPreviewFrameClass(
                      photoDisplayStyle
                    )}
                  >
                    <div className="relative">
                      <img
                        src={photoPreviewUrl}
                        alt="Selected story photo preview"
                        className={getPhotoPreviewImageClass(photoDisplayStyle)}
                      />

                      {previewText && captionStyle !== "classic-caption" && (
                        <CaptionTextOverlay
                          align={captionAlign}
                          color={captionColor}
                          position={captionPosition}
                          size={captionSize}
                          style={captionStyle}
                          text={previewText}
                        />
                      )}
                    </div>
                  </div>

                  {previewText && captionStyle === "classic-caption" && (
                    <div className="p-5 pt-4">
                      <p
                        className="max-w-full overflow-hidden whitespace-pre-wrap break-words rounded-2xl bg-slate-50 px-4 py-3 text-[17px] leading-7 text-slate-800 ring-1 ring-slate-200"
                        style={{
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                        }}
                      >
                        {previewText}
                      </p>
                    </div>
                  )}
                </div>

                <CaptionStyleControls
                  dark={false}
                  style={captionStyle}
                  onStyleChange={setCaptionStyle}
                  color={captionColor}
                  onColorChange={setCaptionColor}
                  position={captionPosition}
                  onPositionChange={setCaptionPosition}
                  size={captionSize}
                  onSizeChange={setCaptionSize}
                  align={captionAlign}
                  onAlignChange={setCaptionAlign}
                />
              </div>
            )}

            {mediaMode === "video" && (
              <div className={videoPreviewUrl ? "hidden sm:block" : undefined}>
                <label className="mb-2 block text-sm font-black text-[#062a57]">
                  Video
                </label>

                <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-4">
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-[1.25rem] bg-white px-4 py-6 text-center ring-1 ring-slate-200 hover:bg-slate-50">
                    <Upload className="h-8 w-8 text-[#0b63ce]" />

                    <div className="mt-3 text-sm font-black text-[#062a57]">
                      Upload a video
                    </div>

                    <div className="mt-1 text-xs font-semibold text-slate-500">
                      iPhone videos, MOV, MP4, and normal phone videos are okay.
                    </div>

                    <input
                      type="file"
                      accept="video/*"
                      onChange={(event) =>
                        handleVideoSelect(event.target.files?.[0] ?? null)
                      }
                      className="hidden"
                    />
                  </label>

                  {videoFile && (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-[#082f63]">
                      <div className="flex min-w-0 items-center gap-2">
                        <ImagePlus className="h-4 w-4 shrink-0" />
                        <span className="truncate">{videoFile.name}</span>
                      </div>

                      <button
                        type="button"
                        onClick={removeVideo}
                        className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-black text-red-600 ring-1 ring-red-100"
                      >
                        Remove Video
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {videoPreviewUrl && (
              <div className="sm:hidden w-full max-w-full min-w-0 overflow-hidden rounded-[1.75rem] bg-slate-950 p-3 text-white shadow-sm ring-1 ring-slate-800">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-200">
                      HTBF Mobile Creator Studio
                    </div>
                    <div className="mt-1 text-base font-black">Video Story</div>
                  </div>

                  <button
                    type="button"
                    onClick={removeVideo}
                    className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-black text-red-600 ring-1 ring-white/10"
                  >
                    Remove
                  </button>
                </div>

                <div className="relative w-full max-w-full overflow-hidden rounded-[1.5rem] bg-black ring-1 ring-white/10">
                  <video
                    src={videoPreviewUrl}
                    controls
                    playsInline
                    className="max-h-[58vh] w-full bg-black object-contain"
                  />

                  {previewText ? (
                    <CaptionTextOverlay
                      align={captionAlign}
                      color={captionColor}
                      position={captionPosition}
                      size={captionSize}
                      style={captionStyle}
                      text={previewText}
                    />
                  ) : (
                    <div className="pointer-events-none absolute inset-x-4 bottom-20 rounded-2xl bg-black/55 px-4 py-3 text-center text-sm font-bold text-white/85 backdrop-blur">
                      Tap Message to add text
                    </div>
                  )}
                </div>

                <div className="sticky bottom-3 z-20 mt-3 w-full max-w-full overflow-hidden rounded-[1.5rem] bg-white/95 p-2 text-slate-900 shadow-xl ring-1 ring-white/30 backdrop-blur">
                  <div className="flex w-full max-w-full gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {mobileVideoToolOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setMobileVideoTool(option.value)}
                        className={`shrink-0 rounded-full px-3 py-2 text-[11px] font-black transition ${
                          mobileVideoTool === option.value
                            ? "bg-[#0b63ce] text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-blue-50"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-2 w-full max-w-full min-w-0 overflow-hidden">
                    {mobileVideoTool === "message" && (
                      <div>
                        <label className="mb-1.5 block text-xs font-black text-[#062a57]">
                          Video message
                        </label>
                        <textarea
                          value={storyText}
                          onChange={(event) => setStoryText(event.target.value)}
                          rows={3}
                          placeholder="Share what God did..."
                          className="w-full max-w-full resize-none overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
                          style={{
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                          }}
                        />
                      </div>
                    )}

                    {mobileVideoTool === "style" && (
                      <div className="flex w-full max-w-full gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {mobileCaptionStyleOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setCaptionStyle(option.value)}
                            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-black ring-1 transition ${
                              captionStyle === option.value
                                ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                                : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-blue-50"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {mobileVideoTool === "color" && (
                      <div className="flex w-full max-w-full items-center gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {captionColorOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setCaptionColor(option.value)}
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-2 transition ${
                              captionColor === option.value
                                ? "ring-[#0b63ce]"
                                : "ring-transparent"
                            }`}
                            aria-label={option.label}
                            title={option.label}
                          >
                            <span
                              className={`h-7 w-7 rounded-full ring-1 ring-black/10 ${option.swatchClass}`}
                            />
                          </button>
                        ))}

                        <label className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-slate-50 px-3 text-xs font-black text-slate-700 ring-1 ring-slate-200">
                          Custom
                          <input
                            type="color"
                            value={getCaptionColorPickerValue(captionColor)}
                            onChange={(event) =>
                              setCaptionColor(event.target.value as CaptionColor)
                            }
                            className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
                            aria-label="Choose custom text color"
                          />
                        </label>
                      </div>
                    )}

                    {mobileVideoTool === "size" && (
                      <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                        <div className="mb-2 flex items-center justify-between text-xs font-black text-[#062a57]">
                          <span>Text size</span>
                          <span>
                            {
                              captionSizeOptions.find(
                                (option) => option.value === captionSize
                              )?.label
                            }
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={captionSizeOptions.length - 1}
                          step={1}
                          value={captionSizeSliderIndex}
                          onChange={(event) =>
                            setCaptionSize(
                              captionSizeOptions[Number(event.target.value)]
                                ?.value ?? "medium"
                            )
                          }
                          className="w-full accent-[#0b63ce]"
                          aria-label="Text size"
                        />
                        <div className="mt-2 flex justify-between text-[10px] font-bold text-slate-500">
                          {captionSizeOptions.map((option) => (
                            <span key={option.value}>{option.label}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {mobileVideoTool === "position" && (
                      <div>
                        <div className="grid w-full max-w-full grid-cols-3 gap-1 rounded-full bg-slate-50 p-1 ring-1 ring-slate-200">
                          {captionPositionOptions.map((option) => (
                            <ToolbarChip
                              key={option.value}
                              active={captionPosition === option.value}
                              dark={false}
                              label={option.label}
                              onClick={() => setCaptionPosition(option.value)}
                            />
                          ))}
                        </div>
                        <p className="mt-2 text-[11px] font-semibold leading-5 text-slate-500">
                          TODO: Add drag-and-drop text positioning later.
                        </p>
                      </div>
                    )}

                    {mobileVideoTool === "preview" && (
                      <div className="rounded-2xl bg-blue-50 p-3 text-sm leading-6 text-[#082f63] ring-1 ring-blue-100">
                        <div className="text-xs font-black uppercase tracking-[0.14em]">
                          Preview mode
                        </div>
                        <p className="mt-1 font-semibold">
                          The video canvas above shows how your message will
                          look in the post preview area.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-3">
                  {renderStatusMessage()}
                  {renderSubmitControls()}
                </div>
              </div>
            )}

            {videoPreviewUrl && (
              <div className="hidden w-full max-w-full overflow-hidden rounded-[1.75rem] bg-slate-950 p-4 text-white shadow-sm ring-1 ring-slate-800 sm:block">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-200">
                      Edit your video message
                    </div>
                    <div className="mt-1 text-lg font-black">Video Story</div>
                    <p className="mt-1 text-sm leading-6 text-slate-300">
                      Type, style, and preview your message in one place.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={removeVideo}
                    className="inline-flex shrink-0 items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-black text-red-600 ring-1 ring-white/10 hover:bg-red-50"
                  >
                    Remove Video
                  </button>
                </div>

                <div className="grid w-full max-w-full min-w-0 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:items-start">
                  <div className="min-w-0 max-w-full lg:sticky lg:top-4">
                    <div className="overflow-hidden rounded-[1.5rem] bg-black ring-1 ring-white/10">
                      <div className="relative bg-black">
                        <video
                          src={videoPreviewUrl}
                          controls
                          playsInline
                          className="max-h-[560px] w-full bg-black object-contain lg:max-h-[620px]"
                        />

                        {previewText && captionStyle !== "classic-caption" && (
                          <CaptionTextOverlay
                            align={captionAlign}
                            color={captionColor}
                            position={captionPosition}
                            size={captionSize}
                            style={captionStyle}
                            text={previewText}
                          />
                        )}
                      </div>
                    </div>

                    {previewText && captionStyle === "classic-caption" && (
                      <p
                        className="mt-3 max-w-full overflow-hidden whitespace-pre-wrap break-words rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold leading-6 text-slate-200 ring-1 ring-white/10"
                        style={{
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                        }}
                      >
                        {previewText}
                      </p>
                    )}
                  </div>

                  <div className="min-w-0 max-w-full space-y-4 overflow-hidden rounded-[1.5rem] bg-white p-4 text-slate-900 ring-1 ring-white/10">
                    {renderMessageInput({
                      label: "Video message",
                      placeholder: "Add a short message for this video...",
                      rows: 5,
                    })}

                    <CaptionStyleControls
                      dark={false}
                      style={captionStyle}
                      onStyleChange={setCaptionStyle}
                      color={captionColor}
                      onColorChange={setCaptionColor}
                      position={captionPosition}
                      onPositionChange={setCaptionPosition}
                      size={captionSize}
                      onSizeChange={setCaptionSize}
                      align={captionAlign}
                      onAlignChange={setCaptionAlign}
                    />

                    {renderSafetyNotice()}
                    {renderStatusMessage()}
                    {renderSubmitControls()}
                  </div>
                </div>
              </div>
            )}

            {!hasSelectedVideo && (
              <>
                {renderSafetyNotice()}
                {renderStatusMessage()}
                {renderSubmitControls()}
              </>
            )}
          </form>
        </section>
      </div>

    </main>
  );
}

function CaptionStyleControls({
  align,
  color,
  dark,
  onAlignChange,
  onColorChange,
  onPositionChange,
  onSizeChange,
  onStyleChange,
  position,
  size,
  style,
}: {
  align: CaptionAlign;
  color: CaptionColor;
  dark: boolean;
  onAlignChange: (value: CaptionAlign) => void;
  onColorChange: (value: CaptionColor) => void;
  onPositionChange: (value: CaptionPosition) => void;
  onSizeChange: (value: CaptionSize) => void;
  onStyleChange: (value: CaptionStyle) => void;
  position: CaptionPosition;
  size: CaptionSize;
  style: CaptionStyle;
}) {
  const [activePanel, setActivePanel] = useState<TextEditorPanel>("style");
  const selectedStyleLabel =
    captionStyleOptions.find((option) => option.value === style)?.label ??
    "Classic";
  const selectedColorOption = captionColorOptions.find(
    (option) => option.value === color
  );
  const colorPickerValue = getCaptionColorPickerValue(color);

  return (
    <div
      className={`mx-auto mt-4 w-full max-w-md min-w-0 overflow-hidden rounded-[1.5rem] p-3 ring-1 ${
        dark ? "bg-white/10 ring-white/10" : "bg-blue-50 ring-blue-100"
      }`}
    >
      <div className="mb-2 flex min-w-0 max-w-full items-center justify-between gap-3">
        <div
          className={`min-w-0 text-xs font-black uppercase tracking-[0.14em] ${
            dark ? "text-white" : "text-[#062a57]"
          }`}
        >
          Text tools
        </div>

        <div
          className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-black ${
            dark ? "bg-white/10 text-blue-100" : "bg-white text-[#0b63ce]"
          }`}
        >
          {selectedStyleLabel}
        </div>
      </div>

      <div
        className={`grid grid-cols-5 gap-1 rounded-full p-1 ${
          dark ? "bg-black/25" : "bg-white"
        }`}
      >
        <ToolbarButton
          active={activePanel === "style"}
          dark={dark}
          label="Aa"
          onClick={() => setActivePanel("style")}
          title="Font and style"
        />
        <ToolbarButton
          active={activePanel === "color"}
          dark={dark}
          onClick={() => setActivePanel("color")}
          title="Text color"
        >
          <span
            className={`h-4 w-4 rounded-full ring-1 ring-black/10 ${
              selectedColorOption?.swatchClass ?? ""
            }`}
            style={
              selectedColorOption
                ? undefined
                : { backgroundColor: colorPickerValue }
            }
          />
        </ToolbarButton>
        <ToolbarButton
          active={activePanel === "align"}
          dark={dark}
          label={align === "left" ? "≡" : align === "right" ? "≣" : "☰"}
          onClick={() => setActivePanel("align")}
          title="Text alignment"
        />
        <ToolbarButton
          active={activePanel === "size"}
          dark={dark}
          label={size === "extra-large" ? "XL" : "Tt"}
          onClick={() => setActivePanel("size")}
          title="Text size"
        />
        <ToolbarButton
          active={activePanel === "position"}
          dark={dark}
          label="↕"
          onClick={() => setActivePanel("position")}
          title="Text position"
        />
      </div>

      <div className="mt-3 w-full max-w-full min-w-0 overflow-hidden">
        {activePanel === "style" && (
          <div className="flex w-full max-w-full gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {captionStyleOptions.map((option) => {
              const selected = style === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onStyleChange(option.value)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-black ring-1 transition ${
                    selected
                      ? dark
                        ? "bg-white text-[#082f63] ring-white"
                        : "bg-[#0b63ce] text-white ring-[#0b63ce]"
                      : dark
                        ? "bg-white/10 text-slate-200 ring-white/10 hover:bg-white/15"
                        : "bg-white text-slate-600 ring-blue-100 hover:bg-blue-100"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}

        {activePanel === "color" && (
          <div className="flex w-full max-w-full items-center gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {captionColorOptions.map((option) => {
              const selected = color === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onColorChange(option.value)}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-2 transition ${
                    selected
                      ? dark
                        ? "ring-white"
                        : "ring-[#0b63ce]"
                      : "ring-transparent"
                  }`}
                  aria-label={option.label}
                  title={option.label}
                >
                  <span
                    className={`h-6 w-6 rounded-full ring-1 ring-black/10 ${option.swatchClass}`}
                  />
                </button>
              );
            })}

            <label
              className={`flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full px-2.5 text-xs font-black ring-1 transition ${
                selectedColorOption
                  ? dark
                    ? "bg-white/10 text-slate-200 ring-white/10 hover:bg-white/15"
                    : "bg-white text-slate-600 ring-blue-100 hover:bg-blue-100"
                  : dark
                    ? "bg-white text-[#082f63] ring-white"
                    : "bg-[#0b63ce] text-white ring-[#0b63ce]"
              }`}
            >
              Custom
              <input
                type="color"
                value={colorPickerValue}
                onChange={(event) =>
                  onColorChange(event.target.value as CaptionColor)
                }
                className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
                aria-label="Choose custom text color"
              />
            </label>
          </div>
        )}

        {activePanel === "align" && (
          <div
            className={`grid w-full max-w-full grid-cols-3 gap-1 rounded-full p-1 ${
              dark ? "bg-black/20" : "bg-white/70"
            }`}
          >
            {captionAlignOptions.map((option) => (
              <ToolbarChip
                key={option.value}
                active={align === option.value}
                dark={dark}
                label={option.label}
                onClick={() => onAlignChange(option.value)}
              />
            ))}
          </div>
        )}

        {activePanel === "size" && (
          <div
            className={`grid w-full max-w-full grid-cols-4 gap-1 rounded-full p-1 ${
              dark ? "bg-black/20" : "bg-white/70"
            }`}
          >
            {captionSizeOptions.map((option) => (
              <ToolbarChip
                key={option.value}
                active={size === option.value}
                dark={dark}
                label={option.label}
                onClick={() => onSizeChange(option.value)}
              />
            ))}
          </div>
        )}

        {activePanel === "position" && (
          <div
            className={`grid w-full max-w-full grid-cols-3 gap-1 rounded-full p-1 ${
              dark ? "bg-black/20" : "bg-white/70"
            }`}
          >
            {captionPositionOptions.map((option) => (
              <ToolbarChip
                key={option.value}
                active={position === option.value}
                dark={dark}
                label={option.label}
                onClick={() => onPositionChange(option.value)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  active,
  children,
  dark,
  label,
  onClick,
  title,
}: {
  active: boolean;
  children?: ReactNode;
  dark: boolean;
  label?: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 min-w-0 items-center justify-center rounded-full text-sm font-black transition ${
        active
          ? "bg-[#0b63ce] text-white"
          : dark
            ? "text-slate-200 hover:bg-white/10"
            : "text-slate-600 hover:bg-blue-50"
      }`}
      aria-label={title}
      title={title}
    >
      {children ?? label}
    </button>
  );
}

function ToolbarChip({
  active,
  dark,
  label,
  onClick,
}: {
  active: boolean;
  dark: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-0 rounded-full px-2.5 py-2 text-[11px] font-black transition ${
        active
          ? "bg-[#0b63ce] text-white"
          : dark
            ? "text-slate-200 hover:bg-white/10"
            : "text-slate-600 hover:bg-blue-50"
      }`}
    >
      {label}
    </button>
  );
}

function CaptionTextOverlay({
  align,
  color,
  position,
  size,
  style,
  text,
}: {
  align: CaptionAlign;
  color: CaptionColor;
  position: CaptionPosition;
  size: CaptionSize;
  style: CaptionStyle;
  text: string;
}) {
  const positionClass = getCaptionPositionClass(position);
  const sizeClass = getCaptionSizeClass(size);
  const alignClass = getCaptionAlignClass(align);
  const styleClass = getCaptionStyleClass(style);
  const colorClass = getCaptionColorClass(color);
  const inlineColor = getCaptionInlineColor(color);
  const textShadow = getCaptionTextShadow(color);
  const quoteText = style === "testimony-quote" ? `“${text}”` : text;

  return (
    <div
      className={`pointer-events-none absolute max-h-44 max-w-[calc(100%-2rem)] overflow-hidden whitespace-pre-wrap break-words px-4 py-3 leading-snug shadow-lg ${positionClass} ${sizeClass} ${alignClass} ${styleClass} ${colorClass}`}
      style={{
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        color: inlineColor,
        textShadow,
      }}
    >
      {quoteText}
    </div>
  );
}

function getCaptionPositionClass(position: CaptionPosition) {
  if (position === "top") return "left-4 right-4 top-4";
  if (position === "center") {
    return "left-1/2 top-1/2 w-[min(86%,34rem)] -translate-x-1/2 -translate-y-1/2";
  }
  return "bottom-5 left-4 right-4";
}

function getCaptionSizeClass(size: CaptionSize) {
  if (size === "small") return "text-xs sm:text-sm";
  if (size === "extra-large") return "text-xl sm:text-3xl";
  if (size === "large") return "text-base sm:text-xl";
  return "text-sm sm:text-base";
}

function getCaptionAlignClass(align: CaptionAlign) {
  if (align === "left") return "text-left";
  if (align === "right") return "text-right";
  return "text-center";
}

function getCaptionStyleClass(style: CaptionStyle) {
  if (style === "bold-center") {
    return "rounded-[1.5rem] bg-black/45 font-black text-white backdrop-blur";
  }
  if (style === "bottom-banner") {
    return "rounded-2xl bg-black/75 font-bold text-white backdrop-blur";
  }
  if (style === "highlight-box") {
    return "rounded-[1.5rem] bg-yellow-300/95 font-black text-yellow-950 ring-1 ring-white/70";
  }
  if (style === "scripture-card") {
    return "rounded-[1.5rem] bg-blue-50/90 font-serif italic text-[#082f63] ring-1 ring-white/70 backdrop-blur";
  }
  if (style === "praise-glow") {
    return "rounded-[1.5rem] bg-amber-300/90 font-black text-amber-950 ring-1 ring-white/70 shadow-amber-300/30";
  }
  if (style === "testimony-quote") {
    return "rounded-[1.5rem] bg-white/90 font-black text-[#062a57] ring-1 ring-white/70 backdrop-blur";
  }
  if (style === "minimal-white") {
    return "font-black text-white shadow-none [text-shadow:0_2px_12px_rgba(0,0,0,0.85)]";
  }
  if (style === "black-outline") {
    return "font-black text-white shadow-none [text-shadow:2px_2px_0_#000,-2px_2px_0_#000,2px_-2px_0_#000,-2px_-2px_0_#000]";
  }
  if (style === "soft-gradient") {
    return "rounded-[1.5rem] bg-gradient-to-r from-black/70 via-[#0b63ce]/60 to-black/50 font-bold text-white backdrop-blur";
  }
  return "rounded-2xl bg-white/90 font-semibold text-slate-900 ring-1 ring-white/70";
}

function getCaptionColorPickerValue(color: CaptionColor): `#${string}` {
  if (color.startsWith("#")) return color as `#${string}`;

  return (
    captionColorOptions.find((option) => option.value === color)?.hex ??
    "#ffffff"
  );
}

function getCaptionInlineColor(color: CaptionColor) {
  if (color.startsWith("#")) return color;

  return undefined;
}

function getCaptionColorClass(color: CaptionColor) {
  if (color.startsWith("#")) return "";
  if (color === "black") return "!text-slate-950";
  if (color === "soft-gold") return "!text-amber-200";
  if (color === "prayer-blue") return "!text-blue-200";
  if (color === "warm-cream") return "!text-[#fff4d6]";
  if (color === "praise-green") return "!text-emerald-200";
  return "!text-white";
}

function getCaptionTextShadow(color: CaptionColor) {
  if (color === "black" || isDarkCaptionColor(color)) {
    return "0 1px 10px rgba(255,255,255,0.72)";
  }

  return "0 2px 12px rgba(0,0,0,0.62)";
}

function isDarkCaptionColor(color: CaptionColor) {
  if (!color.startsWith("#") || color.length !== 7) return false;

  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;

  return brightness < 100;
}


function SegmentedOptionGroup<T extends string>({
  options,
  value,
  onChange,
  dark = false,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  dark?: boolean;
}) {
  return (
    <div
      className={`grid gap-2 rounded-2xl p-2 sm:grid-cols-4 ${
        dark ? "bg-white/10 ring-1 ring-white/10" : "bg-slate-50"
      }`}
    >
      {options.map((option) => {
        const selected = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-full px-3 py-2 text-xs font-black transition ${
              selected
                ? "bg-[#0b63ce] text-white shadow-sm"
                : dark
                  ? "bg-white/10 text-slate-200 hover:bg-white/15"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function getPhotoFeedPreviewFrameClass(style: PhotoDisplayStyle) {
  if (style === "framed") {
    return "mx-5 max-w-full overflow-hidden rounded-[1.5rem] bg-[#082f63] p-2 ring-1 ring-blue-100";
  }

  if (style === "original") {
    return "max-w-full overflow-hidden bg-slate-100 px-4 py-4";
  }

  if (style === "full-width") {
    return "max-w-full overflow-hidden bg-slate-100";
  }

  return "mx-5 max-w-full overflow-hidden rounded-[1.5rem] bg-slate-100 ring-1 ring-slate-200";
}

function getPhotoPreviewImageClass(style: PhotoDisplayStyle) {
  if (style === "original") {
    return "mx-auto block max-h-[560px] w-auto max-w-full object-contain";
  }

  if (style === "full-width") {
    return "block max-h-[560px] w-full max-w-full object-cover";
  }

  if (style === "framed") {
    return "block max-h-[560px] w-full max-w-full rounded-[1.5rem] object-cover";
  }

  return "block max-h-[560px] w-full max-w-full rounded-[2rem] object-cover";
}
