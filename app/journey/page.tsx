"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  HeartHandshake,
  Sparkles,
  Trophy,
  Flame,
  Send,
  Users,
  Footprints,
  Compass,
  MessageCircleHeart,
  Globe2,
  Target,
  Lightbulb,
  HandHeart,
  Map,
  NotebookPen,
  Play,
  Inbox,
  ChevronRight,
  Trash2,
  Video,
  X,
} from "lucide-react";
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
    const { count, error } = await supabase
      .from("inbox_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", currentUserId)
      .eq("read", false);

    if (!error) {
      setJourneyInboxUnreadCount(count ?? 0);
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
    <main className="min-h-screen bg-[#f8fbff] pb-24 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link
            href="/feed"
            className="inline-flex items-center gap-2 text-sm font-black text-[#082f63]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Feed
          </Link>

          <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
            Journey
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#082f63] via-[#0b63ce] to-[#69b7ff] p-6 text-white shadow-xl shadow-blue-950/10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-black text-blue-100 ring-1 ring-white/15">
            <Sparkles className="h-4 w-4" />
            Freedom Journey
          </div>

          <h1 className="text-4xl font-black tracking-tight">
            This is your role in the movement.
          </h1>

          <p className="mt-3 leading-7 text-blue-100">
            Journey helps you keep track of prayer, encouragement, answered
            prayers, personal reflection, and the stories you have shared.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat number={journeyTotals.storiesShared} label="Shared" />
            <MiniStat number={journeyTotals.prayersJoined} label="Prayers" />
            <MiniStat number={journeyTotals.godDidIt} label="God Did It" />
            <MiniStat
              number={journeyTotals.encouragements}
              label="Responses"
            />
          </div>
        </section>

        {message && (
          <section className="rounded-[2rem] bg-blue-50 p-5 text-sm font-bold text-[#082f63] ring-1 ring-blue-100">
            {message}
          </section>
        )}

        <button
          type="button"
          onClick={openControlCenter}
          className="w-full rounded-[2rem] bg-white p-5 text-left shadow-sm ring-1 ring-slate-200 transition hover:bg-blue-50"
        >
          <div className="flex items-center gap-3">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
              <Compass className="h-6 w-6" />
              </div>

            <div className="min-w-0 flex-1">
              <div className="text-sm font-black uppercase tracking-[0.18em] text-amber-700">
                Manage My Uploads
              </div>
              <h2 className="text-2xl font-black text-[#062a57]">
                My uploads
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                View, edit, and remove your videos, testimonies, praise reports,
                and prayer requests from one place.
              </p>
            </div>

            <ChevronRight className="h-5 w-5 text-slate-400" />
          </div>
        </button>

        {controlCenterOpen && (
          <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-black uppercase tracking-[0.18em] text-amber-700">
                  Control Center
                </div>
                <h2 className="text-2xl font-black text-[#062a57]">
                  My Uploads
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  This is where you manage what you have shared on HTBF.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setControlCenterOpen(false)}
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-600"
              >
                Close
              </button>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <MiniUploadStat label="Total" number={uploadTotals.total} />
              <MiniUploadStat label="Approved" number={uploadTotals.approved} />
              <MiniUploadStat label="Pending" number={uploadTotals.pending} />
              <MiniUploadStat label="Removed" number={uploadTotals.removed} />
              <MiniUploadStat label="Videos" number={uploadTotals.videos} />
            </div>

            {removedUploads.length > 0 && (
              <div className="mb-5 flex flex-col gap-3 rounded-[1.5rem] bg-red-50 p-4 ring-1 ring-red-100 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-black text-red-800">
                    Clear removed uploads
                  </div>
                  <p className="mt-1 text-sm leading-6 text-red-700">
                    Permanently remove items already marked Removed from this
                    control center.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={clearAllRemovedUploads}
                  disabled={clearingAllRemoved}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  {clearingAllRemoved ? "Clearing..." : "Clear All Removed"}
                </button>
              </div>
            )}

            <div className="space-y-4">
              {myUploads.length === 0 ? (
                <div className="rounded-[1.5rem] bg-slate-50 p-5 text-sm leading-6 text-slate-600 ring-1 ring-slate-200">
                  You have not uploaded anything yet.
                </div>
              ) : (
                myUploads.map((story) => (
                  <MyUploadCard
                    key={story.id}
                    story={story}
                    removing={removingStoryId === story.id}
                    clearingRemoved={clearingRemovedStoryId === story.id}
                    onEdit={() => startEditingStory(story)}
                    onRemove={() => removeMyUpload(story)}
                    onClearRemoved={() => clearRemovedUpload(story)}
                  />
                ))
              )}
            </div>
          </section>
        )}

        <Link
          href="/journey/inbox"
          className="block w-full rounded-[2rem] bg-white p-5 text-left shadow-sm ring-1 ring-slate-200 transition hover:bg-blue-50"
        >
          <div className="flex items-center gap-3">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
              <Inbox className="h-6 w-6" />
              {journeyInboxUnreadCount > 0 && (
                <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">
                  {journeyInboxUnreadCount}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-sm font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                Journey Inbox
              </div>
              <h2 className="text-2xl font-black text-[#062a57]">
                Messages, updates, and milestones
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {journeyInboxUnreadCount > 0
                  ? `${journeyInboxUnreadCount} unread Journey Inbox message${
                      journeyInboxUnreadCount === 1 ? "" : "s"
                    }.`
                  : "Messages, updates, and milestones from your HTBF journey."}
              </p>
              <div className="mt-2 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100">
                {journeyInboxUnreadCount} unread
              </div>
            </div>

            <ChevronRight className="h-5 w-5 text-slate-400" />
          </div>
        </Link>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
              <Target className="h-6 w-6" />
            </div>

            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                Today’s Mission
              </div>
              <h2 className="text-2xl font-black text-[#062a57]">
                Do one thing that brings encouragement.
              </h2>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MissionButton
              href="/prayer"
              icon={<HeartHandshake className="h-5 w-5" />}
              title="Pray"
              text="Stand with one request"
            />

            <MissionButton
              href="/feed"
              icon={<HandHeart className="h-5 w-5" />}
              title="Encourage"
              text="Respond to one story"
            />

            <MissionButton
              href="/share-your-story"
              icon={<Send className="h-5 w-5" />}
              title="Testify"
              text="Share what God did"
            />
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
              <Footprints className="h-6 w-6" />
            </div>

            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-amber-700">
                Freedom Milestones
              </div>
              <h2 className="text-2xl font-black text-[#062a57]">
                Your HTBF journey path
              </h2>
            </div>
          </div>

          <div className="space-y-4">
            <JourneyPathStep
              active={myStories.length > 0}
              number="01"
              icon={<Lightbulb className="h-5 w-5" />}
              title="God moved"
              text="Something happened that was worth remembering."
            />

            <JourneyPathStep
              active={myStories.length > 0}
              number="02"
              icon={<Send className="h-5 w-5" />}
              title="You shared"
              text={
                myStories.length > 0
                  ? `You have shared ${myStories.length} approved story${
                      myStories.length === 1 ? "" : "ies"
                    }.`
                  : "Share a testimony, praise report, prayer request, or video."
              }
            />

            <JourneyPathStep
              active={encouragementImpact.total > 0}
              number="03"
              icon={<Users className="h-5 w-5" />}
              title="Others responded"
              text={
                encouragementImpact.total > 0
                  ? `Your stories have received ${encouragementImpact.total} response${
                      encouragementImpact.total === 1 ? "" : "s"
                    }.`
                  : "Responses to your stories will appear here."
              }
            />

            <JourneyPathStep
              active={myGodDidItMoments.length > 0}
              number="04"
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="God Did It"
              text={
                myGodDidItMoments.length > 0
                  ? `${myGodDidItMoments.length} of your prayer request${
                      myGodDidItMoments.length === 1 ? " has" : "s have"
                    } been marked answered.`
                  : "Answered prayer moments will appear here."
              }
            />

            <JourneyPathStep
              active={encouragementImpact.encouraged > 0}
              number="05"
              icon={<Flame className="h-5 w-5" />}
              title="Someone else was strengthened"
              text={
                encouragementImpact.encouraged > 0
                  ? `${encouragementImpact.encouraged} person${
                      encouragementImpact.encouraged === 1 ? " was" : "s were"
                    } encouraged by your stories.`
                  : "Encouragement impact will grow as people respond."
              }
            />
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <DashboardCard
            icon={<Users className="h-6 w-6" />}
            eyebrow="My Prayer Watchlist"
            title={`${myPrayerWatchlist.length} Prayer ${
              myPrayerWatchlist.length === 1 ? "Request" : "Requests"
            }`}
            text="These are prayer requests you joined by selecting I’m Praying."
            href="/prayer"
            button="View Prayer"
          />

          <DashboardCard
            icon={<CheckCircle2 className="h-6 w-6" />}
            eyebrow="My God Did It Moments"
            title={`${myGodDidItMoments.length} Answered`}
            text="These are your prayer requests that have been marked answered."
            href="/answered"
            button="View Answered"
          />

          <DashboardCard
            icon={<MessageCircleHeart className="h-6 w-6" />}
            eyebrow="Encouragement Impact"
            title={`${encouragementImpact.total} Responses`}
            text={`Amen: ${encouragementImpact.amen} • Praise God: ${encouragementImpact.praiseGod} • Encouraged: ${encouragementImpact.encouraged} • Praying: ${encouragementImpact.praying}`}
            href="/feed"
            button="Open Feed"
          />

          <DashboardCard
            icon={<Globe2 className="h-6 w-6" />}
            eyebrow="Movement View"
            title="Testimony Map"
            text="See where stories, prayers, videos, and answered prayers are being shared."
            href="/map"
            button="Open Map"
          />
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <NotebookPen className="h-6 w-6" />
            </div>

            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">
                Reflection Room
              </div>
              <h2 className="text-2xl font-black text-[#062a57]">
                What do you want to remember?
              </h2>
            </div>
          </div>

          <textarea
            value={reflection}
            onChange={(event) => saveReflection(event.target.value)}
            placeholder="Write a private reflection, prayer note, or testimony reminder..."
            className="min-h-40 w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-base leading-7 text-slate-700 outline-none transition focus:border-blue-200 focus:bg-white focus:ring-4 focus:ring-blue-50"
          />

          <p className="mt-3 text-sm font-semibold text-slate-500">
            Saved on this device.
          </p>
        </section>

        <section className="rounded-[2rem] bg-gradient-to-br from-[#082f63] to-[#0b63ce] p-6 text-white shadow-sm">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-black text-blue-100">
            <Trophy className="h-4 w-4" />
            Keep going
          </div>

          <h2 className="text-3xl font-black tracking-tight">
            One story can strengthen another person’s journey.
          </h2>

          <p className="mt-3 leading-7 text-blue-100">
            Share what God did, stand with someone in prayer, or write down what
            you want to remember.
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/share-your-story"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-[#082f63] hover:bg-blue-50"
            >
              Share What God Did
              <Send className="h-4 w-4" />
            </Link>

            <Link
              href="/videos"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm font-black text-white ring-1 ring-white/20 hover:bg-white/15"
            >
              Watch Testimonies
              <Play className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>

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

function MiniStat({
  number,
  label,
}: {
  number: string | number;
  label: string;
}) {
  return (
    <div className="rounded-2xl bg-white/10 p-3 text-center ring-1 ring-white/15">
      <div className="text-2xl font-black">{number}</div>
      <div className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-blue-100">
        {label}
      </div>
    </div>
  );
}

function MiniUploadStat({
  number,
  label,
}: {
  number: string | number;
  label: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3 text-center ring-1 ring-slate-100">
      <div className="text-xl font-black text-[#062a57]">{number}</div>
      <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
    </div>
  );
}

function MyUploadCard({
  story,
  removing,
  clearingRemoved,
  onEdit,
  onRemove,
  onClearRemoved,
}: {
  story: StoryRow;
  removing: boolean;
  clearingRemoved: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onClearRemoved: () => void;
}) {
  const isRemoved = story.status === "removed";
  const isApproved = story.status === "approved";
  const hasVideo = Boolean(story.video_url);

  const preview =
    story.story_text?.trim() ||
    story.story_type ||
    "No description added yet.";

  return (
    <article className="rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StoryStatusBadge status={story.status} />

            {hasVideo && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-black text-[#0b63ce] ring-1 ring-blue-100">
                <Video className="h-3 w-3" />
                Video
              </span>
            )}
          </div>

          <div className="mt-2 text-sm font-black text-[#062a57]">
            {story.story_type || "HTBF Upload"}
          </div>

          <div className="mt-1 text-xs font-bold text-slate-500">
            Submitted {formatShortDate(story.created_at)}
            {story.edited_at ? ` • Edited ${formatShortDate(story.edited_at)}` : ""}
          </div>
        </div>
      </div>

      <p
        className="whitespace-pre-line text-sm font-semibold leading-6 text-slate-700"
        style={{
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {preview.length > 220 ? `${preview.slice(0, 220)}...` : preview}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onEdit}
          disabled={isRemoved}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-[#082f63] ring-1 ring-slate-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <NotebookPen className="h-4 w-4" />
          Edit
        </button>

        {isApproved && hasVideo && (
          <Link
            href={`/video-feed?story=${story.id}&from=control-center`}
            className="inline-flex items-center gap-2 rounded-full bg-[#0b63ce] px-4 py-2 text-sm font-black text-white hover:bg-[#084f9f]"
          >
            <Play className="h-4 w-4" />
            View
          </Link>
        )}

        {!isRemoved && (
          <button
            type="button"
            onClick={onRemove}
            disabled={removing}
            className="inline-flex items-center gap-2 rounded-full bg-red-50 px-4 py-2 text-sm font-black text-red-700 ring-1 ring-red-100 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            {removing ? "Removing..." : "Remove"}
          </button>
        )}

        {isRemoved && (
          <button
            type="button"
            onClick={onClearRemoved}
            disabled={clearingRemoved}
            className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            {clearingRemoved ? "Deleting..." : "Delete Forever"}
          </button>
        )}
      </div>
    </article>
  );
}

function StoryStatusBadge({ status }: { status: string | null }) {
  const normalized = status || "pending";

  const style =
    normalized === "approved"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : normalized === "removed"
        ? "bg-red-50 text-red-700 ring-red-100"
        : "bg-amber-50 text-amber-700 ring-amber-100";

  const label =
    normalized === "approved"
      ? "Approved"
      : normalized === "removed"
        ? "Removed"
        : "Pending";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-[11px] font-black ring-1 ${style}`}
    >
      {label}
    </span>
  );
}

function formatShortDate(value: string | null) {
  if (!value) return "";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function MissionButton({
  href,
  icon,
  title,
  text,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-100 transition hover:bg-blue-50"
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#0b63ce] shadow-sm ring-1 ring-slate-100">
        {icon}
      </div>

      <div className="font-black text-[#062a57]">{title}</div>
      <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
    </Link>
  );
}

function JourneyPathStep({
  active,
  number,
  icon,
  title,
  text,
}: {
  active: boolean;
  number: string;
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div
      className={`flex gap-4 rounded-[1.5rem] p-4 ring-1 ${
        active
          ? "bg-blue-50 ring-blue-100"
          : "bg-slate-50 ring-slate-100"
      }`}
    >
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ring-1 ${
          active
            ? "bg-[#0b63ce] text-white ring-blue-200"
            : "bg-white text-[#0b63ce] ring-slate-100"
        }`}
      >
        {icon}
      </div>

      <div>
        <div className="text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
          {number}
        </div>
        <div className="mt-1 font-black text-[#062a57]">{title}</div>
        <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
      </div>
    </div>
  );
}

function DashboardCard({
  icon,
  eyebrow,
  title,
  text,
  href,
  button,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  text: string;
  href: string;
  button: string;
}) {
  return (
    <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
        {icon}
      </div>

      <div className="text-xs font-black uppercase tracking-[0.16em] text-[#0b63ce]">
        {eyebrow}
      </div>

      <h3 className="mt-1 text-2xl font-black text-[#062a57]">{title}</h3>

      <p className="mt-2 leading-7 text-slate-600">{text}</p>

      <Link
        href={href}
        className="mt-5 inline-flex rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white hover:bg-[#084f9f]"
      >
        {button}
      </Link>
    </div>
  );
}
