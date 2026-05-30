"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  MapPin,
  Send,
  ShieldCheck,
  Sparkles,
  UserCircle,
  Video,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

type ProfileRow = {
  id: string;
  real_name: string | null;
  display_name: string | null;
  username: string | null;
  location: string | null;
  show_location: boolean | null;
  show_real_name: boolean | null;
  profile_completed: boolean | null;
};

export default function ShareYourStoryPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const [storyType, setStoryType] = useState("Testimony");
  const [storyText, setStoryText] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);

  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      setMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, real_name, display_name, username, location, show_location, show_real_name, profile_completed"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        setMessage(`Could not load your profile: ${error.message}`);
        setLoading(false);
        return;
      }

      const loadedProfile = data as ProfileRow | null;

      if (
        !loadedProfile ||
        !loadedProfile.profile_completed ||
        !loadedProfile.display_name ||
        !loadedProfile.username
      ) {
        window.location.href = "/account";
        return;
      }

      setProfile(loadedProfile);
      setLoading(false);
    }

    loadProfile();
  }, []);

  function getPostingName() {
    if (!profile) return "HTBF Community";

    if (profile.show_real_name && profile.real_name) {
      return profile.real_name;
    }

    return profile.display_name || "HTBF Community";
  }

  function getPostingLocation() {
    if (!profile) return null;

    if (profile.show_location === false) {
      return null;
    }

    return profile.location || null;
  }

  async function uploadVideoIfNeeded() {
    if (!videoFile || !userId) return null;

    const fileExtension = videoFile.name.split(".").pop() || "mp4";
    const filePath = `${userId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${fileExtension}`;

    const { error } = await supabase.storage
      .from("story-videos")
      .upload(filePath, videoFile, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      throw new Error(`Could not upload video: ${error.message}`);
    }

    return filePath;
  }

  async function submitStory() {
    setMessage("");

    if (!userId) {
      setMessage("Please sign in again.");
      return;
    }

    if (!profile) {
      setMessage("Please finish your account profile before sharing.");
      return;
    }

    const cleanStoryText = storyText.trim();

    if (!cleanStoryText && !videoFile) {
      setMessage("Please add a story, prayer request, praise report, or video.");
      return;
    }

    setSubmitting(true);

    try {
      const videoPath = await uploadVideoIfNeeded();

      const postingName = getPostingName();
      const postingLocation = getPostingLocation();

      const { error } = await supabase.from("stories").insert({
        user_id: userId,
        name: postingName,
        location: postingLocation,
        story_type: storyType,
        story_text: cleanStoryText || null,
        video_url: videoPath,
        status: "pending",
      });

      if (error) {
        setMessage(`Could not submit story: ${error.message}`);
        setSubmitting(false);
        return;
      }

      setStoryText("");
      setVideoFile(null);
      setMessage(
        "Your story was submitted. It will appear after review and approval."
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Something went wrong.";
      setMessage(errorMessage);
    }

    setSubmitting(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          Loading story form...
        </div>
      </main>
    );
  }

  const postingName = getPostingName();
  const postingLocation = getPostingLocation();

  return (
    <main className="min-h-screen bg-[#f8fbff] pb-24 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link
            href="/feed"
            className="inline-flex items-center gap-2 text-sm font-black text-[#082f63]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Feed
          </Link>

          <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
            Share
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-[#0b63ce]">
            <Sparkles className="h-4 w-4" />
            Share Your Story
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57]">
            What has God done?
          </h1>

          <p className="mt-3 leading-7 text-slate-600">
            Share a testimony, praise report, prayer request, answered prayer,
            or video testimony with the HTBF community.
          </p>

          {message && (
            <div
              className={`mt-5 rounded-2xl p-4 text-sm font-bold ${
                message.includes("submitted")
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {message}
            </div>
          )}
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
              <UserCircle className="h-6 w-6" />
            </div>

            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                Posting As
              </div>
              <h2 className="text-2xl font-black text-[#062a57]">
                {postingName}
              </h2>
            </div>
          </div>

          <div className="rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-100">
            <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-600">
              <span>@{profile?.username}</span>

              {postingLocation && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {postingLocation}
                  </span>
                </>
              )}
            </div>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              Your name, username, and location come from Account Settings. To
              change them, update your profile.
            </p>

            <Link
              href="/account"
              className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-black text-[#0b63ce] ring-1 ring-slate-200 hover:bg-blue-50"
            >
              Edit Account Settings
            </Link>
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="space-y-5">
            <label className="block">
              <div className="mb-2 text-sm font-black text-[#062a57]">
                What are you sharing?
              </div>

              <select
                value={storyType}
                onChange={(event) => setStoryType(event.target.value)}
                className="input-style"
              >
                <option value="Testimony">Testimony</option>
                <option value="Praise Report">Praise Report</option>
                <option value="Prayer Encouragement">Prayer Request</option>
                <option value="Answered Prayer">Answered Prayer</option>
                <option value="Video Testimony">Video Testimony</option>
              </select>
            </label>

            <label className="block">
              <div className="mb-2 text-sm font-black text-[#062a57]">
                Your story
              </div>

              <textarea
                value={storyText}
                onChange={(event) => setStoryText(event.target.value)}
                placeholder="Share your testimony, prayer request, praise report, or what God has done..."
                className="min-h-44 input-style"
              />
            </label>

            <label className="block">
              <div className="mb-2 flex items-center gap-2 text-sm font-black text-[#062a57]">
                <Video className="h-4 w-4" />
                Optional video
              </div>

              <input
                type="file"
                accept="video/*"
                onChange={(event) =>
                  setVideoFile(event.target.files?.[0] ?? null)
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
              />

              {videoFile && (
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  Selected: {videoFile.name}
                </p>
              )}
            </label>

            <div className="rounded-[1.5rem] bg-blue-50 p-4 text-sm leading-6 text-[#082f63] ring-1 ring-blue-100">
              <div className="mb-1 flex items-center gap-2 font-black">
                <ShieldCheck className="h-4 w-4" />
                Review notice
              </div>
              Posts may be reviewed before appearing publicly. Videos and prayer
              requests may take longer to approve.
            </div>

            <button
              onClick={submitStory}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-6 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {submitting ? "Submitting..." : "Submit Story"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
