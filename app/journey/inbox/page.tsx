"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";

type InboxMessage = {
  id: string;
  sender_user_id?: string | null;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  category?: string | null;
  message_type?: string | null;
  type?: string | null;
  story_id?: string | null;
  prayer_request_id?: string | null;
  video_url?: string | null;
  image_url?: string | null;
  action_url?: string | null;
  hidden_at?: string | null;
};

type InboxMessageKind =
  | "encouragement"
  | "prayer_video_reply"
  | "scripture_share"
  | "testimony_response"
  | "team"
  | "milestone"
  | "approval";

type InboxFilter =
  | "all"
  | "unread"
  | "prayer"
  | "approvals"
  | "milestones"
  | "team";

type ClearMessageRequest =
  | { mode: "single"; messages: InboxMessage[] }
  | { mode: "all"; messages: InboxMessage[] };

const BASE_SELECT = "id, title, body, read, created_at";
const MESSAGE_SELECT = `${BASE_SELECT}, sender_user_id, message_type, story_id, prayer_request_id, video_url, image_url, action_url, hidden_at`;

const INBOX_CARD_STYLES: Record<
  InboxMessageKind,
  {
    label: string;
    eyebrow: string;
    ring: string;
    badge: string;
    panel: string;
  }
> = {
  encouragement: {
    label: "Encouragement",
    eyebrow: "Someone encouraged you",
    ring: "ring-emerald-200",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    panel: "bg-emerald-50 text-emerald-950 ring-emerald-100",
  },
  prayer_video_reply: {
    label: "Prayer Video Reply",
    eyebrow: "Prayer response",
    ring: "ring-blue-200",
    badge: "bg-blue-50 text-[#0b63ce] ring-blue-100",
    panel: "bg-blue-50 text-[#082f63] ring-blue-100",
  },
  scripture_share: {
    label: "Scripture Share",
    eyebrow: "Scripture for your journey",
    ring: "ring-indigo-200",
    badge: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    panel: "bg-indigo-50 text-indigo-950 ring-indigo-100",
  },
  testimony_response: {
    label: "Testimony Response",
    eyebrow: "Response to your story",
    ring: "ring-sky-200",
    badge: "bg-sky-50 text-sky-700 ring-sky-100",
    panel: "bg-sky-50 text-sky-950 ring-sky-100",
  },
  team: {
    label: "HTBF Team",
    eyebrow: "HTBF update",
    ring: "ring-slate-200",
    badge: "bg-slate-100 text-slate-700 ring-slate-200",
    panel: "bg-slate-50 text-slate-700 ring-slate-200",
  },
  milestone: {
    label: "Milestone",
    eyebrow: "Journey milestone",
    ring: "ring-amber-200",
    badge: "bg-amber-50 text-amber-800 ring-amber-100",
    panel: "bg-amber-50 text-amber-950 ring-amber-100",
  },
  approval: {
    label: "Approval",
    eyebrow: "Story review update",
    ring: "ring-cyan-200",
    badge: "bg-cyan-50 text-cyan-700 ring-cyan-100",
    panel: "bg-cyan-50 text-cyan-950 ring-cyan-100",
  },
};

const FILTERS: { id: InboxFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "prayer", label: "Prayer Updates" },
  { id: "approvals", label: "Approvals" },
  { id: "milestones", label: "Milestones" },
  { id: "team", label: "HTBF Team" },
];

