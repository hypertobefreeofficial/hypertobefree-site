"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";

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
  const [messageToClear, setMessageToClear] = useState<InboxMessage | null>(
    null
  );
  const [clearingMessage, setClearingMessage] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

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

  function openClearMessageModal(message: InboxMessage) {
    setStatusMessage("");
    setMessageToClear(message);
  }

  function closeClearMessageModal() {
    setMessageToClear(null);
  }

  async function confirmClearMessage() {
    if (!messageToClear) return;

    setClearingMessage(true);
    setStatusMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setClearingMessage(false);
      setMessageToClear(null);
      setStatusMessage("Please sign in to clear messages.");
      return;
    }

    const { error } = await supabase
      .from("inbox_messages")
      .delete()
      .eq("id", messageToClear.id)
      .eq("user_id", user.id);

    setClearingMessage(false);

    if (error) {
      setStatusMessage(`Could not clear message: ${error.message}`);
      return;
    }

    setMessages((current) =>
      current.filter((message) => message.id !== messageToClear.id)
    );
    setMessageToClear(null);
    setStatusMessage("Message cleared from your Journey inbox.");
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

        {statusMessage && (
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/10 p-4 text-sm font-semibold text-slate-100">
            {statusMessage}
          </div>
        )}

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

                <div className="mt-4 flex flex-wrap gap-2">
                  {!message.read && (
                    <button
                      type="button"
                      onClick={() => markAsRead(message.id)}
                      className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950"
                    >
                      Mark as read
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openClearMessageModal(message)}
                    className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
                  >
                    Clear
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {messageToClear && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 text-slate-950 shadow-2xl">
            <div className="mb-5">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                HYPER TO BE FREE
              </div>

              <h2 className="mt-1 text-xl font-black text-[#062a57]">
                Clear this message?
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                This will remove the message from your Journey inbox on your
                side only.
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeClearMessageModal}
                disabled={clearingMessage}
                className="rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Not Yet
              </button>

              <button
                type="button"
                onClick={confirmClearMessage}
                disabled={clearingMessage}
                className="rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {clearingMessage ? "Clearing..." : "Clear Message"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
