"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Globe2,
  Inbox,
  MessageCircleHeart,
  Play,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import LoggedInBottomNav from "../../components/LoggedInBottomNav";

type StorySummary = {
  id: string;
  name: string | null;
  location: string | null;
  story_text: string | null;
  story_type: string | null;
  video_url: string | null;
};

type RawVideoReplyRow = {
  id: string;
  story_id: string | null;
  user_id: string | null;
  recipient_user_id: string | null;
  message: string | null;
  created_at: string | null;
  stories: StorySummary | StorySummary[] | null;
};

type VideoReplyRow = {
  id: string;
  story_id: string | null;
  user_id: string | null;
  recipient_user_id: string | null;
  message: string | null;
  created_at: string | null;
  story: StorySummary | null;
};

export default function JourneyPage() {
  const [checkingUser, setCheckingUser] = useState(true);
  const [responses, setResponses] = useState<VideoReplyRow[]>([]);
  const [message, setMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    loadResponses();
  }, []);

  async function loadResponses() {
    setCheckingUser(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setCurrentUserId(user.id);

    const { data, error } = await supabase
      .from("story_video_replies")
      .select(
        `
        id,
        story_id,
        user_id,
        recipient_user_id,
        message,
        created_at,
        stories (
          id,
          name,
          location,
          story_text,
          story_type,
          video_url
        )
      `
      )
      .eq("recipient_user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(`Could not load video responses: ${error.message}`);
      setCheckingUser(false);
      return;
    }

    const normalizedResponses: VideoReplyRow[] = (
      (data ?? []) as RawVideoReplyRow[]
    ).map((item) => {
      const story = Array.isArray(item.stories)
        ? item.stories[0] ?? null
        : item.stories ?? null;

      return {
        id: item.id,
        story_id: item.story_id,
        user_id: item.user_id,
        recipient_user_id: item.recipient_user_id,
        message: item.message,
        created_at: item.created_at,
        story,
      };
    });

    setResponses(normalizedResponses);
    setCheckingUser(false);
  }

  function formatDate(value: string | null) {
    if (!value) return "";

    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (checkingUser) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-8 shadow-sm ring-1 ring-slate-200">
          Loading Journey...
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
            Journey
          </div>
        </div>

        <section className="mb-6 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
                <Inbox className="h-6 w-6" />
              </div>

              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                  Journey Inbox
                </div>

                <h1 className="text-3xl font-black text-[#062a57]">
                  Video Responses
                </h1>

                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Encouragement people sent in response to your videos.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={loadResponses}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-[#0b63ce]"
              aria-label="Refresh responses"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {message && (
            <div className="mb-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
              {message}
            </div>
          )}

          <div className="mb-4 rounded-2xl bg-slate-50 p-4 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
            Logged in as: {currentUserId}
          </div>

          {responses.length === 0 ? (
            <div className="rounded-[1.5rem] bg-slate-50 p-6 text-sm leading-6 text-slate-600 ring-1 ring-slate-200">
              No video responses are showing for this account yet. If you saw
              them in Supabase, make sure the response{" "}
              <span className="font-black">recipient_user_id</span> matches the
              logged-in user shown above.
            </div>
          ) : (
            <div className="space-y-4">
              {responses.map((item) => {
                const story = item.story;

                return (
                  <article
                    key={item.id}
                    className="rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-200"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                          <MessageCircleHeart className="h-4 w-4" />
                          New response
                        </div>

                        <div className="mt-1 text-sm font-semibold text-slate-500">
                          {formatDate(item.created_at)}
                        </div>
                      </div>

                      {story?.id && (
                        <Link
                          href={`/video-feed?story=${story.id}&from=journey`}
                          className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-black text-[#082f63] shadow-sm ring-1 ring-slate-200 hover:bg-blue-50"
                        >
                          <Play className="h-3.5 w-3.5 fill-[#082f63]" />
                          View Video
                        </Link>
                      )}
                    </div>

                    <div className="rounded-[1.25rem] bg-white p-4 text-base leading-7 text-slate-800 ring-1 ring-slate-200">
                      “{item.message}”
                    </div>

                    {story && (
                      <div className="mt-4 rounded-[1.25rem] bg-white p-4 ring-1 ring-slate-200">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[#0b63ce]">
                            <Sparkles className="h-3.5 w-3.5" />
                            {story.story_type || "Video Testimony"}
                          </span>

                          {story.location && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">
                              <Globe2 className="h-3.5 w-3.5" />
                              {story.location}
                            </span>
                          )}
                        </div>

                        {story.story_text && (
                          <p className="line-clamp-3 text-sm leading-6 text-slate-600">
                            {story.story_text}
                          </p>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <LoggedInBottomNav />
    </main>
  );
}
