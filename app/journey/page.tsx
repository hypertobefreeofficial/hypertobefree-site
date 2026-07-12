"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Send, Trash2, X } from "lucide-react";
import LoggedInBottomNav from "../../components/LoggedInBottomNav";
import JourneyHeader from "../../components/journey/JourneyHeader";
import JourneyHero from "../../components/journey/JourneyHero";
import JourneyMetrics from "../../components/journey/JourneyMetrics";
import JourneyQuickActions from "../../components/journey/JourneyQuickActions";
import JourneyInboxCard from "../../components/journey/JourneyInboxCard";
import JourneyManagementCard from "../../components/journey/JourneyManagementCard";
import JourneyMilestonePath from "../../components/journey/JourneyMilestonePath";
import JourneyMapFeature from "../../components/journey/JourneyMapFeature";
import JourneyImpactCards from "../../components/journey/JourneyImpactCards";
import JourneyReflectionCard from "../../components/journey/JourneyReflectionCard";
import JourneyKeepGoingCard from "../../components/journey/JourneyKeepGoingCard";
import styles from "../../components/journey/JourneyDashboard.module.css";
import { supabase } from "../../lib/supabaseClient";

type StoryRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  video_url: string | null;
  status: string | null;
  prayer_status: string | null;
  answered_text: string | null;
  created_at: string | null;
  edited_at?: string | null;
  removed_at?: string | null;
};

type ReactionRow = {
  story_id: string | null;
  user_id: string | null;
  reaction_type: string | null;
};

type UnreadInboxMessageRow = {
  id: string;
  sender_user_id?: string | null;
  thread_id?: string | null;
  story_id?: string | null;
  prayer_request_id?: string | null;
  message_type?: string | null;
  category?: string | null;
  title?: string | null;
  body?: string | null;
};

type ClearRemovedRequest =
  | { mode: "single"; story: StoryRow }
  | { mode: "all" };

