"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import JourneyHeader from "../../components/journey/JourneyHeader";
import JourneyHero from "../../components/journey/JourneyHero";
import JourneyMetrics from "../../components/journey/JourneyMetrics";
import JourneyQuickActions from "../../components/journey/JourneyQuickActions";
import JourneyInboxCard from "../../components/journey/JourneyInboxCard";
import JourneyManagementCard from "../../components/journey/JourneyManagementCard";
import JourneyMilestonePath from "../../components/journey/JourneyMilestonePath";
import JourneyImpactCards from "../../components/journey/JourneyImpactCards";
import JourneyReflectionCard from "../../components/journey/JourneyReflectionCard";
import JourneyKeepGoingCard from "../../components/journey/JourneyKeepGoingCard";
import JourneyUploadsWorkspace from "../../components/journey/uploads/JourneyUploadsWorkspace";
import styles from "../../components/journey/JourneyDashboard.module.css";
import { supabase } from "../../lib/supabaseClient";
import {
  resolveStoryMediaUrl,
  STORY_IMAGE_BUCKET,
  STORY_VIDEO_BUCKET,
} from "../../lib/journey/uploads/media";

type StoryRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  video_url: string | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
  signed_image_url?: string | null;
  signed_video_url?: string | null;
  signed_thumbnail_url?: string | null;
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
  const [removeRequest, setRemoveRequest] = useState<StoryRow | null>(null);

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
        "id, user_id, name, location, story_type, story_text, image_url, video_url, thumbnail_url, status, prayer_status, answered_text, created_at, edited_at, removed_at"
      )
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      setMessage(`Could not load your uploads: ${error.message}`);
      return;
    }

    const rows = (data as StoryRow[]) ?? [];

    const resolved = await Promise.all(
      rows.map(async (story) => ({
        ...story,
        signed_image_url: await resolveStoryMediaUrl(
          story.image_url ?? null,
          STORY_IMAGE_BUCKET
        ),
        signed_thumbnail_url: await resolveStoryMediaUrl(
          story.thumbnail_url ?? null,
          STORY_IMAGE_BUCKET
        ),
        signed_video_url: await resolveStoryMediaUrl(
          story.video_url,
          STORY_VIDEO_BUCKET
        ),
      }))
    );

    setMyUploads(resolved);
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

    setRemovingStoryId(story.id);
    setMessage("");

    const { error } = await supabase.rpc("remove_my_story", {
      story_id: story.id,
    });

    setRemovingStoryId(null);
    setRemoveRequest(null);

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
      <main className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.sectionCard} role="status">
            Loading your Journey...
          </div>
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
              onOpenControlCenter={openControlCenter}
              uploadCount={uploadTotals.total}
            />
          </div>

          <JourneyMilestonePath
            myStoriesCount={myStories.length}
            encouragementTotal={encouragementImpact.total}
            encouragementEncouraged={encouragementImpact.encouraged}
            godDidItCount={myGodDidItMoments.length}
          />

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


      <JourneyUploadsWorkspace
        open={controlCenterOpen}
        onClose={() => setControlCenterOpen(false)}
        uploads={myUploads}
        reactions={reactions}
        encouragementImpact={encouragementImpact}
        removingStoryId={removingStoryId}
        clearingRemovedStoryId={clearingRemovedStoryId}
        clearingAllRemoved={clearingAllRemoved}
        editingStory={editingStory}
        editStoryText={editStoryText}
        savingStoryEdit={savingStoryEdit}
        onEditTextChange={setEditStoryText}
        onStartEdit={startEditingStory}
        onCancelEdit={() => {
          setEditingStory(null);
          setEditStoryText("");
        }}
        onSaveEdit={() => void saveStoryEdit()}
        onRequestRemove={(upload) => {
          setMessage("");
          setRemoveRequest(upload);
        }}
        onRequestDeleteForever={clearRemovedUpload}
        onRequestDeleteAllRemoved={clearAllRemovedUploads}
        removeRequest={removeRequest}
        deleteRequest={
          clearRemovedRequest?.mode === "single"
            ? clearRemovedRequest.story
            : null
        }
        deleteAllRequestOpen={clearRemovedRequest?.mode === "all"}
        onCancelRemove={() => setRemoveRequest(null)}
        onCancelDelete={closeClearRemovedModal}
        onCancelDeleteAll={closeClearRemovedModal}
        onConfirmRemove={() => {
          if (removeRequest) void removeMyUpload(removeRequest);
        }}
        onConfirmDelete={() => void confirmClearRemovedUploads()}
        onConfirmDeleteAll={() => void confirmClearRemovedUploads()}
      />
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
