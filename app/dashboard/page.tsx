"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, LogOut, Send, UserCircle, FileText } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

type Story = {
  id: string;
  story_type: string | null;
  story_text: string | null;
  status: string | null;
  created_at: string | null;
};

export default function DashboardPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setEmail(user.email ?? null);

      const { data, error } = await supabase
        .from("stories")
        .select("id, story_type, story_text, status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setStories(data);
      }

      setLoading(false);
    }

    loadDashboard();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
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

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-4xl rounded-[2rem] bg-white p-8 shadow-sm">
          Loading your dashboard...
        </div>
      </main>
    );
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
            <UserCircle className="h-4 w-4" />
            My Account
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57] md:text-5xl">
            Welcome to your Hyper to Be Free dashboard.
          </h1>

          <p className="mt-4 leading-7 text-slate-600">
            Signed in as{" "}
            <span className="font-bold text-[#0b63ce]">{email}</span>
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <h2 className="text-2xl font-black text-[#062a57]">
                Share a story
              </h2>
              <p className="mt-3 leading-7 text-slate-600">
                Submit a testimony, praise report, prayer encouragement, or
                video story for review.
              </p>

              <Link
                href="/share-your-story"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#0b63ce] px-6 py-3.5 text-base font-bold text-white shadow-sm hover:bg-[#084f9f]"
              >
                Share Your Story <Send className="h-4 w-4" />
              </Link>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <h2 className="text-2xl font-black text-[#062a57]">
                Submission status
              </h2>
              <p className="mt-3 leading-7 text-slate-600">
                Stories are saved as pending until they are reviewed.
              </p>

              <div className="mt-6 rounded-2xl bg-white p-4 text-sm font-semibold text-slate-500">
                {stories.length} submission{stories.length === 1 ? "" : "s"} found.
              </div>
            </div>
          </div>

          <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#0b63ce]" />
              <h2 className="text-2xl font-black text-[#062a57]">
                My submissions
              </h2>
            </div>

            {stories.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-5 text-slate-600">
                No submissions yet.
              </div>
            ) : (
              <div className="grid gap-4">
                {stories.map((story) => (
                  <div
                    key={story.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-bold uppercase tracking-[0.16em] text-[#0b63ce]">
                          {story.story_type || "Story"}
                        </div>
                        <p className="mt-2 line-clamp-3 leading-7 text-slate-700">
                          {story.story_text || "No story text available."}
                        </p>
                        <div className="mt-3 text-sm text-slate-500">
                          Submitted {formatDate(story.created_at)}
                        </div>
                      </div>

                      <span className="w-fit rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-amber-700">
                        {statusLabel(story.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={signOut}
            className="mt-10 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3.5 text-base font-bold text-[#082f63] shadow-sm hover:bg-slate-50"
          >
            Sign Out <LogOut className="h-4 w-4" />
          </button>
        </div>
      </section>
    </main>
  );
}
