"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

type InboxMessage = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
};

export default function JourneyInboxPage() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMessages() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("inbox_messages")
        .select("id, title, body, read, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setMessages(data);
      }

      setLoading(false);
    }

    loadMessages();
  }, []);

  async function markAsRead(id: string) {
    await supabase
      .from("inbox_messages")
      .update({ read: true })
      .eq("id", id);

    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, read: true } : message
      )
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Journey Inbox</h1>
            <p className="mt-1 text-sm text-slate-300">
              Messages, updates, and encouragement from Hyper to Be Free.
            </p>
          </div>

          <Link
            href="/video-feed"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950"
          >
            Feed
          </Link>
        </div>

        {loading ? (
          <p className="text-slate-300">Loading messages...</p>
        ) : messages.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p>No messages yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <article
                key={message.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">{message.title}</h2>

                  {!message.read && (
                    <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-slate-950">
                      New
                    </span>
                  )}
                </div>

                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">
                  {message.body}
                </p>

                {!message.read && (
                  <button
                    onClick={() => markAsRead(message.id)}
                    className="mt-4 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950"
                  >
                    Mark as read
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
