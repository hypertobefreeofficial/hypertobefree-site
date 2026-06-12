"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Clock,
  HeartHandshake,
  MessageCircleHeart,
  Send,
  Share2,
  Sparkles,
  Users,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

type ReactionType = "amen" | "praise_god" | "encouraged" | "praying";
type PrayerFilter = "all" | "active" | "answered" | "most-prayed" | "recent";

type PrayerStoryRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  status: string | null;
  created_at: string | null;
  prayer_status: string | null;
  answered_at: string | null;
  answered_text: string | null;
};

type ReactionRow = {
  story_id: string | null;
  user_id: string | null;
  reaction_type: string | null;
};

type PrayerStory = PrayerStoryRow & {
  reaction_counts: {
    amen: number;
    praise_god: number;
    encouraged: number;
    praying: number;
  };
  user_reactions: ReactionType[];
};

const filters: { label: string; value: PrayerFilter }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Answered", value: "answered" },
  { label: "Most Prayed For", value: "most-prayed" },
  { label: "Recently Shared", value: "recent" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function isPrayerStoryRow(value: unknown): value is PrayerStoryRow {
  return isRecord(value) && typeof value.id === "string";
}

function isReactionRow(value: unknown): value is ReactionRow {
  return (
    isRecord(value) &&
    "story_id" in value &&
    "user_id" in value &&
    "reaction_type" in value
  );
}

function storyIncludesPrayer(story: PrayerStoryRow) {
  const storyType = story.story_type?.toLowerCase() ?? "";
  return storyType.includes("prayer");
}

function isAnswered(story: PrayerStory) {
  return story.prayer_status === "answered";
}

function formatPrayerCircleCount(count: number) {
  if (count === 1) return "Prayer Circle • 1 person praying";
  return `Prayer Circle • ${count} people praying`;
}

function formatBelieverCount(count: number) {
  if (count === 1) return "1 believer prayed with this request";
  return `${count} believers prayed with this request`;
}

export default function PrayerPage() {
  const [stories, setStories] = useState<PrayerStory[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<PrayerFilter>("active");
  const [message, setMessage] = useState("");
  const [answeringStory, setAnsweringStory] = useState<PrayerStory | null>(
    null
  );
  const [prayerMomentStory, setPrayerMomentStory] =
    useState<PrayerStory | null>(null);
  const [answeredPrayerText, setAnsweredPrayerText] = useState("");
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );
  const prayerCircleInboxKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function loadPrayerStories(showLoading = false) {
      if (showLoading) setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      setUserId(user?.id ?? null);

      const { data, error } = await supabase
        .from("stories")
        .select(
          "id, user_id, name, location, story_type, story_text, status, created_at, prayer_status, answered_at, answered_text"
        )
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(80);

      if (cancelled) return;

      if (error || !data) {
        console.error("Could not load prayer requests:", error);
        setMessage("Could not load prayer requests right now.");
        setLoading(false);
        return;
      }

      const prayerRows = (Array.isArray(data) ? data : [])
        .filter(isPrayerStoryRow)
        .map((story) => ({
          id: story.id,
          user_id: readString(story.user_id),
          name: readString(story.name),
          location: readString(story.location),
          story_type: readString(story.story_type),
          story_text: readString(story.story_text),
          status: readString(story.status),
          created_at: readString(story.created_at),
          prayer_status: readString(story.prayer_status) ?? "active",
          answered_at: readString(story.answered_at),
          answered_text: readString(story.answered_text),
        }))
        .filter(storyIncludesPrayer);

      const storyIds = prayerRows.map((story) => story.id);
      let reactions: ReactionRow[] = [];

      if (storyIds.length > 0) {
        const { data: reactionData } = await supabase
          .from("story_reactions")
          .select("story_id, user_id, reaction_type")
          .in("story_id", storyIds);

        reactions = (Array.isArray(reactionData) ? reactionData : []).filter(
          isReactionRow
        );
      }

      if (cancelled) return;

      const nextStories: PrayerStory[] = prayerRows.map((story) => {
        const storyReactions = reactions.filter(
          (reaction) => reaction.story_id === story.id
        );

        const userReactions = storyReactions
          .filter((reaction) => reaction.user_id === user?.id)
          .map((reaction) => reaction.reaction_type)
          .filter(
            (reaction): reaction is ReactionType =>
              reaction === "amen" ||
              reaction === "praise_god" ||
              reaction === "encouraged" ||
              reaction === "praying"
          );

        return {
          ...story,
          reaction_counts: {
            amen: storyReactions.filter(
              (reaction) => reaction.reaction_type === "amen"
            ).length,
            praise_god: storyReactions.filter(
              (reaction) => reaction.reaction_type === "praise_god"
            ).length,
            encouraged: storyReactions.filter(
              (reaction) => reaction.reaction_type === "encouraged"
            ).length,
            praying: storyReactions.filter(
              (reaction) => reaction.reaction_type === "praying"
            ).length,
          },
          user_reactions: userReactions,
        };
      });

      setStories(nextStories);
      setLoading(false);
    }

    void loadPrayerStories(true);

    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }

    const channel = supabase
      .channel("prayer-room-live-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stories" },
        () => {
          void loadPrayerStories();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "story_reactions" },
        () => {
          void loadPrayerStories();
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      realtimeChannelRef.current = null;
    };
  }, []);

  const stats = useMemo(() => {
    return {
      activeRequests: stories.filter((story) => !isAnswered(story)).length,
      peoplePraying: stories.reduce(
        (total, story) => total + story.reaction_counts.praying,
        0
      ),
      answeredPrayers: stories.filter(isAnswered).length,
    };
  }, [stories]);

  const filteredStories = useMemo(() => {
    const sortedByRecent = [...stories].sort((first, second) => {
      const firstTime = first.created_at
        ? new Date(first.created_at).getTime()
        : 0;
      const secondTime = second.created_at
        ? new Date(second.created_at).getTime()
        : 0;

      return secondTime - firstTime;
    });

    if (activeFilter === "active") {
      return sortedByRecent.filter((story) => !isAnswered(story));
    }

    if (activeFilter === "answered") {
      return sortedByRecent.filter(isAnswered);
    }

    if (activeFilter === "most-prayed") {
      return [...stories].sort((first, second) => {
        const prayerDifference =
          second.reaction_counts.praying - first.reaction_counts.praying;

        if (prayerDifference !== 0) return prayerDifference;

        const firstTime = first.created_at
          ? new Date(first.created_at).getTime()
          : 0;
        const secondTime = second.created_at
          ? new Date(second.created_at).getTime()
          : 0;

        return secondTime - firstTime;
      });
    }

    return sortedByRecent;
  }, [activeFilter, stories]);

  function isOriginalPoster(story: PrayerStory) {
    return Boolean(userId && story.user_id && story.user_id === userId);
  }

  function updateLocalReaction(
    storyId: string,
    reactionType: ReactionType,
    action: "add" | "remove"
  ) {
    setStories((currentStories) =>
      currentStories.map((story) => {
        if (story.id !== storyId) return story;

        const nextCount =
          action === "add"
            ? story.reaction_counts[reactionType] + 1
            : Math.max(story.reaction_counts[reactionType] - 1, 0);

        const nextUserReactions =
          action === "add"
            ? [...story.user_reactions, reactionType]
            : story.user_reactions.filter(
                (reaction) => reaction !== reactionType
              );

        return {
          ...story,
          reaction_counts: {
            ...story.reaction_counts,
            [reactionType]: nextCount,
          },
          user_reactions: nextUserReactions,
        };
      })
    );
  }

  async function notifyPrayerCircleOwner(story: PrayerStory) {
    if (!userId || !story.user_id || story.user_id === userId) return;

    const notificationKey = `${story.user_id}:${userId}:${story.id}:prayer_circle`;

    if (prayerCircleInboxKeysRef.current.has(notificationKey)) return;

    prayerCircleInboxKeysRef.current.add(notificationKey);

    const { data: existingMessages, error: existingError } = await supabase
      .from("inbox_messages")
      .select("id")
      .eq("user_id", story.user_id)
      .eq("sender_user_id", userId)
      .eq("story_id", story.id)
      .eq("message_type", "prayer_circle")
      .limit(1);

    if (existingError) {
      console.error("Could not check Prayer Circle inbox message:", existingError);
      prayerCircleInboxKeysRef.current.delete(notificationKey);
      return;
    }

    if (Array.isArray(existingMessages) && existingMessages.length > 0) return;

    const { error } = await supabase.from("inbox_messages").insert({
      user_id: story.user_id,
      sender_user_id: userId,
      title: "Someone joined your Prayer Circle",
      body: "A believer prayed with your request.",
      category: "prayer",
      message_type: "prayer_circle",
      story_id: story.id,
      action_url: "/prayer",
      read: false,
    });

    if (error) {
      console.error("Could not create Prayer Circle inbox message:", error);
      prayerCircleInboxKeysRef.current.delete(notificationKey);
    }
  }

  async function notifyPrayerCircleAnswered(story: PrayerStory) {
    if (!userId || !story.user_id) return;

    const { data: reactionData, error: reactionError } = await supabase
      .from("story_reactions")
      .select("user_id")
      .eq("story_id", story.id)
      .eq("reaction_type", "praying");

    if (reactionError) {
      console.error("Could not load Prayer Circle users:", reactionError);
      return;
    }

    const prayerUserIds = Array.from(
      new Set(
        (Array.isArray(reactionData) ? reactionData : [])
          .map((reaction) =>
            isRecord(reaction) ? readString(reaction.user_id) : null
          )
          .filter(
            (reactionUserId): reactionUserId is string =>
              typeof reactionUserId === "string" &&
              reactionUserId !== story.user_id
          )
      )
    );

    if (prayerUserIds.length === 0) return;

    const { data: existingMessages, error: existingError } = await supabase
      .from("inbox_messages")
      .select("user_id")
      .eq("story_id", story.id)
      .eq("message_type", "answered_prayer")
      .in("user_id", prayerUserIds);

    if (existingError) {
      console.error("Could not check answered prayer inbox messages:", existingError);
      return;
    }

    const existingUserIds = new Set(
      (Array.isArray(existingMessages) ? existingMessages : [])
        .map((message) =>
          isRecord(message) ? readString(message.user_id) : null
        )
        .filter(
          (messageUserId): messageUserId is string =>
            typeof messageUserId === "string"
        )
    );

    const nextMessages = prayerUserIds
      .filter((prayerUserId) => !existingUserIds.has(prayerUserId))
      .map((prayerUserId) => ({
        user_id: prayerUserId,
        sender_user_id: userId,
        title: "A prayer you joined was answered",
        body: "God moved. Open the prayer request to see how He answered.",
        category: "prayer",
        message_type: "answered_prayer",
        story_id: story.id,
        action_url: "/prayer",
        read: false,
      }));

    if (nextMessages.length === 0) return;

    const { error } = await supabase.from("inbox_messages").insert(nextMessages);

    if (error) {
      console.error("Could not create answered prayer inbox messages:", error);
    }
  }

  async function toggleReaction(
    storyId: string,
    reactionType: ReactionType,
    options: { showPrayingMessage?: boolean } = {}
  ): Promise<"added" | "removed" | "blocked" | "error"> {
    const { showPrayingMessage = true } = options;
    setMessage("");

    if (!userId) {
      setMessage("Please sign in to respond to prayer requests.");
      return "blocked";
    }

    const story = stories.find((item) => item.id === storyId);
    const alreadyReacted = story?.user_reactions.includes(reactionType);

    if (alreadyReacted) {
      const { error } = await supabase
        .from("story_reactions")
        .delete()
        .eq("story_id", storyId)
        .eq("user_id", userId)
        .eq("reaction_type", reactionType);

      if (error) {
        setMessage(`Could not update response: ${error.message}`);
        return "error";
      }

      updateLocalReaction(storyId, reactionType, "remove");
      return "removed";
    }

    const { error } = await supabase.from("story_reactions").insert({
      story_id: storyId,
      user_id: userId,
      reaction_type: reactionType,
    });

    if (error) {
      setMessage(`Could not update response: ${error.message}`);
      return "error";
    }

    updateLocalReaction(storyId, reactionType, "add");

    if (reactionType === "praying" && story) {
      void notifyPrayerCircleOwner(story);
    }

    if (reactionType === "praying" && showPrayingMessage) {
      setMessage("You joined the Prayer Circle.");
    }

    return "added";
  }

  async function handlePrayNow(story: PrayerStory) {
    const alreadyPraying = story.user_reactions.includes("praying");
    const result = await toggleReaction(story.id, "praying", {
      showPrayingMessage: alreadyPraying,
    });

    if (!alreadyPraying && result === "added") {
      setPrayerMomentStory(story);
    }
  }

  function closeAnsweredPrayerModal() {
    setAnsweringStory(null);
    setAnsweredPrayerText("");
    setMessage("");
  }

  async function markPrayerAnswered(storyId: string, answeredText: string) {
    setMessage("");

    if (!userId) {
      setMessage("Please sign in to mark a prayer request answered.");
      return;
    }

    const story = stories.find((item) => item.id === storyId);

    if (!story) {
      setMessage("Could not find this prayer request.");
      return;
    }

    if (story.user_id !== userId) {
      setMessage(
        "Only the person who shared this prayer request can mark it answered."
      );
      return;
    }

    const cleanAnsweredText = answeredText.trim();

    if (!cleanAnsweredText) {
      setMessage(
        "Please add a short answered prayer update before sharing praise."
      );
      return;
    }

    const answeredAt = new Date().toISOString();

    const { error } = await supabase
      .from("stories")
      .update({
        prayer_status: "answered",
        answered_at: answeredAt,
        answered_text: cleanAnsweredText,
      })
      .eq("id", storyId)
      .eq("user_id", userId);

    if (error) {
      setMessage(`Could not mark prayer answered: ${error.message}`);
      return;
    }

    setStories((currentStories) =>
      currentStories.map((currentStory) =>
        currentStory.id === storyId
          ? {
              ...currentStory,
              prayer_status: "answered",
              answered_at: answeredAt,
              answered_text: cleanAnsweredText,
            }
          : currentStory
      )
    );

    await notifyPrayerCircleAnswered(story);

    closeAnsweredPrayerModal();
    setMessage("Praise shared with the community.");
    setActiveFilter("answered");
  }

  async function shareStory(story: PrayerStory) {
    setMessage("");

    const shareText =
      isAnswered(story) && story.answered_text
        ? `God answered this prayer: ${story.answered_text.slice(0, 140)}`
        : story.story_text
          ? `Stand in prayer with this request: ${story.story_text.slice(0, 140)}`
          : "Stand in prayer with this request on Hyper to Be Free.";

    const shareData = {
      title: "Hyper to Be Free - Prayer Room",
      text: shareText,
      url: `${window.location.origin}/prayer`,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }

      await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      setMessage("Prayer link copied.");
    } catch (error) {
      console.error("Share failed:", error);
    }
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] pb-24 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link
            href="/journey"
            className="inline-flex items-center gap-2 text-sm font-black text-[#082f63]"
          >
            HTBF
          </Link>

          <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
            Prayer
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-6">
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#082f63] via-[#0b63ce] to-[#69b7ff] p-6 text-white shadow-xl shadow-blue-950/10">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-blue-100 ring-1 ring-white/15">
            <Sparkles className="h-4 w-4" />
            PRAYER ROOM
          </div>

          <h1 className="mt-4 max-w-2xl text-4xl font-black leading-tight tracking-tight sm:text-5xl">
            Stand with someone in prayer
          </h1>

          <p className="mt-3 max-w-2xl text-base font-semibold leading-7 text-blue-100">
            Pray with the HTBF community, encourage others, and celebrate when
            God answers.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/share-your-story?type=prayer"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-[#082f63] shadow-sm transition hover:bg-blue-50"
            >
              <Send className="h-4 w-4" />
              Share a Prayer Request
            </Link>

            <button
              type="button"
              onClick={() => setActiveFilter("answered")}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm font-black text-white ring-1 ring-white/20 transition hover:bg-white/15"
            >
              <CheckCircle2 className="h-4 w-4" />
              View Answered Prayers
            </button>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-3">
          <StatCard
            icon={<MessageCircleHeart className="h-5 w-5" />}
            label="Active Requests"
            value={stats.activeRequests}
          />
          <StatCard
            icon={<Users className="h-5 w-5" />}
            label="People Praying"
            value={stats.peoplePraying}
          />
          <StatCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            label="Answered Prayers"
            value={stats.answeredPrayers}
          />
        </section>

        <section className="mt-5 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
              <HeartHandshake className="h-6 w-6" />
            </div>

            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                Today&apos;s Prayer Focus
              </div>
              <p className="mt-1 text-lg font-black leading-7 text-[#062a57]">
                Ask God to strengthen someone who feels alone today.
              </p>
            </div>
          </div>
        </section>

        <section id="prayer-requests" className="mt-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
                Live Prayer Room
              </div>
              <h2 className="mt-1 text-3xl font-black text-[#062a57]">
                Prayer requests
              </h2>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-600 ring-1 ring-slate-200">
              <Clock className="h-4 w-4 text-[#0b63ce]" />
              Live updates
            </div>
          </div>

          <div className="mb-5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {filters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setActiveFilter(filter.value)}
                className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-black transition ${
                  activeFilter === filter.value
                    ? "bg-[#0b63ce] text-white shadow-sm"
                    : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-[#0b63ce]"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {message && (
            <div className="mb-5 rounded-2xl bg-blue-50 p-4 text-sm font-bold leading-6 text-[#082f63] ring-1 ring-blue-100">
              {message}
            </div>
          )}

          {loading ? (
            <div className="rounded-[2rem] bg-white p-6 text-slate-600 shadow-sm ring-1 ring-slate-200">
              Loading prayer requests...
            </div>
          ) : stories.length === 0 ? (
            <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="text-lg font-black text-[#062a57]">
                No prayer requests yet.
              </div>
              <p className="mt-2 leading-7 text-slate-600">
                No prayer requests yet. Be the first to ask the HTBF community
                to pray with you.
              </p>
              <Link
                href="/share-your-story?type=prayer"
                className="mt-5 inline-flex rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white hover:bg-[#084f9f]"
              >
                Share a Prayer Request
              </Link>
            </div>
          ) : filteredStories.length === 0 ? (
            <div className="rounded-[2rem] bg-white p-6 text-slate-600 shadow-sm ring-1 ring-slate-200">
              No prayer requests match this filter yet.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredStories.map((story) =>
                isAnswered(story) ? (
                  <AnsweredPrayerCard
                    key={story.id}
                    story={story}
                    onShare={() => shareStory(story)}
                  />
                ) : (
                  <PrayerRequestCard
                    key={story.id}
                    story={story}
                    owner={isOriginalPoster(story)}
                    onPray={() => handlePrayNow(story)}
                    onEncourage={() => toggleReaction(story.id, "encouraged")}
                    onShare={() => shareStory(story)}
                    onGodDidIt={() => {
                      setAnsweringStory(story);
                      setAnsweredPrayerText("");
                      setMessage("");
                    }}
                  />
                )
              )}
            </div>
          )}
        </section>
      </div>

      {prayerMomentStory && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-5 shadow-2xl">
            <div className="text-xs font-black uppercase tracking-[0.22em] text-[#0b63ce]">
              PRAYER MOMENT
            </div>

            <h3 className="mt-2 text-2xl font-black leading-tight text-[#062a57]">
              Take 15 seconds to pray
            </h3>

            <p className="mt-3 rounded-2xl bg-blue-50 p-4 text-base font-bold leading-7 text-[#082f63] ring-1 ring-blue-100">
              Lord, strengthen this person and remind them they are not alone.
            </p>

            <button
              type="button"
              onClick={() => {
                setPrayerMomentStory(null);
                setMessage("You joined the Prayer Circle.");
              }}
              className="mt-5 flex w-full items-center justify-center rounded-2xl bg-[#0b63ce] px-4 py-3 text-sm font-black text-white transition hover:bg-[#084f9f]"
            >
              I Prayed
            </button>
          </div>
        </div>
      )}

      {answeringStory && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 shadow-2xl">
            <div className="text-xs font-black uppercase tracking-[0.22em] text-[#0b63ce]">
              HYPER TO BE FREE
            </div>

            <h3 className="mt-2 text-2xl font-black leading-tight text-[#062a57]">
              Praise God! How did He answer your prayer?
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Share a short update so others can be encouraged.
            </p>

            <textarea
              value={answeredPrayerText}
              onChange={(event) => setAnsweredPrayerText(event.target.value)}
              rows={7}
              placeholder="Share what God did..."
              className="mt-4 min-h-[11rem] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base leading-7 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-4 focus:ring-emerald-50"
            />

            {message && (
              <div className="mt-3 rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-[#082f63]">
                {message}
              </div>
            )}

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeAnsweredPrayerModal}
                className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-200"
              >
                Not Yet
              </button>

              <button
                type="button"
                onClick={() =>
                  markPrayerAnswered(answeringStory.id, answeredPrayerText)
                }
                className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700"
              >
                Share Praise
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-[1.5rem] bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
          {icon}
        </div>
        <div className="text-3xl font-black text-[#062a57]">{value}</div>
      </div>
      <div className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
    </div>
  );
}