export default function JourneyPage() {
  const [checkingUser, setCheckingUser] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [myUploads, setMyUploads] = useState<StoryRow[]>([]);
  const [reactions, setReactions] = useState<ReactionRow[]>([]);
  const [reflection, setReflection] = useState("");
  const [message, setMessage] = useState("");

  const [controlCenterOpen, setControlCenterOpen] = useState(false);
  const [journeyInboxUnreadCount, setJourneyInboxUnreadCount] = useState(0);

  const [editingStory, setEditingStory] = useState<StoryRow | null>(null);
  const [editStoryText, setEditStoryText] = useState("");
  const [savingStoryEdit, setSavingStoryEdit] = useState(false);
  const [removingStoryId, setRemovingStoryId] = useState<string | null>(null);
  const [clearingRemovedStoryId, setClearingRemovedStoryId] = useState<
    string | null
  >(null);
  const [clearingAllRemoved, setClearingAllRemoved] = useState(false);
  const [clearRemovedRequest, setClearRemovedRequest] =
    useState<ClearRemovedRequest | null>(null);

  useEffect(() => {
    async function loadJourney() {
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

      const savedReflection = window.localStorage.getItem(
        `htbf-reflection-${user.id}`
      );

      if (savedReflection) {
        setReflection(savedReflection);
      }

      const { data: storyData, error: storyError } = await supabase
        .from("stories")
        .select(
          "id, user_id, name, location, story_type, story_text, video_url, status, prayer_status, answered_text, created_at, edited_at, removed_at"
        )
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(100);

      if (storyError) {
        setMessage(`Could not load Journey data: ${storyError.message}`);
        setCheckingUser(false);
        return;
      }

      const approvedStories = (storyData as StoryRow[]) ?? [];
      setStories(approvedStories);

      await loadMyUploads(user.id);

      const storyIds = approvedStories.map((story) => story.id);

      if (storyIds.length > 0) {
        const { data: reactionData, error: reactionError } = await supabase
          .from("story_reactions")
          .select("story_id, user_id, reaction_type")
          .in("story_id", storyIds);

        if (reactionError) {
          setMessage(
            `Could not load Journey reactions: ${reactionError.message}`
          );
        } else {
          setReactions((reactionData as ReactionRow[]) ?? []);
        }
      }

      await loadJourneyInboxUnreadCount(user.id);

      setCheckingUser(false);
    }

    loadJourney();

    const channel = supabase
      .channel("journey-page-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inbox_messages",
        },
        async () => {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (user) {
            await loadJourneyInboxUnreadCount(user.id);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stories",
        },
        async () => {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (user) {
            await loadMyUploads(user.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadMyUploads(currentUserId: string) {
    const { data, error } = await supabase
      .from("stories")
      .select(
        "id, user_id, name, location, story_type, story_text, video_url, status, prayer_status, answered_text, created_at, edited_at, removed_at"
      )
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      setMessage(`Could not load your uploads: ${error.message}`);
      return;
    }

    setMyUploads((data as StoryRow[]) ?? []);
  }

  async function loadJourneyInboxUnreadCount(currentUserId: string) {
    const { data, error } = await supabase
      .from("inbox_messages")
      .select(
        "id, sender_user_id, thread_id, story_id, prayer_request_id, message_type, category, title, body"
      )
      .eq("user_id", currentUserId)
      .eq("read", false)
      .is("hidden_at", null);

    if (!error && data) {
      const unreadRows = (Array.isArray(data) ? data : []).filter(
        isUnreadInboxMessageRow
      );
      const unreadConversationKeys = new Set(
        unreadRows.map(getUnreadConversationKey)
      );

      setJourneyInboxUnreadCount(unreadConversationKeys.size);
    }
  }

  function saveReflection(nextReflection: string) {
    setReflection(nextReflection);

    if (userId) {
      window.localStorage.setItem(
        `htbf-reflection-${userId}`,
        nextReflection
      );
    }
  }

  const myStories = useMemo(() => {
    return myUploads.filter((story) => story.status === "approved");
  }, [myUploads]);

  const myPrayerWatchlist = useMemo(() => {
    const storyIdsIPrayedFor = reactions
      .filter(
        (reaction) =>
          reaction.user_id === userId && reaction.reaction_type === "praying"
      )
      .map((reaction) => reaction.story_id)
      .filter(Boolean);

    return stories.filter(
      (story) =>
        storyIdsIPrayedFor.includes(story.id) &&
        story.story_type?.toLowerCase().includes("prayer")
    );
  }, [reactions, stories, userId]);

  const myGodDidItMoments = useMemo(() => {
    return myStories.filter(
      (story) =>
        story.story_type?.toLowerCase().includes("prayer") &&
        story.prayer_status === "answered"
    );
  }, [myStories]);

  const encouragementImpact = useMemo(() => {
    const myStoryIds = myStories.map((story) => story.id);

    const reactionsOnMyStories = reactions.filter((reaction) =>
      myStoryIds.includes(reaction.story_id ?? "")
    );

    return {
      total: reactionsOnMyStories.length,
      amen: reactionsOnMyStories.filter(
        (reaction) => reaction.reaction_type === "amen"
      ).length,
      praiseGod: reactionsOnMyStories.filter(
        (reaction) => reaction.reaction_type === "praise_god"
      ).length,
      encouraged: reactionsOnMyStories.filter(
        (reaction) => reaction.reaction_type === "encouraged"
      ).length,
      praying: reactionsOnMyStories.filter(
        (reaction) => reaction.reaction_type === "praying"
      ).length,
    };
  }, [myStories, reactions]);

  const journeyTotals = useMemo(() => {
    return {
      storiesShared: myStories.length,
      prayersJoined: myPrayerWatchlist.length,
      godDidIt: myGodDidItMoments.length,
      encouragements: encouragementImpact.total,
    };
  }, [
    myStories.length,
    myPrayerWatchlist.length,
    myGodDidItMoments.length,
    encouragementImpact.total,
  ]);

  const formattedJourneyInboxUnreadCount = formatUnreadBadge(
    journeyInboxUnreadCount
  );

  const removedUploads = useMemo(
    () => myUploads.filter((story) => story.status === "removed"),
    [myUploads]
  );

  const uploadTotals = useMemo(() => {
    return {
      total: myUploads.length,
      approved: myUploads.filter((story) => story.status === "approved").length,
      pending: myUploads.filter(
        (story) => story.status === "pending" || story.status === "submitted"
      ).length,
      removed: removedUploads.length,
      videos: myUploads.filter((story) => Boolean(story.video_url)).length,
    };
  }, [myUploads, removedUploads.length]);

  function openControlCenter() {
    setControlCenterOpen(true);
    setMessage("");
  }

  const focusReflectionRoom = useCallback(() => {
    const section = document.getElementById("journey-reflection-room");
    const textarea = document.getElementById("journey-reflection-textarea");
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    section?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });

    window.setTimeout(() => {
      textarea?.focus({ preventScroll: true });
    }, prefersReducedMotion ? 0 : 300);
  }, []);

  function startEditingStory(story: StoryRow) {
    if (story.status === "removed") {
      setMessage("Removed uploads cannot be edited.");
      return;
    }

    setEditingStory(story);
    setEditStoryText(story.story_text ?? "");
    setMessage("");
  }

  async function saveStoryEdit() {
    if (!userId || !editingStory) {
      setMessage("Please sign in to edit your upload.");
      return;
    }

    const cleanText = editStoryText.trim();

    if (!cleanText) {
      setMessage("Please enter text before saving.");
      return;
    }

    setSavingStoryEdit(true);
    setMessage("");

    const { error } = await supabase.rpc("edit_my_story", {
      story_id: editingStory.id,
      new_story_text: cleanText,
    });

    setSavingStoryEdit(false);

    if (error) {
      setMessage(`Could not save edit: ${error.message}`);
      return;
    }

    setMyUploads((currentUploads) =>
      currentUploads.map((story) =>
        story.id === editingStory.id
          ? {
              ...story,
              story_text: cleanText,
              edited_at: new Date().toISOString(),
            }
          : story
      )
    );

    setStories((currentStories) =>
      currentStories.map((story) =>
        story.id === editingStory.id
          ? {
              ...story,
              story_text: cleanText,
              edited_at: new Date().toISOString(),
            }
          : story
      )
    );

    setEditingStory(null);
    setEditStoryText("");
    setMessage("Upload updated.");
  }

  async function removeMyUpload(story: StoryRow) {
    if (!userId) {
      setMessage("Please sign in to remove your upload.");
      return;
    }

    if (story.user_id !== userId) {
      setMessage("You can only remove your own uploads.");
      return;
    }

    const confirmed = window.confirm(
      "Remove this upload from HTBF? It will no longer appear in public feeds, search, or video areas."
    );

    if (!confirmed) return;

    setRemovingStoryId(story.id);
    setMessage("");

    const { error } = await supabase.rpc("remove_my_story", {
      story_id: story.id,
    });

    setRemovingStoryId(null);

    if (error) {
      setMessage(`Could not remove upload: ${error.message}`);
      return;
    }

    setMyUploads((currentUploads) =>
      currentUploads.map((item) =>
        item.id === story.id
          ? {
              ...item,
              status: "removed",
              removed_at: new Date().toISOString(),
            }
          : item
      )
    );

    setStories((currentStories) =>
      currentStories.filter((item) => item.id !== story.id)
    );

    setMessage("Upload removed from public view.");
  }

  function clearRemovedUpload(story: StoryRow) {
    if (!userId) {
      setMessage("Please sign in to clear removed uploads.");
      return;
    }

    if (story.user_id !== userId) {
      setMessage("You can only clear your own removed uploads.");
      return;
    }

    if (story.status !== "removed") {
      setMessage("Only removed uploads can be cleared.");
      return;
    }

    setClearRemovedRequest({ mode: "single", story });
  }

  function clearAllRemovedUploads() {
    if (!userId) {
      setMessage("Please sign in to clear removed uploads.");
      return;
    }

    const removableIds = removedUploads
      .filter(
        (story) => story.user_id === userId && story.status === "removed"
      )
      .map((story) => story.id);

    if (removableIds.length === 0) {
      setMessage("There are no removed uploads to clear.");
      return;
    }

    setClearRemovedRequest({ mode: "all" });
  }

  function closeClearRemovedModal() {
    setClearRemovedRequest(null);
  }

  async function confirmClearRemovedUploads() {
    if (!clearRemovedRequest) return;

    if (!userId) {
      setMessage("Please sign in to clear removed uploads.");
      setClearRemovedRequest(null);
      return;
    }

    if (clearRemovedRequest.mode === "single") {
      const story = clearRemovedRequest.story;

      if (story.user_id !== userId) {
        setMessage("You can only clear your own removed uploads.");
        setClearRemovedRequest(null);
        return;
      }

      if (story.status !== "removed") {
        setMessage("Only removed uploads can be cleared.");
        setClearRemovedRequest(null);
        return;
      }

      setClearRemovedRequest(null);
      setClearingRemovedStoryId(story.id);
      setMessage("");

      const { error } = await supabase
        .from("stories")
        .delete()
        .eq("id", story.id)
        .eq("user_id", userId)
        .eq("status", "removed");

      setClearingRemovedStoryId(null);

      if (error) {
        setMessage(`Could not clear removed upload: ${error.message}`);
        return;
      }

      setMyUploads((currentUploads) =>
        currentUploads.filter((item) => item.id !== story.id)
      );

      setStories((currentStories) =>
        currentStories.filter((item) => item.id !== story.id)
      );

      setMessage("Removed upload cleared from your uploads list.");
      return;
    }

    const removableIds = removedUploads
      .filter(
        (story) => story.user_id === userId && story.status === "removed"
      )
      .map((story) => story.id);

    if (removableIds.length === 0) {
      setMessage("There are no removed uploads to clear.");
      setClearRemovedRequest(null);
      return;
    }

    setClearRemovedRequest(null);
    setClearingAllRemoved(true);
    setMessage("");

    const { error } = await supabase
      .from("stories")
      .delete()
      .eq("user_id", userId)
      .eq("status", "removed")
      .in("id", removableIds);

    setClearingAllRemoved(false);

    if (error) {
      setMessage(`Could not clear removed uploads: ${error.message}`);
      return;
    }

    setMyUploads((currentUploads) =>
      currentUploads.filter((item) => !removableIds.includes(item.id))
    );

    setStories((currentStories) =>
      currentStories.filter((item) => !removableIds.includes(item.id))
    );

    setMessage("Removed uploads cleared from your uploads list.");
  }

  if (checkingUser) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          Loading your Journey...
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <JourneyHeader />

      <div className={styles.shell}>
        <div className={styles.stack}>
          <JourneyHero />

          <JourneyMetrics
            storiesShared={journeyTotals.storiesShared}
            prayersJoined={journeyTotals.prayersJoined}
            godDidIt={journeyTotals.godDidIt}
            encouragements={journeyTotals.encouragements}
          />

          {message && <div className={styles.messageBanner}>{message}</div>}

          <JourneyQuickActions onReflect={focusReflectionRoom} />

          <div className={styles.inboxManageLayout}>
            <JourneyInboxCard
              unreadCount={journeyInboxUnreadCount}
              formattedUnreadCount={formattedJourneyInboxUnreadCount}
              priorityFirst={journeyInboxUnreadCount > 0}
            />

            <JourneyManagementCard
              controlCenterOpen={controlCenterOpen}
              onOpenControlCenter={openControlCenter}
              onCloseControlCenter={() => setControlCenterOpen(false)}
              uploadTotals={uploadTotals}
              myUploads={myUploads}
              removedUploads={removedUploads}
              removingStoryId={removingStoryId}
              clearingRemovedStoryId={clearingRemovedStoryId}
              clearingAllRemoved={clearingAllRemoved}
              onEditStory={startEditingStory}
              onRemoveStory={removeMyUpload}
              onClearRemovedStory={clearRemovedUpload}
              onClearAllRemoved={clearAllRemovedUploads}
            />
          </div>

          <JourneyMilestonePath
            myStoriesCount={myStories.length}
            encouragementTotal={encouragementImpact.total}
            encouragementEncouraged={encouragementImpact.encouraged}
            godDidItCount={myGodDidItMoments.length}
          />

          <JourneyMapFeature />

          <JourneyImpactCards
            prayerWatchlistCount={myPrayerWatchlist.length}
            godDidItCount={myGodDidItMoments.length}
            encouragementImpact={encouragementImpact}
          />

          <JourneyReflectionCard
            reflection={reflection}
            onReflectionChange={saveReflection}
          />

          <JourneyKeepGoingCard />
        </div>
      </div>

      <LoggedInBottomNav />

      {clearRemovedRequest && (
        <div className="fixed inset-0 z-[90] flex items-end bg-black/60 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-5">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-red-700">
                HYPER TO BE FREE
              </div>

              <h2 className="mt-1 text-xl font-black text-[#062a57]">
                Clear removed uploads?
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                This will permanently remove items already marked Removed from
                your uploads list.
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeClearRemovedModal}
                className="inline-flex items-center justify-center rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-200"
              >
                Not Yet
              </button>

              <button
                type="button"
                onClick={confirmClearRemovedUploads}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700"
              >
                <Trash2 className="h-4 w-4" />
                Clear Removed
              </button>
            </div>
          </div>
        </div>
      )}

      {editingStory && (
        <div className="fixed inset-0 z-[90] flex items-end bg-black/60 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">
                  Edit Upload
                </div>

                <h2 className="mt-1 text-xl font-black text-[#062a57]">
                  Update your story text
                </h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingStory(null);
                  setEditStoryText("");
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                aria-label="Close edit box"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <textarea
              value={editStoryText}
              onChange={(event) => setEditStoryText(event.target.value)}
              rows={7}
              placeholder="Update your testimony, praise report, prayer request, or video description..."
              className="w-full resize-none rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-base leading-7 text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
            />

            <button
              type="button"
              disabled={savingStoryEdit}
              onClick={saveStoryEdit}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-5 py-3 text-base font-black text-white shadow-sm hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingStoryEdit ? "Saving..." : "Save Changes"}
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function formatUnreadBadge(count: number) {
  return count > 99 ? "99+" : String(count);
}

function isUnreadInboxMessageRow(value: unknown): value is UnreadInboxMessageRow {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

function getUnreadConversationKey(message: UnreadInboxMessageRow) {
  if (isPrayerConversationMessage(message)) {
    const threadId = message.thread_id?.trim();

    if (threadId) return `thread:${threadId}`;

    const linkedPrayerId =
      message.prayer_request_id?.trim() || message.story_id?.trim();

    if (linkedPrayerId) return `prayer:${linkedPrayerId}`;
  }

  return `message:${message.id}`;
}

function isPrayerConversationMessage(message: UnreadInboxMessageRow) {
  const searchable = [
    message.message_type,
    message.category,
    message.title,
    message.body,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

  return Boolean(
    message.sender_user_id &&
      [
        "prayer video response",
        "prayer video reply",
        "prayer reply",
        "prayer video",
        "prayer_video_response",
        "prayer_video_reply",
        "prayer_reply",
      ].some((keyword) => searchable.includes(keyword))
  );
}
