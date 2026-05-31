"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Inbox,
  MessageCircleHeart,
  PlayCircle,
  Reply,
  Send,
  Sparkles,
  Trash2,
  UserCircle,
  Video,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import LoggedInBottomNav from "../../components/LoggedInBottomNav";

type JourneyTab = "received" | "sent" | "all";

type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  real_name: string | null;
};

type StoryRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  story_text: string | null;
  story_type: string | null;
  video_url: string | null;
  status: string | null;
};

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

type ReactionRow = {
  story_id: string | null;
  reaction_type: string | null;
};

export default function JourneyPage() {
  const [checkingUser, setCheckingUser] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [myStories, setMyStories] = useState<StoryRow[]>([]);
  const [messages, setMessages] = useState<ReplyRow[]>([]);
  const [storiesById, setStoriesById] = useState<Record<string, StoryRow>>({});
  const [profilesById, setProfilesById] = useState<Record<string, ProfileRow>>(
    {}
  );
  const [reactionCounts, setReactionCounts] = useState({
    amen: 0,
    praise_god: 0,
    encouraged: 0,
    praying: 0,
  });

  const [activeTab, setActiveTab] = useState<JourneyTab>("received");
  const [inboxOpen, setInboxOpen] = useState(false);
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

      await Promise.all([
        loadProfile(user.id),
        loadJourneyStats(user.id),
        loadJourneyMessages(user.id),
      ]);

      setCheckingUser(false);
    }

    loadPage();

    const channel = supabase
      .channel("journey-live-updates")
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
            await loadJourneyMessages(user.id);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "story_reactions",
        },
        async () => {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (user) {
            await loadJourneyStats(user.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadProfile(currentUserId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, username, real_name")
      .eq("id", currentUserId)
      .maybeSingle();

    if (data) {
      setProfile(data as ProfileRow);
    }
  }

  async function loadJourneyStats(currentUserId: string) {
    const { data: storyData } = await supabase
      .from("stories")
      .select("id, user_id, name, story_text, story_type, video_url, status")
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: false });

    const ownedStories = (storyData as StoryRow[]) ?? [];
    setMyStories(ownedStories);

    const storyIds = ownedStories.map((story) => story.id);

    if (storyIds.length === 0) {
      setReactionCounts({
        amen: 0,
        praise_god: 0,
        encouraged: 0,
        praying: 0,
      });
      return;
    }

    const { data: reactionData } = await supabase
      .from("story_reactions")
      .select("story_id, reaction_type")
      .in("story_id", storyIds);

    const reactions = (reactionData as ReactionRow[]) ?? [];

    setReactionCounts({
      amen: reactions.filter((item) => item.reaction_type === "amen").length,
      praise_god: reactions.filter(
        (item) => item.reaction_type === "praise_god"
      ).length,
      encouraged: reactions.filter(
        (item) => item.reaction_type === "encouraged"
      ).length,
      praying: reactions.filter((item) => item.reaction_type === "praying")
        .length,
    });
  }

  async function loadJourneyMessages(currentUserId: string) {
    const { data, error } = await supabase
      .from("story_video_replies")
      .select(
        "id, story_id, user_id, recipient_user_id, parent_reply_id, message, created_at, deleted_by_sender, deleted_by_recipient, read_at"
      )
      .or(`user_id.eq.${currentUserId},recipient_user_id.eq.${currentUserId}`)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(`Could not load Journey inbox: ${error.message}`);
      return;
    }

    const visibleMessages = ((data as ReplyRow[]) ?? []).filter((item) => {
      const hiddenFromSender =
        item.user_id === currentUserId && item.deleted_by_sender === true;

      const hiddenFromRecipient =
        item.recipient_user_id === currentUserId &&
        item.deleted_by_recipient === true;

      return !hiddenFromSender && !hiddenFromRecipient;
    });

    setMessages(visibleMessages);

    const storyIds = Array.from(
      new Set(
        visibleMessages
          .map((item) => item.story_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    if (storyIds.length > 0) {
      const { data: storyData } = await supabase
        .from("stories")
        .select("id, user_id, name, story_text, story_type, video_url, status")
        .in("id", storyIds);

      const nextStories: Record<string, StoryRow> = {};

      ((storyData as StoryRow[]) ?? []).forEach((story) => {
        nextStories[story.id] = story;
      });

      setStoriesById(nextStories);
    }

    const profileIds = Array.from(
      new Set(
        visibleMessages
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

      ((profileData as ProfileRow[]) ?? []).forEach((profileItem) => {
        nextProfiles[profileItem.id] = profileItem;
      });

      setProfilesById(nextProfiles);
    }
  }

  const receivedMessages = useMemo(() => {
    if (!userId) return [];
    return messages.filter((item) => item.recipient_user_id === userId);
  }, [messages, userId]);

  const sentMessages = useMemo(() => {
    if (!userId) return [];
    return messages.filter((item) => item.user_id === userId);
  }, [messages, userId]);

  const unreadCount = useMemo(() => {
    if (!userId) return 0;

    return messages.filter(
      (item) => item.recipient_user_id === userId && !item.read_at
    ).length;
  }, [messages, userId]);

  const filteredMessages = useMemo(() => {
    if (!userId) return [];

    if (activeTab === "received") return receivedMessages;
    if (activeTab === "sent") return sentMessages;

    return messages;
  }, [activeTab, messages, receivedMessages, sentMessages, userId]);

  const videoCount = useMemo(() => {
    return myStories.filter((story) => Boolean(story.video_url)).length;
  }, [myStories]);

  const totalReactions =
    reactionCounts.amen +
    reactionCounts.praise_god +
    reactionCounts.encouraged +
    reactionCounts.praying;

  function getDisplayName() {
    return (
      profile?.display_name?.trim() ||
      profile?.username?.trim() ||
      profile?.real_name?.trim() ||
      "Your"
    );
  }

  function getProfileName(profileId: string | null) {
    if (!profileId) return "HTBF Community";

    const foundProfile = profilesById[profileId];

    return (
      foundProfile?.display_name?.trim() ||
      foundProfile?.username?.trim() ||
      foundProfile?.real_name?.trim() ||
      "HTBF Community"
    );
  }

  function getMessageLabel(messageRow: ReplyRow) {
    if (!userId) return "Message";

    if (messageRow.user_id === userId) {
      return `To ${getProfileName(messageRow.recipient_user_id)}`;
    }

    return `From ${getProfileName(messageRow.user_id)}`;
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

    const story = storiesById[storyId];

    if (!story) return "Video testimony";

    return story.story_text || story.story_type || "Video testimony";
  }

  async function openInbox() {
    setInboxOpen(true);
    setMessage("");

    if (!userId) return;

    const unreadReceived = messages.filter(
      (item) => item.recipient_user_id === userId && !item.read_at
    );

    if (unreadReceived.length > 0) {
      await supabase
        .from("story_video_replies")
        .update({ read_at: new Date().toISOString() })
        .in(
          "id",
          unreadReceived.map((item) => item.id)
        );

      await loadJourneyMessages(userId);
    }
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
    await loadJourneyMessages(userId);
  }

  async function deleteMessage(messageRow: ReplyRow) {
    if (!userId) return;

    const confirmed = window.confirm(
      "Delete this message from your Journey? This only hides it from your side."
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

    setMessage("Message deleted from your Journey.");
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

        <section className="mb-5 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
              <Sparkles className="h-6 w-6" />
            </div>

            <div>
              <h1 className="text-3xl font-black text-[#062a57]">
                {getDisplayName()} Journey
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Track your shared stories, video responses, encouragement, and
                faith activity in one place.
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <JourneyStatCard
              label="Stories"
              value={myStories.length}
              tone="blue"
            />

            <JourneyStatCard label="Videos" value={videoCount} tone="amber" />

            <JourneyStatCard
              label="Encouragements"
              value={totalReactions}
              tone="green"
            />

            <button
              type="button"
              onClick={openInbox}
              className="relative rounded-[1.5rem] bg-white p-4 text-left ring-1 ring-slate-200 transition hover:bg-blue-50"
            >
              {unreadCount > 0 && (
                <span className="absolute right-3 top-3 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">
                  {unreadCount}
                </span>
              )}

              <div className="flex items-center gap-2 text-[#0b63ce]">
                <Inbox className="h-5 w-5" />
                <span className="text-2xl font-black">
                  {receivedMessages.length}
                </span>
              </div>

              <div className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-[#0b63ce]">
                Inbox
              </div>

              <div className="mt-3 flex items-center gap-1 text-xs font-bold text-slate-500">
                Open messages
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </button>
          </div>
        </section>

        {!inboxOpen ? (
          <>
            <section className="mb-5 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="mb-4 flex items-center gap-2">
                <PlayCircle className="h-5 w-5 text-[#0b63ce]" />
                <h2 className="text-xl font-black text-[#062a57]">
                  Quick Actions
                </h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Link
                  href="/share-your-story"
                  className="rounded-[1.5rem] bg-blue-50 p-4 text-sm font-black text-[#082f63] ring-1 ring-blue-100"
                >
                  Share a new testimony
                </Link>

                <Link
                  href="/video-feed"
                  className="rounded-[1.5rem] bg-amber-50 p-4 text-sm font-black text-[#082f63] ring-1 ring-amber-100"
                >
                  View video testimonies
                </Link>

                <Link
                  href="/search"
                  className="rounded-[1.5rem] bg-slate-50 p-4 text-sm font-black text-[#082f63] ring-1 ring-slate-200"
                >
                  Search stories
                </Link>

                <button
                  type="button"
                  onClick={openInbox}
                  className="rounded-[1.5rem] bg-white p-4 text-left text-sm font-black text-[#082f63] ring-1 ring-slate-200"
                >
                  Open Journey inbox
                </button>
              </div>
            </section>

            <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="mb-4 flex items-center gap-2">
                <MessageCircleHeart className="h-5 w-5 text-[#0b63ce]" />
                <h2 className="text-xl font-black text-[#062a57]">
                  Recent Inbox Preview
                </h2>
              </div>

              {receivedMessages.length === 0 ? (
                <div className="rounded-[1.5rem] bg-slate-50 p-5 text-sm leading-6 text-slate-600 ring-1 ring-slate-200">
                  No video responses yet. When someone responds to your videos,
                  they will appear here.
                </div>
              ) : (
                <button
                  type="button"
                  onClick={openInbox}
                  className="w-full rounded-[1.5rem] bg-slate-50 p-4 text-left ring-1 ring-slate-200 transition hover:bg-blue-50"
                >
                  <div className="text-sm font-black text-[#062a57]">
                    {getMessageLabel(receivedMessages[0])}
                  </div>

                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                    {receivedMessages[0].message}
                  </p>

                  <div className="mt-3 flex items-center gap-1 text-xs font-black text-[#0b63ce]">
                    Open inbox
                    <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </button>
              )}
            </section>
          </>
        ) : (
          <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                  Journey Inbox
                </div>

                <h2 className="mt-1 text-2xl font-black text-[#062a57]">
                  Video Responses
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setInboxOpen(false)}
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-600"
              >
                Close
              </button>
            </div>

            <div className="mb-5 grid grid-cols-3 gap-2 rounded-[1.5rem] bg-slate-50 p-2">
              <TabButton
                label="Received"
                active={activeTab === "received"}
                onClick={() => setActiveTab("received")}
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
                            href={`/video-feed?story=${messageRow.story_id}&from=journey`}
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
        )}
      </div>

      {replyTarget && (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/60 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                  Reply from Journey
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

      <LoggedInBottomNav />
    </main>
  );
}

function JourneyStatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "amber" | "green";
}) {
  const toneClasses = {
    blue: "bg-blue-50 text-[#0b63ce]",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-emerald-50 text-emerald-700",
  };

  return (
    <div className={`rounded-[1.5rem] p-4 ${toneClasses[tone]}`}>
      <div className="text-2xl font-black text-[#062a57]">{value}</div>
      <div className="text-xs font-black uppercase tracking-[0.16em]">
        {label}
      </div>
    </div>
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
