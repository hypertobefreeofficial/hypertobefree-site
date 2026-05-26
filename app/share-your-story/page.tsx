"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Send,
  ShieldCheck,
  Video,
  Upload,
  FileText,
  Mail,
  UserCircle,
  LogIn,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

export default function ShareYourStoryPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [checkingUser, setCheckingUser] = useState(true);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [storyType, setStoryType] = useState("Testimony");
  const [storyText, setStoryText] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [understandsReview, setUnderstandsReview] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setEmail(user?.email ?? null);
      setUserId(user?.id ?? null);
      setCheckingUser(false);
    }

    loadUser();
  }, []);

  function getFileExtension(fileName: string) {
    const parts = fileName.split(".");
    return parts.length > 1 ? parts.pop() : "mp4";
  }

  async function uploadVideoIfSelected() {
    if (!videoFile || !userId) {
      return null;
    }

    const fileExtension = getFileExtension(videoFile.name);
    const safeFileName = `${Date.now()}-${crypto.randomUUID()}.${fileExtension}`;
    const filePath = `${userId}/${safeFileName}`;

    const { error } = await supabase.storage
      .from("story-videos")
      .upload(filePath, videoFile, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      throw new Error(error.message);
    }

    return filePath;
  }

  async function submitStory() {
    setMessage("");

    if (!userId || !email) {
      setMessage("Please sign in before submitting your story.");
      return;
    }

    if (!name.trim()) {
      setMessage("Please enter your name or first name.");
      return;
    }

    if (!storyText.trim()) {
      setMessage("Please write your story before submitting.");
      return;
    }

    if (!hasPermission || !understandsReview) {
      setMessage("Please check both permission boxes before submitting.");
      return;
    }

    if (videoFile && videoFile.size > 100 * 1024 * 1024) {
      setMessage("Please upload a video smaller than 100 MB.");
      return;
    }

    setSubmitting(true);

    try {
      const videoPath = await uploadVideoIfSelected();

      const { error } = await supabase.from("stories").insert({
        user_id: userId,
        name: name.trim(),
        email,
        location: location.trim() || null,
        story_type: storyType,
        story_text: storyText.trim(),
        video_url: videoPath,
        status: "pending",
      });

      if (error) {
        throw new Error(error.message);
      }

      setMessage(
        videoPath
          ? "Your story and video were submitted successfully. They are now pending review."
          : "Your story was submitted successfully. It is now pending review."
      );

      setName("");
      setLocation("");
      setStoryType("Testimony");
      setStoryText("");
      setGuestEmail("");
      setVideoFile(null);
      setHasPermission(false);
      setUnderstandsReview(false);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Something went wrong.";
      setMessage(`Something went wrong: ${errorMessage}`);
    }

    setSubmitting(false);
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] text-slate-900">
      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[#0b63ce] hover:text-[#084f9f]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:rounded-[2.5rem] sm:p-8 md:p-12">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-[#0b63ce]">
            <Send className="h-4 w-4" />
            Share Your Story
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57] sm:text-5xl md:text-6xl">
            Tell us what God has done in your life.
          </h1>

          <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg">
            Share a testimony, praise report, prayer encouragement, or story of
            freedom. You can write your story and include a video for review.
          </p>

          {!checkingUser && email && (
            <div className="mt-6 flex items-center gap-3 rounded-3xl bg-green-50 p-4 text-sm leading-6 text-green-900">
              <UserCircle className="h-5 w-5 shrink-0" />
              <div>
                <span className="font-black">Signed in as:</span> {email}
              </div>
            </div>
          )}

          {!checkingUser && !email && (
            <div className="mt-6 rounded-3xl border border-blue-100 bg-blue-50 p-5 text-sm leading-6 text-[#082f63]">
              <div className="mb-2 flex items-center gap-2 font-black">
                <LogIn className="h-5 w-5" />
                Sign in first
              </div>
              <p>
                Create an account or sign in before submitting so your story can
                be connected to your profile.
              </p>
              <Link
                href="/login"
                className="mt-4 inline-flex rounded-full bg-[#0b63ce] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#084f9f]"
              >
                Sign In or Create Account
              </Link>
            </div>
          )}

          <div className="mt-8 grid gap-4 rounded-3xl bg-blue-50 p-5 sm:grid-cols-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#0b63ce] shadow-sm">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <div className="font-black text-[#062a57]">Write it</div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Share your story in your own words.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#0b63ce] shadow-sm">
                <Video className="h-5 w-5" />
              </div>
              <div>
                <div className="font-black text-[#062a57]">Add video</div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Upload a short testimony video.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#0b63ce] shadow-sm">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="font-black text-[#062a57]">Reviewed first</div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Stories and videos are reviewed before posting.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 grid gap-6">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Name or first name
              </label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-[#0b63ce] focus:bg-white"
                placeholder="Example: Ashley"
              />
            </div>

            {!email && (
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Email
                </label>
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(event) => setGuestEmail(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-[#0b63ce] focus:bg-white"
                  placeholder="you@example.com"
                />
              </div>
            )}

            {email && (
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Email
                </label>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600">
                  {email}
                </div>
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Location, optional
              </label>
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-[#0b63ce] focus:bg-white"
                placeholder="City, State or Country"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Story type
              </label>
              <select
                value={storyType}
                onChange={(event) => setStoryType(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-[#0b63ce] focus:bg-white"
              >
                <option>Testimony</option>
                <option>Praise Report</option>
                <option>Prayer Encouragement</option>
                <option>Freedom Story</option>
                <option>Answered Prayer</option>
                <option>Video Testimony</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Your story
              </label>
              <textarea
                rows={8}
                value={storyText}
                onChange={(event) => setStoryText(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-[#0b63ce] focus:bg-white"
                placeholder="Share what God has done..."
              />
            </div>

            <div>
              <label className="mb-3 block text-sm font-bold text-slate-700">
                Upload video, optional
              </label>

              <div className="rounded-[2rem] border-2 border-dashed border-blue-200 bg-blue-50/60 p-5 sm:p-8">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-[#0b63ce] shadow-sm">
                    <Upload className="h-8 w-8" />
                  </div>

                  <h2 className="text-xl font-black text-[#062a57]">
                    Add a testimony video
                  </h2>

                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                    Upload a short video sharing your testimony, praise report,
                    or story of freedom. Videos are private during review.
                  </p>

                  <input
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    onChange={(event) =>
                      setVideoFile(event.target.files?.[0] ?? null)
                    }
                    className="mt-5 w-full max-w-md rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm file:mr-4 file:rounded-full file:border-0 file:bg-[#0b63ce] file:px-4 file:py-2 file:text-sm file:font-bold file:text-white"
                  />

                  {videoFile && (
                    <p className="mt-3 text-sm font-semibold text-[#082f63]">
                      Selected video: {videoFile.name}
                    </p>
                  )}

                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    Maximum file size: 100 MB. Accepted formats: MP4, MOV, WEBM.
                  </p>
                </div>
              </div>
            </div>

            <label className="flex gap-3 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              <input
                type="checkbox"
                className="mt-1"
                checked={hasPermission}
                onChange={(event) => setHasPermission(event.target.checked)}
              />
              <span>
                I confirm that I own or have permission to share this story,
                photo, or video, and I give Hyper to Be Free permission to
                review it for possible sharing on the website.
              </span>
            </label>

            <label className="flex gap-3 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              <input
                type="checkbox"
                className="mt-1"
                checked={understandsReview}
                onChange={(event) =>
                  setUnderstandsReview(event.target.checked)
                }
              />
              <span>
                I understand that submitted stories and videos may be reviewed
                before anything is posted publicly.
              </span>
            </label>

            {message && (
              <div className="rounded-2xl bg-blue-50 p-4 text-sm font-semibold leading-6 text-[#082f63]">
                {message}
              </div>
            )}

            <div className="rounded-2xl bg-blue-50 p-4 text-sm leading-6 text-[#082f63]">
              <div className="mb-1 flex items-center gap-2 font-black">
                <ShieldCheck className="h-4 w-4" />
                Review before posting
              </div>
              Stories and videos submitted here are saved as pending review.
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
              <div className="mb-1 flex items-center gap-2 font-black text-[#062a57]">
                <Mail className="h-4 w-4 text-[#0b63ce]" />
                Questions?
              </div>
              You can contact the Hyper to Be Free team at{" "}
              <span className="font-bold text-[#0b63ce]">
                info@hypertobefree.com
              </span>
              .
            </div>

            <button
              onClick={submitStory}
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-6 py-4 text-base font-bold text-white shadow-sm hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit"
            >
              {submitting
                ? videoFile
                  ? "Uploading video..."
                  : "Submitting..."
                : "Submit Story"}
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