export default function JourneyInboxPage() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [activeFilter, setActiveFilter] = useState<InboxFilter>("all");
  const [loading, setLoading] = useState(true);
  const [clearMessageRequest, setClearMessageRequest] =
    useState<ClearMessageRequest | null>(null);
  const [clearingMessage, setClearingMessage] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function loadMessages() {
      setLoading(true);
      setStatusMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        setStatusMessage("Please sign in to view your Journey Inbox.");
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from("inbox_messages")
        .select(MESSAGE_SELECT)
        .eq("user_id", user.id)
        .is("hidden_at", null)
        .order("created_at", { ascending: false });

      if (!error && data) {
        const rawMessages: unknown[] = Array.isArray(data) ? data : [];

        const nextMessages: InboxMessage[] = rawMessages.filter(
          (message): message is InboxMessage =>
            typeof message === "object" &&
            message !== null &&
            "id" in message &&
            "title" in message &&
            "body" in message &&
            "read" in message &&
            "created_at" in message
        );

        setMessages(nextMessages);
      } else if (error) {
        setStatusMessage(`Could not load your Journey Inbox: ${error.message}`);
      }

      setLoading(false);
    }

    loadMessages();
  }, []);

  const filteredMessages = useMemo(() => {
    return messages.filter((message) => {
      if (activeFilter === "all") return true;
      if (activeFilter === "unread") return !message.read;

      const category = getMessageCategoryKey(message);
      return category === activeFilter;
    });
  }, [activeFilter, messages]);

  const unreadCount = useMemo(
    () => messages.filter((message) => !message.read).length,
    [messages]
  );

  const visibleUnreadIds = filteredMessages
    .filter((message) => !message.read)
    .map((message) => message.id);

  async function markAsRead(id: string) {
    if (!userId) {
      setStatusMessage("Please sign in to update messages.");
      return;
    }

    setStatusMessage("");

    const { error } = await supabase
      .from("inbox_messages")
      .update({ read: true })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      setStatusMessage(`Could not mark message as read: ${error.message}`);
      return;
    }

    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, read: true } : message
      )
    );
  }

  async function markVisibleAsRead() {
    if (!userId) {
      setStatusMessage("Please sign in to update messages.");
      return;
    }

    if (visibleUnreadIds.length === 0) return;

    setMarkingAllRead(true);
    setStatusMessage("");

    const { error } = await supabase
      .from("inbox_messages")
      .update({ read: true })
      .eq("user_id", userId)
      .in("id", visibleUnreadIds);

    setMarkingAllRead(false);

    if (error) {
      setStatusMessage(`Could not mark messages as read: ${error.message}`);
      return;
    }

    setMessages((current) =>
      current.map((message) =>
        visibleUnreadIds.includes(message.id)
          ? { ...message, read: true }
          : message
      )
    );
  }

  function openClearMessageModal(message: InboxMessage) {
    setStatusMessage("");
    setClearMessageRequest({ mode: "single", messages: [message] });
  }

  function openClearAllMessagesModal() {
    if (filteredMessages.length === 0) return;

    setStatusMessage("");
    setClearMessageRequest({ mode: "all", messages: filteredMessages });
  }

  function closeClearMessageModal() {
    setClearMessageRequest(null);
  }

  async function confirmClearMessage() {
    if (!clearMessageRequest) return;

    const messageIds = clearMessageRequest.messages.map((message) => message.id);

    if (messageIds.length === 0) {
      setClearMessageRequest(null);
      return;
    }

    setClearingMessage(true);
    setStatusMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setClearingMessage(false);
      setClearMessageRequest(null);
      setStatusMessage("Please sign in to clear messages.");
      return;
    }

    const hiddenAt = new Date().toISOString();

    const { error } = await supabase
      .from("inbox_messages")
      .update({ hidden_at: hiddenAt })
      .eq("user_id", user.id)
      .in("id", messageIds);

    setClearingMessage(false);

    if (error) {
      setStatusMessage(`Could not clear message: ${error.message}`);
      return;
    }

    setMessages((current) =>
      current.filter((message) => !messageIds.includes(message.id))
    );
    setClearMessageRequest(null);
    setStatusMessage(
      clearMessageRequest.mode === "all"
        ? "Messages cleared from your Journey Inbox."
        : "Message cleared from your Journey Inbox."
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/journey"
          className="mb-5 inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-black text-[#0b63ce] shadow-sm ring-1 ring-blue-100 hover:bg-blue-50"
        >
          Back to Journey
        </Link>

        <header className="mb-6 rounded-[2rem] bg-gradient-to-br from-[#082f63] to-[#0b63ce] p-6 text-white shadow-sm">
          <div className="text-sm font-black uppercase tracking-[0.22em] text-blue-100">
            HYPER TO BE FREE
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            Journey Inbox
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100 sm:text-base">
            Messages, updates, and milestones from your HTBF journey.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <MiniInboxStat label="Messages" value={messages.length} />
            <MiniInboxStat label="Unread" value={unreadCount} />
          </div>
        </header>

        {statusMessage && (
          <div className="mb-4 rounded-[1.5rem] bg-white p-4 text-sm font-bold text-[#062a57] shadow-sm ring-1 ring-blue-100">
            {statusMessage}
          </div>
        )}

        <section className="mb-5 rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setActiveFilter(filter.id)}
                className={`rounded-full px-4 py-2 text-sm font-black transition ${
                  activeFilter === filter.id
                    ? "bg-[#0b63ce] text-white shadow-sm"
                    : "bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-[#0b63ce]"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold text-slate-500">
              Showing {filteredMessages.length} message
              {filteredMessages.length === 1 ? "" : "s"}.
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={markVisibleAsRead}
                disabled={visibleUnreadIds.length === 0 || markingAllRead}
                className="rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-[#0b63ce] ring-1 ring-blue-100 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {markingAllRead ? "Marking..." : "Mark All as Read"}
              </button>

              <button
                type="button"
                onClick={openClearAllMessagesModal}
                disabled={filteredMessages.length === 0}
                className="rounded-full bg-red-50 px-4 py-2 text-sm font-black text-red-700 ring-1 ring-red-100 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear All visible messages
              </button>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="rounded-[2rem] bg-white p-6 text-sm font-bold text-slate-600 shadow-sm ring-1 ring-slate-200">
            Loading messages...
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="rounded-[2rem] bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-black text-[#062a57]">
              No Journey Inbox messages yet.
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Welcome messages, prayer updates, approval notices, milestones,
              and HTBF announcements will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredMessages.map((message) => (
              <InboxMessageCard
                key={message.id}
                message={message}
                onMarkAsRead={markAsRead}
                onClear={openClearMessageModal}
              />
            ))}
          </div>
        )}
      </div>

      {clearMessageRequest && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-5">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                HYPER TO BE FREE
              </div>

              <h2 className="mt-1 text-xl font-black text-[#062a57]">
                {clearMessageRequest.mode === "all"
                  ? "Clear all visible messages?"
                  : "Clear this message?"}
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                {clearMessageRequest.mode === "all"
                  ? "This will remove all visible Journey Inbox messages from your side only."
                  : "This will remove this message from your Journey Inbox on your side only."}
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeClearMessageModal}
                disabled={clearingMessage}
                className="inline-flex items-center justify-center rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Not Yet
              </button>

              <button
                type="button"
                onClick={confirmClearMessage}
                disabled={clearingMessage}
                className="inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {clearingMessage
                  ? "Clearing..."
                  : clearMessageRequest.mode === "all"
                    ? "Clear All"
                    : "Clear Message"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function MiniInboxStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
      <div className="text-2xl font-black">{value}</div>
      <div className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-blue-100">
        {label}
      </div>
    </div>
  );
}

function InboxMessageCard({
  message,
  onMarkAsRead,
  onClear,
}: {
  message: InboxMessage;
  onMarkAsRead: (id: string) => void;
  onClear: (message: InboxMessage) => void;
}) {
  const messageKind = getInboxMessageKind(message);
  const style = INBOX_CARD_STYLES[messageKind];
  const explicitCategory = getExplicitCategoryLabel(message);
  const imageUrl = message.image_url?.trim();
  const videoUrl = message.video_url?.trim();
  const actionUrl = message.action_url?.trim();

  return (
    <article
      className={`rounded-[2rem] bg-white p-5 shadow-sm ring-1 ${
        message.read ? style.ring : `${style.ring} shadow-blue-100`
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            message.read
              ? "bg-slate-100 text-slate-600"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {message.read ? "Read" : "Unread"}
        </span>

        <span
          className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${style.badge}`}
        >
          {explicitCategory || style.label}
        </span>

        <span className="text-xs font-bold text-slate-400">
          {formatMessageDate(message.created_at)}
        </span>
      </div>

      <div className={`rounded-[1.5rem] p-4 ring-1 ${style.panel}`}>
        <div className="text-xs font-black uppercase tracking-[0.18em]">
          {style.eyebrow}
        </div>

        <h2 className="mt-2 text-xl font-black text-[#062a57]">
          {message.title}
        </h2>

        {messageKind === "scripture_share" ? (
          <blockquote
            className="mt-3 border-l-4 border-current pl-4 text-sm font-bold leading-7"
            style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
          >
            {message.body}
          </blockquote>
        ) : (
          <p
            className="mt-3 whitespace-pre-wrap text-sm leading-7"
            style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
          >
            {message.body}
          </p>
        )}
      </div>

      {(imageUrl || videoUrl) && (
        <div className="mt-4 space-y-3">
          {imageUrl && (
            <img
              src={imageUrl}
              alt={message.title || "Journey Inbox image"}
              className="max-h-[420px] w-full rounded-[1.5rem] object-cover ring-1 ring-slate-200"
            />
          )}

          {videoUrl && (
            <div className="overflow-hidden rounded-[1.5rem] bg-slate-950 ring-1 ring-slate-200">
              <video
                src={videoUrl}
                controls
                className="max-h-[420px] w-full bg-slate-950"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-3">
                <span className="text-sm font-bold text-slate-600">
                  Video message attached
                </span>
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-[#0b63ce] px-4 py-2 text-sm font-black text-white hover:bg-[#084f9f]"
                >
                  Play Video
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {(message.sender_user_id ||
        message.story_id ||
        message.prayer_request_id) && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-black text-slate-500">
          {message.sender_user_id && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 ring-1 ring-emerald-100">
              Community message
            </span>
          )}
          {message.story_id && (
            <span className="rounded-full bg-slate-50 px-3 py-1 ring-1 ring-slate-200">
              Story linked
            </span>
          )}
          {message.prayer_request_id && (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-[#0b63ce] ring-1 ring-blue-100">
              Prayer request linked
            </span>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {!message.read && (
          <button
            type="button"
            onClick={() => onMarkAsRead(message.id)}
            className="rounded-full bg-[#0b63ce] px-4 py-2 text-sm font-black text-white hover:bg-[#084f9f]"
          >
            Mark as Read
          </button>
        )}

        {actionUrl && (
          <a
            href={actionUrl}
            target={actionUrl.startsWith("/") ? undefined : "_blank"}
            rel={actionUrl.startsWith("/") ? undefined : "noreferrer"}
            className="rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-[#0b63ce] ring-1 ring-blue-100 hover:bg-blue-100"
          >
            View
          </a>
        )}

        <button
          type="button"
          onClick={() => onClear(message)}
          className="rounded-full bg-red-50 px-4 py-2 text-sm font-black text-red-700 ring-1 ring-red-100 hover:bg-red-100"
        >
          Clear
        </button>
      </div>
    </article>
  );
}

function getExplicitCategoryLabel(message: InboxMessage) {
  const rawCategory =
    message.category?.trim() ||
    message.message_type?.trim() ||
    message.type?.trim();

  if (!rawCategory) return "";

  return formatCategoryLabel(rawCategory);
}

function getInboxMessageKind(message: InboxMessage): InboxMessageKind {
  const searchable = normalizeSearchable([
    message.message_type,
    message.type,
    message.category,
    message.title,
    message.body,
  ]);

  if (
    matchesAny(searchable, [
      "prayer_video_reply",
      "prayer video reply",
      "prayer reply",
      "video prayer",
    ])
  ) {
    return "prayer_video_reply";
  }

  if (matchesAny(searchable, ["scripture_share", "scripture share", "verse"])) {
    return "scripture_share";
  }

  if (
    matchesAny(searchable, [
      "testimony_response",
      "testimony response",
      "story response",
    ])
  ) {
    return "testimony_response";
  }

  if (
    matchesAny(searchable, [
      "encouragement",
      "encourage",
      "encouraged",
      "encouraging",
    ])
  ) {
    return "encouragement";
  }

  if (
    matchesAny(searchable, [
      "approval",
      "approved",
      "approve",
      "pending",
      "submitted",
      "removed",
    ])
  ) {
    return "approval";
  }

  if (
    matchesAny(searchable, [
      "milestone",
      "achievement",
      "badge",
      "streak",
      "journey",
      "progress",
    ])
  ) {
    return "milestone";
  }

  return "team";
}

function getMessageCategoryKey(message: InboxMessage): Exclude<
  InboxFilter,
  "all" | "unread"
> {
  const messageKind = getInboxMessageKind(message);
  const searchable = normalizeSearchable([
    message.category,
    message.message_type,
    message.type,
    message.title,
    message.body,
  ]);

  if (
    messageKind === "prayer_video_reply" ||
    message.prayer_request_id ||
    matchesAny(searchable, ["prayer", "pray", "praying", "answered"])
  ) {
    return "prayer";
  }

  if (
    messageKind === "approval" ||
    matchesAny(searchable, [
      "approval",
      "approved",
      "approve",
      "pending",
      "submitted",
      "removed",
    ])
  ) {
    return "approvals";
  }

  if (
    messageKind === "milestone" ||
    matchesAny(searchable, [
      "milestone",
      "achievement",
      "badge",
      "streak",
      "journey",
      "progress",
    ])
  ) {
    return "milestones";
  }

  return "team";
}

function matchesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function normalizeSearchable(values: Array<string | null | undefined>) {
  return values
    .filter(Boolean)
    .join(" ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function formatCategoryLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMessageDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
