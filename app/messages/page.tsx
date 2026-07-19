"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Inbox,
  MessageCircleHeart,
  Reply,
  Send,
  Trash2,
  UserCircle,
  Video,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { loadGenuineStoryVideoRepliesForUser } from "../../lib/demo-content/privatePathIsolation";
type MessageTab = "inbox" | "sent" | "all";

type ReplyRow = {
  id: string;
  story_id: string | null;
  user_id: string | null;
  recipient_user_id: string | null;
  parent_reply_id: string | null;
  message: string | null;
  created_at: string | null;
  deleted_by_sender: boolean | null;
  deleted_by_recipient: boolean | null;
  read_at: string | null;
};

type StoryRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  story_text: string | null;
  story_type: string | null;
  video_url: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  real_name: string | null;
};

export default function MessagesPage() {
  const [checkingUser, setCheckingUser] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ReplyRow[]>([]);
  const [stories, setStories] = useState<Record<string, StoryRow>>({});
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [activeTab, setActiveTab] = useState<MessageTab>("inbox");
  const [message, setMessage] = useState("");
  const [replyTarget, setReplyTarget] = useState<ReplyRow | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

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
      await loadMessages(user.id);
      setCheckingUser(false);
    }

    loadPage();

    const channel = supabase
      .channel("messages-live-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "story_video_replies",
        },
        async () => {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (user) {
            await loadMessages(user.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadMessages(currentUserId: string) {
    let allMessages;
    try {
      allMessages = await loadGenuineStoryVideoRepliesForUser(currentUserId);
    } catch (error) {
      setMessage(
        `Could not load messages: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      return;
    }

    setMessages(allMessages);

    const unreadReceived = allMessages.filter(
      (item) => item.recipient_user_id === currentUserId && !item.read_at
    );

    if (unreadReceived.length > 0) {
      await supabase
        .from("story_video_replies")
        .update({ read_at: new Date().toISOString() })
        .in(
          "id",
          unreadReceived.map((item) => item.id)
        );
    }

    const storyIds = Array.from(
      new Set(
        allMessages
          .map((item) => item.story_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    if (storyIds.length > 0) {
      const { data: storyData } = await supabase
        .from("stories")
        .select("id, user_id, name, story_text, story_type, video_url")
        .in("id", storyIds);

      const nextStories: Record<string, StoryRow> = {};

      ((storyData as StoryRow[]) ?? []).forEach((story) => {
        nextStories[story.id] = story;
      });

      setStories(nextStories);
    }

    const profileIds = Array.from(
      new Set(
        allMessages
          .flatMap((item) => [item.user_id, item.recipient_user_id])
          .filter((id): id is string => Boolean(id))
      )
    );

    if (profileIds.length > 0) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, display_name, username, real_name")
        .in("id", profileIds);

      const nextProfiles: Record<string, ProfileRow> = {};

      ((profileData as ProfileRow[]) ?? []).forEach((profile) => {
        nextProfiles[profile.id] = profile;
      });

      setProfiles(nextProfiles);
    }
  }

  const filteredMessages = useMemo(() => {
    if (!userId) return [];

    if (activeTab === "inbox") {
      return messages.filter((item) => item.recipient_user_id === userId);
    }

    if (activeTab === "sent") {
      return messages.filter((item) => item.user_id === userId);
    }

    return messages;
  }, [activeTab, messages, userId]);

  function getProfileName(profileId: string | null) {
    if (!profileId) return "HTBF Community";

    const profile = profiles[profileId];

    return (
      profile?.display_name?.trim() ||
      profile?.username?.trim() ||
      profile?.real_name?.trim() ||
      "HTBF Community"
    );
  }

  function getOtherPerson(messageRow: ReplyRow) {
    if (!userId) return "HTBF Community";

    if (messageRow.user_id === userId) {
      return getProfileName(messageRow.recipient_user_id);
    }

    return getProfileName(messageRow.user_id);
  }

  function getStoryPreview(storyId: string | null) {
    if (!storyId) return "Video testimony";

    const story = stories[storyId];

    if (!story) return "Video testimony";

    return story.story_text || story.story_type || "Video testimony";
  }

  function getMessageLabel(messageRow: ReplyRow) {
    if (!userId) return "Message";

    if (messageRow.user_id === userId) {
      return `To ${getProfileName(messageRow.recipient_user_id)}`;
    }

    return `From ${getProfileName(messageRow.user_id)}`;
  }

  async function sendReply() {
    if (!userId || !replyTarget) {
      setMessage("Please sign in to reply.");
      return;
    }

    const cleanReply = replyText.trim();

    if (!cleanReply) {
      setMessage("Please write a reply first.");
      return;
    }

    const recipientUserId =
      replyTarget.user_id === userId
        ? replyTarget.recipient_user_id
        : replyTarget.user_id;

    if (!recipientUserId) {
      setMessage("Could not find who to reply to.");
      return;
    }

    setSendingReply(true);
    setMessage("");

    const { error } = await supabase.from("story_video_replies").insert({
      story_id: replyTarget.story_id,
      user_id: userId,
      recipient_user_id: recipientUserId,
      parent_reply_id: replyTarget.id,
      message: cleanReply,
    });

    if (error) {
      setMessage(`Could not send reply: ${error.message}`);
      setSendingReply(false);
      return;
    }

    setReplyText("");
    setReplyTarget(null);
    setSendingReply(false);
    setMessage("Reply sent.");
    await loadMessages(userId);
  }

  async function deleteMessage(messageRow: ReplyRow) {
    if (!userId) return;

    const confirmed = window.confirm(
      "Delete this message from your messages? This will only hide it from your side."
    );

    if (!confirmed) return;

    const updateData: {
      deleted_by_sender?: boolean;
      deleted_by_recipient?: boolean;
    } = {};

    if (messageRow.user_id === userId) {
      updateData.deleted_by_sender = true;
    }

    if (messageRow.recipient_user_id === userId) {
      updateData.deleted_by_recipient = true;
    }

    const { error } = await supabase
      .from("story_video_replies")
      .update(updateData)
      .eq("id", messageRow.id);

    if (error) {
      setMessage(`Could not delete message: ${error.message}`);
      return;
    }

    setMessages((currentMessages) =>
      currentMessages.filter((item) => item.id !== messageRow.id)
    );

    setMessage("Message deleted from your view.");
  }

  function formatDate(value: string | null) {
    if (!value) return "";

    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  }

  if (checkingUser) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-8 shadow-sm ring-1 ring-slate-200">
          Loading messages...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] pb-mobile-nav-clearance text-slate-900">
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
            Messages
          </div>
        </div>

        <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
              <Inbox className="h-6 w-6" />
            </div>

            <div>
              <h1 className="text-3xl font-black text-[#062a57]">
                Video Responses
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                See encouragement, prayers, and replies connected to video
                testimonies.
              </p>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-3 gap-2 rounded-[1.5rem] bg-slate-50 p-2">
            <TabButton
              label="Inbox"
              active={activeTab === "inbox"}
              onClick={() => setActiveTab("inbox")}
            />

            <TabButton
              label="Sent"
              active={activeTab === "sent"}
              onClick={() => setActiveTab("sent")}
            />

            <TabButton
              label="All"
              active={activeTab === "all"}
              onClick={() => setActiveTab("all")}
            />
          </div>

          {message && (
            <div className="mb-5 rounded-2xl bg-blue-50 p-4 text-sm font-bold leading-6 text-[#082f63]">
              {message}
            </div>
          )}

          <div className="space-y-4">
            {filteredMessages.length === 0 ? (
              <div className="rounded-[1.5rem] bg-slate-50 p-5 text-sm leading-6 text-slate-600 ring-1 ring-slate-200">
                No messages here yet.
              </div>
            ) : (
              filteredMessages.map((messageRow) => {
                const storyPreview = getStoryPreview(messageRow.story_id);

                return (
                  <article
                    key={messageRow.id}
                    className="rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-200"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#0b63ce] ring-1 ring-slate-200">
                          <UserCircle className="h-6 w-6" />
                        </div>

                        <div>
                          <div className="text-sm font-black text-[#062a57]">
                            {getMessageLabel(messageRow)}
                          </div>

                          <div className="mt-1 flex items-center gap-2 text-xs font-bold text-slate-500">
                            <Video className="h-3.5 w-3.5" />
                            {formatDate(messageRow.created_at)}
                          </div>
                        </div>
                      </div>

                      {messageRow.recipient_user_id === userId &&
                        messageRow.read_at && (
                          <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />
                            Read
                          </div>
                        )}
                    </div>

                    <div className="mb-3 rounded-2xl bg-white p-3 text-xs font-semibold leading-5 text-slate-500 ring-1 ring-slate-100">
                      Related video:{" "}
                      <span className="font-black text-slate-700">
                        {storyPreview.length > 110
                          ? `${storyPreview.slice(0, 110)}...`
                          : storyPreview}
                      </span>
                    </div>

                    <p className="whitespace-pre-line text-[15px] leading-7 text-slate-800">
                      {messageRow.message}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setReplyTarget(messageRow);
                          setReplyText("");
                          setMessage("");
                        }}
                        className="inline-flex items-center gap-2 rounded-full bg-[#0b63ce] px-4 py-2 text-sm font-black text-white hover:bg-[#084f9f]"
                      >
                        <Reply className="h-4 w-4" />
                        Reply
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteMessage(messageRow)}
                        className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-red-600 ring-1 ring-red-100 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>

                      {messageRow.story_id && (
                        <Link
                          href={`/video-feed?story=${messageRow.story_id}&from=messages`}
                          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-[#082f63] ring-1 ring-slate-200 hover:bg-blue-50"
                        >
                          <MessageCircleHeart className="h-4 w-4" />
                          View Video
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>

      {replyTarget && (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/60 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                  Reply to message
                </div>

                <h2 className="mt-1 text-xl font-black text-[#062a57]">
                  Reply to {getOtherPerson(replyTarget)}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  setReplyTarget(null);
                  setReplyText("");
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                aria-label="Close reply box"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <textarea
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              rows={5}
              placeholder="Write a kind reply, prayer, or encouragement..."
              className="w-full resize-none rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-base leading-7 text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
            />

            <button
              type="button"
              disabled={sendingReply}
              onClick={sendReply}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-5 py-3 text-base font-black text-white shadow-sm hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingReply ? "Sending..." : "Send Reply"}
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

    </main>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-2 text-sm font-black transition ${
        active
          ? "bg-white text-[#0b63ce] shadow-sm"
          : "text-slate-500 hover:bg-white"
      }`}
    >
      {label}
    </button>
  );
}
