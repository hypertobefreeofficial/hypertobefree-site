"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Globe2,
  HeartHandshake,
  ImagePlus,
  MessageCircleHeart,
  Send,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import LoggedInBottomNav from "../../components/LoggedInBottomNav";

type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  username: string | null;
  real_name?: string | null;
  location: string | null;
  profile_completed: boolean | null;
};

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
  {
    label: "Video Story",
    value: "Video Testimony",
    icon: Video,
    description: "Upload a video testimony or encouragement.",
  },
];

export default function ShareYourStoryPage() {
  const [checkingUser, setCheckingUser] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const [storyType, setStoryType] = useState("Testimony");
  const [storyText, setStoryText] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");

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
        setStoryType("Video Testimony");
      }

      if (typeParam === "prayer") {
        setStoryType("Prayer Encouragement");
      }

      setCheckingUser(false);
    }

    loadPage();
  }, []);

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

      if (!thumbnailUploadError) {
        const { data: thumbnailPublicData } = supabase.storage
          .from("story-thumbnails")
          .getPublicUrl(thumbnailFileName);

        thumbnailUrl = thumbnailPublicData.publicUrl;
      }
    } catch {
      thumbnailUrl = null;
    }

    return {
      videoUrl: videoFileName,
      thumbnailUrl,
    };
  }

  async function submitStory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!userId || !profile) {
      setMessage("Please sign in before sharing.");
      return;
    }

    const cleanStoryText = storyText.trim();

    if (!cleanStoryText && !videoFile) {
      setMessage("Please write a story, prayer request, praise report, or upload a video.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const { videoUrl, thumbnailUrl } = await uploadVideoIfNeeded(userId);

      const finalStoryType = videoUrl ? "Video Testimony" : storyType;

      const { error } = await supabase.from("stories").insert({
        user_id: userId,
        name: getPostingName(),
        location: getPostingLocation(),
        story_type: finalStoryType,
        story_text: cleanStoryText || null,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        status: "pending",
      });

      if (error) {
        throw new Error(error.message);
      }

      setStoryText("");
      setVideoFile(null);
      setStoryType("Testimony");
      setMessage(
        "Your post was submitted. Testimony posts, stories, and videos may be reviewed before appearing publicly."
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
    <main className="min-h-screen bg-[#f8fbff] pb-28 text-slate-900">
      <div className="mx-auto max-w-3xl px-4 pt-5">
        <div className="mb-5 flex items-center justify-between">
          <Link
            href="/feed"
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-[#082f63] shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Feed
          </Link>

          <div className="rounded-full bg-blue-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
            Share
          </div>
        </div>

        <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-[#0b63ce]">
              <Sparkles className="h-4 w-4" />
              Share with HTBF
            </div>

            <h1 className="mt-4 text-4xl font-black tracking-tight text-[#062a57]">
              Share your story.
            </h1>

            <p className="mt-3 text-base leading-7 text-slate-600">
              Share a testimony, praise report, prayer request, or video
              encouragement with the HTBF community.
            </p>
          </div>

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

            <p className="mt-3 text-sm leading-6 text-slate-500">
              Account details are managed from Profile. This page only submits
              your story, prayer request, praise report, or video.
            </p>
          </div>

          <form onSubmit={submitStory} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-black text-[#062a57]">
                What are you sharing?
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
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
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-[#062a57]">
                Video, optional
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
                      setVideoFile(event.target.files?.[0] ?? null)
                    }
                    className="hidden"
                  />
                </label>

                {videoFile && (
                  <div className="mt-3 flex items-center gap-2 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-[#082f63]">
                    <ImagePlus className="h-4 w-4" />
                    {videoFile.name}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[1.5rem] bg-amber-50 p-4 text-sm leading-6 text-amber-900 ring-1 ring-amber-100">
              <div className="font-black">Reviewed before posting</div>
              <p className="mt-1">
                Testimony posts, stories, and videos may be reviewed before
                appearing publicly.
              </p>
            </div>

            {message && (
              <div className="rounded-[1.5rem] bg-blue-50 p-4 text-sm font-bold leading-6 text-[#082f63] ring-1 ring-blue-100">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-6 py-4 text-base font-black text-white shadow-sm hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Submit to HTBF"}
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      </div>

      <LoggedInBottomNav />
    </main>
  );
}
