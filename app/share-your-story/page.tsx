"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
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
type VideoTextStyle =
  | "clean-caption"
  | "lower-banner"
  | "testimony-quote"
  | "scripture-overlay"
  | "praise-moment";

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

const videoTextStyleOptions: {
  label: string;
  value: VideoTextStyle;
  description: string;
}[] = [
  {
    label: "Clean Caption",
    value: "clean-caption",
    description: "Simple caption below the video.",
  },
  {
    label: "Lower Banner",
    value: "lower-banner",
    description: "Readable dark bar near the bottom.",
  },
  {
    label: "Testimony Quote",
    value: "testimony-quote",
    description: "Centered quote-style overlay.",
  },
  {
    label: "Scripture Overlay",
    value: "scripture-overlay",
    description: "Soft blue and white reflection style.",
  },
  {
    label: "Praise Moment",
    value: "praise-moment",
    description: "Celebratory highlight style.",
  },
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
  const [photoCaption, setPhotoCaption] = useState("");
  const [photoDisplayStyle, setPhotoDisplayStyle] =
    useState<PhotoDisplayStyle>("soft-rounded");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoCaption, setVideoCaption] = useState("");
  // TODO: Persist video text style when stories has a dedicated column.
  const [videoTextStyle, setVideoTextStyle] =
    useState<VideoTextStyle>("clean-caption");
  const [message, setMessage] = useState("");

  const photoFeedText = useMemo(() => {
    const cleanStoryText = storyText.trim();
    const cleanPhotoCaption = photoCaption.trim();

    if (
      cleanStoryText &&
      cleanPhotoCaption &&
      cleanStoryText !== cleanPhotoCaption
    ) {
      return `${cleanPhotoCaption}\n\n${cleanStoryText}`;
    }

    return cleanStoryText || cleanPhotoCaption;
  }, [photoCaption, storyText]);

  const videoFeedText = useMemo(() => {
    const cleanStoryText = storyText.trim();
    const cleanVideoCaption = videoCaption.trim();

    if (
      cleanStoryText &&
      cleanVideoCaption &&
      cleanStoryText !== cleanVideoCaption
    ) {
      return `${cleanVideoCaption}\n\n${cleanStoryText}`;
    }

    return cleanStoryText || cleanVideoCaption;
  }, [storyText, videoCaption]);

  const videoPreviewText = useMemo(() => {
    return videoFeedText.trim();
  }, [videoFeedText]);

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
    setPhotoCaption("");
    setPhotoDisplayStyle("soft-rounded");
  }

  function removeVideo() {
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setVideoCaption("");
    setVideoTextStyle("clean-caption");
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

    const cleanStoryText =
      mediaMode === "photo"
        ? photoFeedText.trim()
        : mediaMode === "video"
          ? videoFeedText.trim()
          : storyText.trim();
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

  if (checkingUser) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-8 shadow-sm ring-1 ring-slate-200">
          Loading share page...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] pb-24 text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-6">
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

        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#082f63] via-[#0b63ce] to-[#69b7ff] p-6 text-white shadow-xl shadow-blue-950/10">
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

        <section className="mt-5 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
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

            <div>
              <label className="mb-2 block text-sm font-black text-[#062a57]">
                Message
              </label>

              <textarea
                value={storyText}
                onChange={(event) => setStoryText(event.target.value)}
                rows={8}
                placeholder="Write your testimony, praise report, prayer request, or encouragement..."
                className="w-full resize-none rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-base leading-7 text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                {emojiOptions.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => addEmoji(emoji)}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 text-xl ring-1 ring-slate-200 transition hover:bg-blue-50"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

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
              <div className="rounded-[1.75rem] bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-[#0b63ce]">
                      Preview
                    </div>
                    <div className="mt-1 text-lg font-black text-[#062a57]">
                      Photo Story
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Add a caption and choose how the photo should feel on the
                      page.
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
                  <label className="mb-2 block text-sm font-black text-[#062a57]">
                    Caption
                  </label>
                  <textarea
                    value={photoCaption}
                    onChange={(event) => setPhotoCaption(event.target.value)}
                    placeholder="Add a short caption for this photo..."
                    rows={3}
                    className="max-w-full w-full resize-none overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
                    style={{
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                    }}
                  />
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
                    <img
                      src={photoPreviewUrl}
                      alt="Selected story photo preview"
                      className={getPhotoPreviewImageClass(photoDisplayStyle)}
                    />
                  </div>

                  {photoFeedText && (
                    <div className="p-5 pt-4">
                      <p
                        className="max-w-full overflow-hidden whitespace-pre-wrap break-words rounded-2xl bg-slate-50 px-4 py-3 text-[17px] leading-7 text-slate-800 ring-1 ring-slate-200"
                        style={{
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                        }}
                      >
                        {photoFeedText}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {mediaMode === "video" && (
              <div>
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
              <div className="rounded-[1.75rem] bg-slate-950 p-4 text-white shadow-sm ring-1 ring-slate-800">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-200">
                      Preview
                    </div>
                    <div className="mt-1 text-lg font-black">Video Story</div>
                    <p className="mt-1 text-sm leading-6 text-slate-300">
                      Add a caption and preview the standard HTBF video format
                      before submitting.
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

                <div className="mb-4">
                  <label className="mb-2 block text-sm font-black text-white">
                    Caption
                  </label>
                  <input
                    value={videoCaption}
                    onChange={(event) => setVideoCaption(event.target.value)}
                    placeholder="Add a short caption for this video..."
                    className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-blue-400/20"
                  />
                </div>

                <div className="mb-4">
                  <div className="mb-2 text-sm font-black text-white">
                    Video Text Style
                  </div>
                  <div className="grid gap-2 sm:grid-cols-5">
                    {videoTextStyleOptions.map((option) => {
                      const selected = videoTextStyle === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setVideoTextStyle(option.value)}
                          className={`rounded-2xl p-3 text-left ring-1 transition ${
                            selected
                              ? "bg-white text-[#082f63] ring-white"
                              : "bg-white/10 text-slate-200 ring-white/10 hover:bg-white/15"
                          }`}
                        >
                          <div className="text-xs font-black">
                            {option.label}
                          </div>
                          <p className="mt-1 text-[11px] font-semibold leading-4 opacity-80">
                            {option.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="overflow-hidden rounded-[1.5rem] bg-black ring-1 ring-white/10">
                  <div className="relative bg-black">
                    <video
                      src={videoPreviewUrl}
                      controls
                      playsInline
                      className="max-h-[620px] w-full bg-black object-contain"
                    />

                    {videoPreviewText &&
                      videoTextStyle !== "clean-caption" && (
                        <VideoTextOverlay
                          style={videoTextStyle}
                          text={videoPreviewText}
                        />
                      )}
                  </div>
                </div>

                {videoPreviewText && videoTextStyle === "clean-caption" && (
                  <p className="mt-3 rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold leading-6 text-slate-200 ring-1 ring-white/10">
                    {videoPreviewText}
                  </p>
                )}
              </div>
            )}

            <div className="rounded-[1.5rem] bg-amber-50 p-4 text-sm leading-6 text-amber-900 ring-1 ring-amber-100">
              <div className="font-black">AI-assisted safety review</div>
              <p className="mt-1">
                Most low-risk posts can appear quickly. Posts that need a closer
                look may go to admin review before appearing publicly.
              </p>
            </div>

            {message && (
              <div className="rounded-[1.5rem] bg-blue-50 p-4 text-sm font-bold leading-6 text-[#082f63] ring-1 ring-blue-100">
                {message}
              </div>
            )}

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
          </form>
        </section>
      </div>

    </main>
  );
}

function VideoTextOverlay({
  style,
  text,
}: {
  style: VideoTextStyle;
  text: string;
}) {
  const baseClass =
    "pointer-events-none absolute max-h-36 max-w-[calc(100%-2rem)] overflow-hidden whitespace-pre-wrap break-words text-sm leading-6 shadow-lg sm:max-h-44 sm:text-base";

  if (style === "testimony-quote") {
    return (
      <div
        className={`${baseClass} left-1/2 top-1/2 w-[min(86%,34rem)] -translate-x-1/2 -translate-y-1/2 rounded-[1.5rem] bg-white/90 px-5 py-4 text-center font-black text-[#062a57] ring-1 ring-white/70 backdrop-blur`}
        style={{
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        &ldquo;{text}&rdquo;
      </div>
    );
  }

  if (style === "scripture-overlay") {
    return (
      <div
        className={`${baseClass} left-4 right-4 top-4 rounded-[1.5rem] bg-blue-50/90 px-5 py-4 font-serif italic text-[#082f63] ring-1 ring-white/70 backdrop-blur`}
        style={{
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {text}
      </div>
    );
  }

  if (style === "praise-moment") {
    return (
      <div
        className={`${baseClass} bottom-5 left-4 right-4 rounded-[1.5rem] bg-amber-300/90 px-5 py-4 font-black text-amber-950 ring-1 ring-white/70`}
        style={{
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {text}
      </div>
    );
  }

  return (
    <div
      className={`${baseClass} inset-x-4 bottom-4 rounded-2xl bg-black/70 px-4 py-3 font-bold text-white backdrop-blur`}
      style={{
        overflowWrap: "anywhere",
        wordBreak: "break-word",
      }}
    >
      {text}
    </div>
  );
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
