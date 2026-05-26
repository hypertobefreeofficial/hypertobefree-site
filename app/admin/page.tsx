"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ShieldCheck,
  UserCircle,
  FileText,
  Lock,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

const ADMIN_EMAIL = "hypertobefree@gmail.com";

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

export default function AdminPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [notAllowed, setNotAllowed] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadAdminPage();
  }, []);

  async function loadAdminPage() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setEmail(user.email ?? null);

    if (user.email !== ADMIN_EMAIL) {
      setNotAllowed(true);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("stories")
      .select(
        "id, user_id, name, email, location, story_type, story_text, video_url, status, created_at"
      )
      .order("created_at", { ascending: false });

    if (!error && data) {
      setStories(data);
    }

    if (error) {
      setMessage(`Could not load stories: ${error.message}`);
    }

    setLoading(false);
  }

  async function updateStoryStatus(storyId: string, newStatus: string) {
    setMessage("");

    const { error } = await supabase
      .from("stories")
      .update({ status: newStatus })
      .eq("id", storyId);

    if (error) {
      setMessage(`Could not update story: ${error.message}`);
      return;
    }

    setStories((currentStories) =>
      currentStories.map((story) =>
        story.id === storyId ? { ...story, status: newStatus } : story
      )
    );

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
    if (status === "approved") {
      return "bg-green-50 text-green-700";
    }

    if (status === "rejected") {
      return "bg-red-50 text-red-700";
    }

    if (status === "needs_review") {
      return "bg-blue-50 text-blue-700";
    }

    return "bg-amber-50 text-amber-700";
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-5xl rounded-[2rem] bg-white p-8 shadow-sm">
          Loading admin review page...
        </div>
      </main>
    );
  }

  if (notAllowed) {
    return (
      <main className="min-h-screen bg-[#f8fbff] text-slate-900">
        <section className="mx-auto max-w-3xl px-6 py-12">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[#0b63ce] hover:text-[#084f9f]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <Lock className="h-6 w-6" />
            </div>

            <h1 className="text-3xl font-black text-[#062a57]">
              Admin access only
            </h1>

            <p className="mt-4 leading-7 text-slate-600">
              You are signed in as{" "}
              <span className="font-bold text-[#0b63ce]">{email}</span>, but
              this page is only available to the Hyper to Be Free admin account.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] text-slate-900">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/dashboard"
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[#0b63ce] hover:text-[#084f9f]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:rounded-[2.5rem] sm:p-8 md:p-12">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-[#0b63ce]">
            <ShieldCheck className="h-4 w-4" />
            Admin Review
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57] md:text-5xl">
            Review submitted stories.
          </h1>

          <p className="mt-4 leading-7 text-slate-600">
            Signed in as{" "}
            <span className="font-bold text-[#0b63ce]">{email}</span>
          </p>

          {message && (
            <div className="mt-6 rounded-2xl bg-blue-50 p-4 text-sm font-semibold leading-6 text-[#082f63]">
              {message}
            </div>
          )}

          <div className="mt-8 rounded-3xl bg-blue-50 p-5">
            <div className="flex items-center gap-2 font-black text-[#062a57]">
              <FileText className="h-5 w-5 text-[#0b63ce]" />
              Submission count
            </div>
            <p className="mt-2 text-slate-600">
              {stories.length} total submission
              {stories.length === 1 ? "" : "s"} found.
            </p>
          </div>

          <div className="mt-10 grid gap-5">
            {stories.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-5 text-slate-600">
                No submitted stories yet.
              </div>
            ) : (
              stories.map((story) => (
                <article
                  key={story.id}
                  className="rounded-3xl border border-slate-200 bg-slate-50 p-5"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
                          {story.story_type || "Story"}
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

                      <div className="mt-2 flex flex-col gap-1 text-sm text-slate-500">
                        <div>
                          Email:{" "}
                          <span className="font-semibold">
                            {story.email || "Not provided"}
                          </span>
                        </div>
                        <div>
                          Location:{" "}
                          <span className="font-semibold">
                            {story.location || "Not provided"}
                          </span>
                        </div>
                        <div>Submitted {formatDate(story.created_at)}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                      <UserCircle className="h-4 w-4" />
                      User story
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl bg-white p-5 leading-7 text-slate-700">
                    {story.story_text || "No story text available."}
                  </div>

                  {story.video_url && (
                    <div className="mt-4 rounded-2xl bg-white p-4 text-sm text-slate-600">
                      Video: {story.video_url}
                    </div>
                  )}

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <button
                      onClick={() => updateStoryStatus(story.id, "approved")}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-700"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Approve
                    </button>

                    <button
                      onClick={() =>
                        updateStoryStatus(story.id, "needs_review")
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
                    >
                      <AlertCircle className="h-4 w-4" />
                      Needs Review
                    </button>

                    <button
                      onClick={() => updateStoryStatus(story.id, "rejected")}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