function PrayerRequestCard({
  story,
  owner,
  onPray,
  onEncourage,
  onShare,
  onGodDidIt,
}: {
  story: PrayerStory;
  owner: boolean;
  onPray: () => void;
  onEncourage: () => void;
  onShare: () => void;
  onGodDidIt: () => void;
}) {
  const praying = story.user_reactions.includes("praying");
  const encouraged = story.user_reactions.includes("encouraged");

  return (
    <article className="overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-slate-200">
      <div className="p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-lg font-black text-[#0b63ce]">
            {(story.name || "H").charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <div className="min-w-0 max-w-full break-words font-black text-slate-900">
                {story.name || "HTBF Community"}
              </div>
              <span className="text-sm text-slate-400">•</span>
              <span className="max-w-full break-words rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-[#0b63ce]">
                Prayer Request
              </span>
            </div>

            <div className="mt-1 text-sm font-semibold text-slate-500">
              {story.location || "Location not shared"}
            </div>
          </div>
        </div>

        {story.story_text && (
          <p
            className="mt-4 max-w-full overflow-hidden whitespace-pre-wrap break-words text-[17px] leading-7 text-slate-800"
            style={{
              overflowWrap: "anywhere",
              wordBreak: "break-word",
            }}
          >
            {story.story_text}
          </p>
        )}

        <div className="mt-4 rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-100">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
            Prayer Circle
          </div>
          <div className="mt-1 text-base font-black text-[#062a57]">
            {formatPrayerCircleCount(story.reaction_counts.praying)}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 p-4">
        <div className="grid gap-2 sm:grid-cols-4">
          <PrayerButton active={praying} onClick={onPray}>
            {praying ? "Praying" : "Pray Now"}
          </PrayerButton>
          <PrayerButton active={encouraged} onClick={onEncourage}>
            {encouraged ? "Encouraged" : "Encourage"}
          </PrayerButton>
          <PrayerButton onClick={onShare}>
            <span className="inline-flex items-center gap-1">
              <Share2 className="h-4 w-4" />
              Share
            </span>
          </PrayerButton>
          {owner && (
            <button
              type="button"
              onClick={onGodDidIt}
              className="rounded-2xl bg-emerald-600 px-3 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700"
            >
              God Did It
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function AnsweredPrayerCard({
  story,
  onShare,
}: {
  story: PrayerStory;
  onShare: () => void;
}) {
  return (
    <article className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-emerald-100">
      <div className="rounded-2xl bg-emerald-50 p-4">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Answered Prayer
        </div>

        {story.story_text && (
          <div className="mt-4">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              Original Prayer Request
            </div>

            <div
              className="mt-2 rounded-2xl bg-white p-4 text-sm leading-6 text-slate-700 ring-1 ring-emerald-100"
              style={{
                overflowWrap: "anywhere",
                wordBreak: "break-word",
                whiteSpace: "pre-wrap",
              }}
            >
              {story.story_text}
            </div>
          </div>
        )}

        {story.reaction_counts.praying > 0 && (
          <div className="mt-4 inline-flex rounded-full bg-emerald-100 px-3.5 py-2 text-sm font-black text-emerald-800 ring-1 ring-emerald-200">
            {formatBelieverCount(story.reaction_counts.praying)}
          </div>
        )}

        <div className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
          How God Answered
        </div>

        {story.answered_text ? (
          <div
            className="mt-2 rounded-2xl bg-white p-4 text-sm leading-6 text-slate-700 ring-1 ring-emerald-100"
            style={{
              overflowWrap: "anywhere",
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
            }}
          >
            {story.answered_text}
          </div>
        ) : (
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This prayer request was marked answered by the person who shared it.
          </p>
        )}

        <button
          type="button"
          onClick={onShare}
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-emerald-700 ring-1 ring-emerald-100 transition hover:bg-emerald-100"
        >
          <Share2 className="h-4 w-4" />
          Share Testimony
        </button>
      </div>
    </article>
  );
}

function PrayerButton({
  active = false,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-3 py-2.5 text-sm font-black transition ${
        active
          ? "bg-[#0b63ce] text-white"
          : "bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-[#0b63ce]"
      }`}
    >
      {children}
    </button>
  );
}
