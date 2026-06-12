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
  Reply,
  Trash2,
  UserCircle,
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

type JourneyInboxTab = "received" | "sent" | "all";

type VideoReplyRow = {
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

type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  real_name: string | null;
};

export default function JourneyPage() {
  const [checkingUser, setCheckingUser] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [myUploads, setMyUploads] = useState<StoryRow[]>([]);
  const [reactions, setReactions] = useState<ReactionRow[]>([]);
  const [reflection, setReflection] = useState("");
  const [message, setMessage] = useState("");

  const [inboxOpen, setInboxOpen] = useState(false);
  const [controlCenterOpen, setControlCenterOpen] = useState(false);

  const [activeInboxTab, setActiveInboxTab] =
    useState<JourneyInboxTab>("received");
  const [videoReplies, setVideoReplies] = useState<VideoReplyRow[]>([]);
  const [replyProfiles, setReplyProfiles] = useState<Record<string, ProfileRow>>(
    {}
  );
  const [replyTarget, setReplyTarget] = useState<VideoReplyRow | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  const [editingStory, setEditingStory] = useState<StoryRow | null>(null);
  const [editStoryText, setEditStoryText] = useState("");
  const [savingStoryEdit, setSavingStoryEdit] = useState(false);
  const [removingStoryId, setRemovingStoryId] = useState<string | null>(null);
  const [clearingRemovedStoryId, setClearingRemovedStoryId] = useState<
    string | null
  >(null);
  const [clearingAllRemoved, setClearingAllRemoved] = useState(false);

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

      await loadVideoReplies(user.id);

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
          table: "story_video_replies",
        },
        async () => {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (user) {
            await loadVideoReplies(user.id);
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

  async function loadVideoReplies(currentUserId: string) {
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

    const visibleReplies = ((data as VideoReplyRow[]) ?? []).filter((reply) => {
      const hiddenFromSender =
        reply.user_id === currentUserId && reply.deleted_by_sender === true;

      const hiddenFromRecipient =
        reply.recipient_user_id === currentUserId &&
        reply.deleted_by_recipient === true;

      return !hiddenFromSender && !hiddenFromRecipient;
    });

    setVideoReplies(visibleReplies);

    const profileIds = Array.from(
      new Set(
        visibleReplies
          .flatMap((reply) => [reply.user_id, reply.recipient_user_id])
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

      setReplyProfiles(nextProfiles);
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

  const receivedReplies = useMemo(() => {
    return videoReplies.filter((reply) => reply.recipient_user_id === userId);
  }, [videoReplies, userId]);

  const sentReplies = useMemo(() => {
    return videoReplies.filter((reply) => reply.user_id === userId);
  }, [videoReplies, userId]);

  const unreadInboxCount = useMemo(() => {
    return videoReplies.filter(
      (reply) => reply.recipient_user_id === userId && !reply.read_at
    ).length;
  }, [videoReplies, userId]);

  const filteredInboxReplies = useMemo(() => {
    if (activeInboxTab === "received") return receivedReplies;
    if (activeInboxTab === "sent") return sentReplies;
    return videoReplies;
  }, [activeInboxTab, receivedReplies, sentReplies, videoReplies]);

  function getProfileName(profileId: string | null) {
    if (!profileId) return "HTBF Community";

    const profile = replyProfiles[profileId];

    return (
      profile?.display_name?.trim() ||
      profile?.username?.trim() ||
      profile?.real_name?.trim() ||
      "HTBF Community"
    );
  }

  function getReplyLabel(reply: VideoReplyRow) {
    if (!userId) return "Message";

    if (reply.user_id === userId) {
      return `To ${getProfileName(reply.recipient_user_id)}`;
    }

    return `From ${getProfileName(reply.user_id)}`;
  }

  function getOtherPerson(reply: VideoReplyRow) {
    if (!userId) return "HTBF Community";

    if (reply.user_id === userId) {
      return getProfileName(reply.recipient_user_id);
    }

    return getProfileName(reply.user_id);
  }

  function getStoryPreview(storyId: string | null) {
    if (!storyId) return "Video testimony";

    const story =
      stories.find((item) => item.id === storyId) ||
      myUploads.find((item) => item.id === storyId);

    if (!story) return "Video testimony";

    return story.story_text || story.story_type || "Video testimony";
  }

  async function openInbox() {
    setInboxOpen(true);
    setMessage("");

    if (!userId) return;

    const unreadReplies = videoReplies.filter(
      (reply) => reply.recipient_user_id === userId && !reply.read_at
    );

    if (unreadReplies.length > 0) {
      await supabase
        .from("story_video_replies")
        .update({ read_at: new Date().toISOString() })
        .in(
          "id",
          unreadReplies.map((reply) => reply.id)
        );

      await loadVideoReplies(userId);
    }
  }

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

  async function clearRemovedUpload(story: StoryRow) {
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

    const confirmed = window.confirm(
      "This will permanently remove these removed items from your uploads list. Continue?"
    );

    if (!confirmed) return;

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
  }

  async function clearAllRemovedUploads() {
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

    const confirmed = window.confirm(
      "This will permanently remove these removed items from your uploads list. Continue?"
    );

    if (!confirmed) return;

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

    await loadVideoReplies(userId);
  }

  async function deleteReply(reply: VideoReplyRow) {
    if (!userId) return;

    const confirmed = window.confirm(
      "Delete this message from your Journey inbox? This only hides it from your side."
    );

    if (!confirmed) return;

    const updateData: {
      deleted_by_sender?: boolean;
      deleted_by_recipient?: boolean;
    } = {};

    if (reply.user_id === userId) {
      updateData.deleted_by_sender = true;
    }

    if (reply.recipient_user_id === userId) {
      updateData.deleted_by_recipient = true;
    }

    const { error } = await supabase
      .from("story_video_replies")
      .update(updateData)
      .eq("id", reply.id);

    if (error) {
      setMessage(`Could not delete message: ${error.message}`);
      return;
    }

    setVideoReplies((currentReplies) =>
      currentReplies.filter((item) => item.id !== reply.id)
    );

    setMessage("Message deleted from your Journey inbox.");
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
                My Control Center
              </div>
              <h2 className="text-2xl font-black text-[#062a57]">
                Manage my uploads
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

        <button
          type="button"
          onClick={openInbox}
          className="w-full rounded-[2rem] bg-white p-5 text-left shadow-sm ring-1 ring-slate-200 transition hover:bg-blue-50"
        >
          <div className="flex items-center gap-3">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
              <Inbox className="h-6 w-6" />
              {unreadInboxCount > 0 && (
                <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">
                  {unreadInboxCount}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-sm font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                Journey Inbox
              </div>
              <h2 className="text-2xl font-black text-[#062a57]">
                Video responses and encouragement
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {receivedReplies.length === 0
                  ? "Messages people send from your videos will appear here."
                  : `${receivedReplies.length} received message${
                      receivedReplies.length === 1 ? "" : "s"
                    } connected to video testimonies.`}
              </p>
            </div>

            <ChevronRight className="h-5 w-5 text-slate-400" />
          </div>
        </button>

        {inboxOpen && (
          <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                  Inbox
                </div>
                <h2 className="text-2xl font-black text-[#062a57]">
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
              <InboxTabButton
                label="Received"
                active={activeInboxTab === "received"}
                onClick={() => setActiveInboxTab("received")}
              />

              <InboxTabButton
                label="Sent"
                active={activeInboxTab === "sent"}
                onClick={() => setActiveInboxTab("sent")}
              />

              <InboxTabButton
                label="All"
                active={activeInboxTab === "all"}
                onClick={() => setActiveInboxTab("all")}
              />
            </div>

            <div className="space-y-4">
              {filteredInboxReplies.length === 0 ? (
                <div className="rounded-[1.5rem] bg-slate-50 p-5 text-sm leading-6 text-slate-600 ring-1 ring-slate-200">
                  No messages here yet.
                </div>
              ) : (
                filteredInboxReplies.map((reply) => {
                  const storyPreview = getStoryPreview(reply.story_id);

                  return (
                    <article
                      key={reply.id}
                      className="rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-200"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#0b63ce] ring-1 ring-slate-200">
                            <UserCircle className="h-6 w-6" />
                          </div>

                          <div>
                            <div className="text-sm font-black text-[#062a57]">
                              {getReplyLabel(reply)}
                            </div>

                            <div className="mt-1 flex items-center gap-2 text-xs font-bold text-slate-500">
                              <Video className="h-3.5 w-3.5" />
                              {formatDate(reply.created_at)}
                            </div>
                          </div>
                        </div>

                        {reply.recipient_user_id === userId && reply.read_at && (
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
                        {reply.message}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setReplyTarget(reply);
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
                          onClick={() => deleteReply(reply)}
                          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-red-600 ring-1 ring-red-100 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>

                        {reply.story_id && (
                          <Link
                            href={`/video-feed?story=${reply.story_id}&from=journey`}
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

function InboxTabButton({
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
