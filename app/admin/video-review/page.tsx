"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  EyeOff,
  ShieldCheck,
  Video,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";

type Story = {
  id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  video_url: string | null;
  status: string | null;
  created_at: string | null;
};

export default function AdminVideoReviewPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [story, setStory] = useState<Story | null>(null);
  const [signedVideoUrl, setSignedVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    loadVideoReviewPage();
  }, []);

  function getVideoStoragePath(videoUrl: string | null) {
    if (!videoUrl) return null;

    if (videoUrl.includes("story-videos/")) {
      const afterBucket = videoUrl.split("story-videos/")[1];
      const pathOnly = afterBucket.split("?")[0];

      return decodeURIComponent(pathOnly);
    }

    if (videoUrl.startsWith("http")) {
      return null;
    }

    return videoUrl;
  }

  async function loadVideoReviewPage() {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: isAdmin, error: adminAccessError } = await supabase.rpc(
      "current_user_is_admin"
    );

    if (adminAccessError || isAdmin !== true) {
      if (adminAccessError) {
        console.error("Could not verify admin access:", adminAccessError);
      }

      window.location.replace("/feed");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const storyId = params.get("story");

    if (!storyId) {
      setMessage("No story ID was provided.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("stories")
      .select(
        "id, user_id, name, email, location, story_type, story_text, video_url, status, created_at"
      )
      .eq("id", storyId)
      .maybeSingle();

    if (error || !data) {
      setMessage(`Could not load story: ${error?.message ?? "Story not found"}`);
      setLoading(false);
      return;
    }

    const loadedStory = data as Story;
    setStory(loadedStory);

    if (!loadedStory.video_url) {
      setMessage("This story does not have a video.");
      setLoading(false);
      return;
    }

    const storagePath = getVideoStoragePath(loadedStory.video_url);

    if (!storagePath) {
      setSignedVideoUrl(loadedStory.video_url);
      setLoading(false);
      return;
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from("story-videos")
      .createSignedUrl(storagePath, 60 * 30);

    if (signedError || !signedData?.signedUrl) {
      setMessage(
        `Could not create video review link: ${
          signedError?.message ?? "Unknown error"
        }`
      );
      setLoading(false);
      return;
    }

    setSignedVideoUrl(signedData.signedUrl);
    setLoading(false);
  }

  async function createApprovalInboxMessage(approvedStory: Story) {
    if (!approvedStory.user_id) return;

    const { data: existingMessages, error: existingError } = await supabase
      .from("inbox_messages")
      .select("id")
      .eq("user_id", approvedStory.user_id)
      .eq("story_id", approvedStory.id)
      .eq("message_type", "story_approved")
      .limit(1);

    if (existingError) {
      console.error("Could not check approval inbox message:", existingError);
      return;
    }

    if (Array.isArray(existingMessages) && existingMessages.length > 0) return;

    const { error } = await supabase.from("inbox_messages").insert({
      user_id: approvedStory.user_id,
      title: "Your post was approved",
      body: "Your post has been approved and is now live on HTBF.",
      category: "approval",
      message_type: "story_approved",
      story_id: approvedStory.id,
      action_url: "/feed",
      read: false,
    });

    if (error) {
      console.error("Could not create approval inbox message:", error);
    }
  }

  async function updateStoryStatus(newStatus: string) {
    if (!story) return;

    setMessage("");

    const { error } = await supabase
      .from("stories")
      .update({ status: newStatus })
      .eq("id", story.id);

    if (error) {
      setMessage(`Could not update story: ${error.message}`);
      return;
    }

    if (newStatus === "approved") {
      await createApprovalInboxMessage(story);
    }

    setStory({
      ...story,
      status: newStatus,
    });

    setMessage(`Story marked as ${newStatus.replace("_", " ")}.`);
  }

  function formatDate(value: string | null) {
    if (!value) return "Date unavailable";

    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function statusLabel(status: string | null) {
    if (!status) return "pending";
    return status.replace("_", " ");
  }

  function statusStyle(status: string | null) {
    if (status === "approved") return "bg-green-50 text-green-700";
    if (status === "rejected") return "bg-red-50 text-red-700";
    if (status === "needs_review") return "bg-blue-50 text-blue-700";
    if (status === "removed") return "bg-slate-100 text-slate-700";
    if (status === "submitted") return "bg-amber-50 text-amber-700";

    return "bg-amber-50 text-amber-700";
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-5xl rounded-[2rem] bg-white p-8 shadow-sm">
          Loading video review...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] text-slate-900">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/admin"
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[#0b63ce] hover:text-[#084f9f]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admin
        </Link>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:rounded-[2.5rem] sm:p-8 md:p-10">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-[#0b63ce]">
            <ShieldCheck className="h-4 w-4" />
            Admin Video Review
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57] md:text-5xl">
            Review video.
          </h1>

          {message && (
            <div className="mt-6 rounded-2xl bg-blue-50 p-4 text-sm font-semibold leading-6 text-[#082f63]">
              {message}
            </div>
          )}

          {story && (
            <div className="mt-6 rounded-3xl bg-slate-50 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
                  {story.story_type || "Video Story"}
                </span>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${statusStyle(
                    story.status
                  )}`}
                >
                  {statusLabel(story.status)}
                </span>
              </div>

              <h2 className="mt-4 text-2xl font-black text-[#062a57]">
                {story.name || "Name not provided"}
              </h2>

              <div className="mt-2 text-sm leading-6 text-slate-500">
                <div>Submitted {formatDate(story.created_at)}</div>
                <div>Location: {story.location || "Not provided"}</div>
                <div>Email: {story.email || "Not provided"}</div>
              </div>

              {story.story_text && (
                <div className="mt-4 rounded-2xl bg-white p-5 leading-7 text-slate-700">
                  {story.story_text}
                </div>
              )}
            </div>
          )}

          <div className="mt-6 overflow-hidden rounded-[2rem] bg-black p-3 shadow-sm">
            {signedVideoUrl ? (
              <video
                src={signedVideoUrl}
                controls
                playsInline
                className="mx-auto max-h-[78dvh] w-full rounded-[1.5rem] bg-black object-contain"
              />
            ) : (
              <div className="flex min-h-[320px] items-center justify-center text-white/70">
                <div className="text-center">
                  <Video className="mx-auto mb-3 h-10 w-10" />
                  No playable video found.
                </div>
              </div>
            )}
          </div>

          {story && (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                onClick={() => updateStoryStatus("approved")}
                className="inline-flex items-center justify-center rounded-full bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-700"
              >
                Approve
              </button>

              <button
                onClick={() => updateStoryStatus("needs_review")}
                className="inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
              >
                Needs Review
              </button>

              <button
                onClick={() => updateStoryStatus("rejected")}
                className="inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700"
              >
                Reject
              </button>

              <button
                onClick={() => updateStoryStatus("removed")}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-700 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800"
              >
                <EyeOff className="h-4 w-4" />
                Remove from Feed
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
