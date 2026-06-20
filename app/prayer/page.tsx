"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  CheckCircle2,
  Clock,
  HeartHandshake,
  MessageCircleHeart,
  Send,
  Share2,
  Sparkles,
  UploadCloud,
  Users,
  Video,
  X,
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

type PrayerUpdate = {
  id: string;
  story_id: string;
  author_user_id: string;
  body: string;
  update_type: "update" | "answered" | "praise";
  created_at: string;
  edited_at: string | null;
  hidden_at: string | null;
};

type PublicPrayerVideoResponseRow = {
  id: string;
  story_id: string;
  user_id: string;
  video_url: string;
  body: string | null;
  status: string;
  created_at: string;
  hidden_at: string | null;
  removed_at: string | null;
};

type PublicPrayerVideoResponse = PublicPrayerVideoResponseRow & {
  signed_video_url: string | null;
  author_name: string | null;
};

type ProfileSummary = {
  id: string;
  display_name: string | null;
  username: string | null;
};

type PrayerStory = PrayerStoryRow & {
  reaction_counts: {
    amen: number;
    praise_god: number;
    encouraged: number;
    praying: number;
  };
  user_reactions: ReactionType[];
  updates: PrayerUpdate[];
  public_video_responses: PublicPrayerVideoResponse[];
};

const PRAYER_VIDEO_BUCKET = "story-videos";
const MAX_PRAYER_VIDEO_SECONDS = 30;
const PRAYER_NOTIFICATION_FILTER =
  "category.eq.prayer,message_type.in.(prayer_update,answered_prayer,prayer_circle,prayer_video_response)";

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

function isPrayerUpdate(value: unknown): value is PrayerUpdate {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.story_id === "string" &&
    typeof value.author_user_id === "string" &&
    typeof value.body === "string" &&
    (value.update_type === "update" ||
      value.update_type === "answered" ||
      value.update_type === "praise") &&
    typeof value.created_at === "string" &&
    (typeof value.edited_at === "string" || value.edited_at === null) &&
    (typeof value.hidden_at === "string" || value.hidden_at === null)
  );
}

function isPublicPrayerVideoResponseRow(
  value: unknown
): value is PublicPrayerVideoResponseRow {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.story_id === "string" &&
    typeof value.user_id === "string" &&
    typeof value.video_url === "string" &&
    (typeof value.body === "string" || value.body === null) &&
    typeof value.status === "string" &&
    typeof value.created_at === "string" &&
    (typeof value.hidden_at === "string" || value.hidden_at === null) &&
    (typeof value.removed_at === "string" || value.removed_at === null)
  );
}

function isProfileSummary(value: unknown): value is ProfileSummary {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    (typeof value.display_name === "string" || value.display_name === null) &&
    (typeof value.username === "string" || value.username === null)
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
  if (count === 1) return "🙏 1 person is praying for this request";
  return `🙏 ${count} people are praying for this request`;
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read video duration."));
    };
    video.src = url;
  });
}

function getPrayerVideoStoragePath(videoUrl: string) {
  if (videoUrl.includes("story-videos/")) {
    const afterBucket = videoUrl.split("story-videos/")[1];
    const pathOnly = afterBucket.split("?")[0];

    try {
      return decodeURIComponent(pathOnly);
    } catch {
      return pathOnly;
    }
  }

  if (videoUrl.startsWith("http")) return null;

  return videoUrl.replace(/^\/+/, "");
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
  const [updatingStory, setUpdatingStory] = useState<PrayerStory | null>(null);
  const [prayerMomentStory, setPrayerMomentStory] =
    useState<PrayerStory | null>(null);
  const [answeredPrayerText, setAnsweredPrayerText] = useState("");
  const [prayerUpdateText, setPrayerUpdateText] = useState("");
  const [savingPrayerUpdate, setSavingPrayerUpdate] = useState(false);
  const [prayerVideoStory, setPrayerVideoStory] = useState<PrayerStory | null>(
    null
  );
  const [prayerVideoFile, setPrayerVideoFile] = useState<File | null>(null);
  const [prayerVideoPreviewUrl, setPrayerVideoPreviewUrl] = useState("");
  const [prayerVideoDuration, setPrayerVideoDuration] = useState<number | null>(
    null
  );
  const [prayerVideoError, setPrayerVideoError] = useState("");
  const [sendingPrayerVideo, setSendingPrayerVideo] = useState(false);
  const [publicResponseStory, setPublicResponseStory] =
    useState<PrayerStory | null>(null);
  const [publicResponseFile, setPublicResponseFile] = useState<File | null>(
    null
  );
  const [publicResponsePreviewUrl, setPublicResponsePreviewUrl] = useState("");
  const [publicResponseDuration, setPublicResponseDuration] = useState<
    number | null
  >(null);
  const [publicResponseError, setPublicResponseError] = useState("");
  const [submittingPublicResponse, setSubmittingPublicResponse] =
    useState(false);
  const [unreadPrayerCount, setUnreadPrayerCount] = useState(0);
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
      let prayerUpdates: PrayerUpdate[] = [];
      let publicVideoResponses: PublicPrayerVideoResponse[] = [];

      if (storyIds.length > 0) {
        const [reactionResult, updateResult, publicResponseResult] =
          await Promise.all([
            supabase
              .from("story_reactions")
              .select("story_id, user_id, reaction_type")
              .in("story_id", storyIds),
            supabase
              .from("prayer_updates")
              .select(
                "id, story_id, author_user_id, body, update_type, created_at, edited_at, hidden_at"
              )
              .in("story_id", storyIds)
              .is("hidden_at", null)
              .order("created_at", { ascending: true }),
            supabase
              .from("prayer_video_responses")
              .select(
                "id, story_id, user_id, video_url, body, status, created_at, hidden_at, removed_at"
              )
              .in("story_id", storyIds)
              .eq("status", "approved")
              .is("hidden_at", null)
              .is("removed_at", null)
              .order("created_at", { ascending: true }),
          ]);

        reactions = (
          Array.isArray(reactionResult.data) ? reactionResult.data : []
        ).filter(isReactionRow);

        if (updateResult.error) {
          console.error("Could not load prayer updates:", updateResult.error);
        } else {
          prayerUpdates = (
            Array.isArray(updateResult.data) ? updateResult.data : []
          ).filter(isPrayerUpdate);
        }

        if (publicResponseResult.error) {
          console.error(
            "Could not load public prayer video responses:",
            publicResponseResult.error
          );
        } else {
          const responseRows = (
            Array.isArray(publicResponseResult.data)
              ? publicResponseResult.data
              : []
          ).filter(isPublicPrayerVideoResponseRow);
          const responseAuthorIds = Array.from(
            new Set(responseRows.map((response) => response.user_id))
          );
          const profileMap = new Map<string, ProfileSummary>();

          if (responseAuthorIds.length > 0) {
            const { data: profileData, error: profileError } = await supabase
              .from("profiles")
              .select("id, display_name, username")
              .in("id", responseAuthorIds);

            if (profileError) {
              console.error(
                "Could not load public response authors:",
                profileError
              );
            } else {
              (Array.isArray(profileData) ? profileData : [])
                .filter(isProfileSummary)
                .forEach((profile) => profileMap.set(profile.id, profile));
            }
          }

          publicVideoResponses = await Promise.all(
            responseRows.map(async (response) => {
              let signedVideoUrl: string | null = null;

              if (response.video_url.startsWith("http")) {
                signedVideoUrl = response.video_url;
              } else {
                const storagePath = getPrayerVideoStoragePath(
                  response.video_url
                );

                if (storagePath) {
                  const { data: signedData, error: signedError } =
                    await supabase.storage
                      .from(PRAYER_VIDEO_BUCKET)
                      .createSignedUrl(storagePath, 60 * 60);

                  if (signedError) {
                    console.error(
                      "Could not load public prayer response video:",
                      signedError
                    );
                  } else {
                    signedVideoUrl = signedData?.signedUrl ?? null;
                  }
                }
              }

              const profile = profileMap.get(response.user_id);

              return {
                ...response,
                signed_video_url: signedVideoUrl,
                author_name:
                  profile?.display_name || profile?.username || null,
              };
            })
          );
        }
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
          updates: prayerUpdates.filter(
            (update) => update.story_id === story.id
          ),
          public_video_responses: publicVideoResponses.filter(
            (response) => response.story_id === story.id
          ),
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

  useEffect(() => {
    return () => {
      if (prayerVideoPreviewUrl) {
        URL.revokeObjectURL(prayerVideoPreviewUrl);
      }
    };
  }, [prayerVideoPreviewUrl]);

  useEffect(() => {
    return () => {
      if (publicResponsePreviewUrl) {
        URL.revokeObjectURL(publicResponsePreviewUrl);
      }
    };
  }, [publicResponsePreviewUrl]);

  useEffect(() => {
    if (!userId) {
      setUnreadPrayerCount(0);
      return;
    }

    let cancelled = false;

    async function loadUnreadPrayerCount() {
      const { count, error } = await supabase
        .from("inbox_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("read", false)
        .is("hidden_at", null)
        .or(PRAYER_NOTIFICATION_FILTER);

      if (cancelled) return;

      if (error) {
        console.error("Could not load unread prayer updates:", error);
        return;
      }

      setUnreadPrayerCount(count ?? 0);
    }

    void loadUnreadPrayerCount();
    const pollId = window.setInterval(() => {
      void loadUnreadPrayerCount();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [userId]);

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

  function openPrayerUpdateModal(story: PrayerStory) {
    if (!userId || story.user_id !== userId) {
      setMessage("Only the person who shared this prayer can post an update.");
      return;
    }

    setUpdatingStory(story);
    setPrayerUpdateText("");
    setMessage("");
  }

  function closePrayerUpdateModal() {
    if (savingPrayerUpdate) return;

    setUpdatingStory(null);
    setPrayerUpdateText("");
  }

  async function notifyPrayerCircleOfUpdate(
    story: PrayerStory,
    prayerUpdateId: string
  ) {
    if (!userId || story.user_id !== userId) return true;

    const { data: reactionData, error: reactionError } = await supabase
      .from("story_reactions")
      .select("user_id")
      .eq("story_id", story.id)
      .eq("reaction_type", "praying");

    if (reactionError) {
      console.error("Could not load Prayer Circle members:", reactionError);
      return false;
    }

    const prayerCircleUserIds = Array.from(
      new Set(
        (Array.isArray(reactionData) ? reactionData : [])
          .map((reaction) =>
            isRecord(reaction) ? readString(reaction.user_id) : null
          )
          .filter(
            (reactionUserId): reactionUserId is string =>
              typeof reactionUserId === "string" && reactionUserId !== userId
          )
      )
    );

    if (prayerCircleUserIds.length === 0) return true;

    const notificationRows = prayerCircleUserIds.map((recipientUserId) => ({
      user_id: recipientUserId,
      sender_user_id: userId,
      title: "A prayer you joined has an update",
      body: "The person who shared this prayer posted a new update.",
      category: "prayer",
      message_type: "prayer_update",
      story_id: story.id,
      prayer_update_id: prayerUpdateId,
      action_url: "/prayer",
      read: false,
    }));

    const { error: notificationError } = await supabase
      .from("inbox_messages")
      .insert(notificationRows);

    if (!notificationError || notificationError.code === "23505") return true;

    console.error(
      "Could not notify Prayer Circle members:",
      notificationError
    );
    return false;
  }

  async function savePrayerUpdate() {
    if (!userId || !updatingStory) return;

    if (updatingStory.user_id !== userId) {
      setMessage("Only the person who shared this prayer can post an update.");
      closePrayerUpdateModal();
      return;
    }

    const cleanUpdateText = prayerUpdateText.trim();

    if (!cleanUpdateText) {
      setMessage("Please write a prayer update before sharing.");
      return;
    }

    setSavingPrayerUpdate(true);
    setMessage("");

    const { data, error } = await supabase
      .from("prayer_updates")
      .insert({
        story_id: updatingStory.id,
        author_user_id: userId,
        body: cleanUpdateText,
        update_type: "update",
      })
      .select(
        "id, story_id, author_user_id, body, update_type, created_at, edited_at, hidden_at"
      )
      .single();

    if (error || !isPrayerUpdate(data)) {
      setSavingPrayerUpdate(false);
      setMessage(
        error
          ? `Could not share prayer update: ${error.message}`
          : "The prayer update was saved, but it could not be displayed yet."
      );
      return;
    }

    const savedUpdate = data;
    const story = updatingStory;

    setStories((currentStories) =>
      currentStories.map((currentStory) =>
        currentStory.id === story.id
          ? {
              ...currentStory,
              updates: [...currentStory.updates, savedUpdate],
            }
          : currentStory
      )
    );

    const notificationsSent = await notifyPrayerCircleOfUpdate(
      story,
      savedUpdate.id
    );

    setSavingPrayerUpdate(false);
    setUpdatingStory(null);
    setPrayerUpdateText("");
    setMessage(
      notificationsSent
        ? "Prayer Circle update shared."
        : "Prayer update shared, but some notifications could not be sent."
    );
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

  function openPrayerVideoModal(story: PrayerStory) {
    setMessage("");
    setPrayerVideoError("");

    if (!userId) {
      setMessage("Please sign in to send a prayer video.");
      return;
    }

    if (!story.user_id) {
      setMessage("This prayer request cannot receive video responses yet.");
      return;
    }

    if (story.user_id === userId) {
      setMessage("You cannot send a prayer video to your own request.");
      return;
    }

    setPrayerVideoStory(story);
    setPrayerVideoFile(null);
    setPrayerVideoDuration(null);

    if (prayerVideoPreviewUrl) {
      URL.revokeObjectURL(prayerVideoPreviewUrl);
      setPrayerVideoPreviewUrl("");
    }
  }

  function closePrayerVideoModal() {
    setPrayerVideoStory(null);
    setPrayerVideoFile(null);
    setPrayerVideoDuration(null);
    setPrayerVideoError("");
    setSendingPrayerVideo(false);

    if (prayerVideoPreviewUrl) {
      URL.revokeObjectURL(prayerVideoPreviewUrl);
      setPrayerVideoPreviewUrl("");
    }
  }

  async function handlePrayerVideoFile(file: File | null) {
    setPrayerVideoError("");
    setPrayerVideoFile(null);
    setPrayerVideoDuration(null);

    if (prayerVideoPreviewUrl) {
      URL.revokeObjectURL(prayerVideoPreviewUrl);
      setPrayerVideoPreviewUrl("");
    }

    if (!file) return;

    if (!file.type.startsWith("video/")) {
      setPrayerVideoError("Please choose a video file.");
      return;
    }

    try {
      const duration = await getVideoDuration(file);

      if (duration > MAX_PRAYER_VIDEO_SECONDS + 0.5) {
        setPrayerVideoError(
          prayerVideoStory && isAnswered(prayerVideoStory)
            ? "Praise videos must be 30 seconds or less."
            : "Prayer videos must be 30 seconds or less."
        );
        return;
      }

      setPrayerVideoDuration(duration);
      setPrayerVideoFile(file);
      setPrayerVideoPreviewUrl(URL.createObjectURL(file));
    } catch (error) {
      console.error("Could not validate prayer video:", error);
      setPrayerVideoError(
        "Could not read this video. Please choose another one."
      );
    }
  }

  async function sendPrayerVideo() {
    setPrayerVideoError("");
    setMessage("");

    if (!userId) {
      setPrayerVideoError("Please sign in to send a prayer video.");
      return;
    }

    if (!prayerVideoStory || !prayerVideoStory.user_id) {
      setPrayerVideoError("Could not find the prayer request owner.");
      return;
    }

    if (prayerVideoStory.user_id === userId) {
      setPrayerVideoError("You cannot send a prayer video to your own request.");
      return;
    }

    if (!prayerVideoFile) {
      setPrayerVideoError("Choose or record a video first.");
      return;
    }

    const sendingPraiseVideo = isAnswered(prayerVideoStory);
    setSendingPrayerVideo(true);

    const extension =
      prayerVideoFile.name.split(".").pop()?.toLowerCase() || "mp4";
    const path = `prayer-videos/${prayerVideoStory.id}/${userId}-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(PRAYER_VIDEO_BUCKET)
      .upload(path, prayerVideoFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: prayerVideoFile.type,
      });

    if (uploadError) {
      setSendingPrayerVideo(false);
      setPrayerVideoError(
        `Could not upload prayer video: ${uploadError.message}`
      );
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from(PRAYER_VIDEO_BUCKET)
      .getPublicUrl(path);

    const videoUrl = publicUrlData.publicUrl;

    const { error: inboxError } = await supabase.from("inbox_messages").insert({
      user_id: prayerVideoStory.user_id,
      sender_user_id: userId,
      title: sendingPraiseVideo
        ? "Someone sent you a praise video"
        : "Someone sent you a prayer video",
      body: sendingPraiseVideo
        ? "A believer celebrated your answered prayer with you."
        : "A believer prayed for your request.",
      category: "prayer",
      message_type: "prayer_video_response",
      story_id: prayerVideoStory.id,
      action_url: "/journey/inbox",
      video_url: videoUrl,
      read: false,
    });

    if (inboxError) {
      setSendingPrayerVideo(false);
      setPrayerVideoError(
        `Video uploaded, but inbox message failed: ${inboxError.message}`
      );
      return;
    }

    if (
      !sendingPraiseVideo &&
      !prayerVideoStory.user_reactions.includes("praying")
    ) {
      await toggleReaction(prayerVideoStory.id, "praying", {
        showPrayingMessage: false,
      });
    }

    closePrayerVideoModal();
    setMessage(
      sendingPraiseVideo
        ? "Praise video sent privately to their Journey Inbox."
        : "Prayer video sent privately to their Journey Inbox."
    );
  }

  function openPublicResponseModal(story: PrayerStory) {
    setMessage("");
    setPublicResponseError("");

    if (!userId) {
      setMessage("Please sign in to share a public prayer response.");
      return;
    }

    if (!story.user_id) {
      setMessage("Public responses are unavailable for this request.");
      return;
    }

    if (story.user_id === userId) {
      setMessage("You cannot add a public response to your own prayer request.");
      return;
    }

    setPublicResponseStory(story);
    setPublicResponseFile(null);
    setPublicResponseDuration(null);

    if (publicResponsePreviewUrl) {
      URL.revokeObjectURL(publicResponsePreviewUrl);
      setPublicResponsePreviewUrl("");
    }
  }

  function closePublicResponseModal() {
    if (submittingPublicResponse) return;

    resetPublicResponseModal();
  }

  function resetPublicResponseModal() {
    setPublicResponseStory(null);
    setPublicResponseFile(null);
    setPublicResponseDuration(null);
    setPublicResponseError("");

    if (publicResponsePreviewUrl) {
      URL.revokeObjectURL(publicResponsePreviewUrl);
      setPublicResponsePreviewUrl("");
    }
  }

  async function handlePublicResponseFile(file: File | null) {
    setPublicResponseError("");
    setPublicResponseFile(null);
    setPublicResponseDuration(null);

    if (publicResponsePreviewUrl) {
      URL.revokeObjectURL(publicResponsePreviewUrl);
      setPublicResponsePreviewUrl("");
    }

    if (!file) return;

    if (!file.type.startsWith("video/")) {
      setPublicResponseError("Please choose a video file.");
      return;
    }

    try {
      const duration = await getVideoDuration(file);

      if (duration > MAX_PRAYER_VIDEO_SECONDS + 0.5) {
        setPublicResponseError(
          "Public prayer response videos must be 30 seconds or less."
        );
        return;
      }

      setPublicResponseDuration(duration);
      setPublicResponseFile(file);
      setPublicResponsePreviewUrl(URL.createObjectURL(file));
    } catch (error) {
      console.error("Could not validate public prayer response:", error);
      setPublicResponseError(
        "Could not read this video. Please choose another one."
      );
    }
  }

  async function submitPublicResponse() {
    setPublicResponseError("");

    if (!userId || !publicResponseStory) {
      setPublicResponseError("Please sign in to share a public response.");
      return;
    }

    if (!publicResponseStory.user_id) {
      setPublicResponseError(
        "Public responses are unavailable for this request."
      );
      return;
    }

    if (publicResponseStory.user_id === userId) {
      setPublicResponseError(
        "You cannot add a public response to your own prayer request."
      );
      return;
    }

    if (!publicResponseFile) {
      setPublicResponseError("Choose or record a video first.");
      return;
    }

    setSubmittingPublicResponse(true);

    const rawExtension =
      publicResponseFile.name.split(".").pop()?.toLowerCase() || "mp4";
    const extension = rawExtension.replace(/[^a-z0-9]/g, "") || "mp4";
    const storagePath = `prayer-public-responses/${publicResponseStory.id}/${userId}-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(PRAYER_VIDEO_BUCKET)
      .upload(storagePath, publicResponseFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: publicResponseFile.type,
      });

    if (uploadError) {
      setSubmittingPublicResponse(false);
      setPublicResponseError(
        `Could not upload public response: ${uploadError.message}`
      );
      return;
    }

    const { error: insertError } = await supabase.rpc(
      "submit_prayer_video_response",
      {
        prayer_story_id: publicResponseStory.id,
        response_video_url: storagePath,
        response_body: null,
      }
    );

    if (insertError) {
      await supabase.storage
        .from(PRAYER_VIDEO_BUCKET)
        .remove([storagePath]);
      setSubmittingPublicResponse(false);
      setPublicResponseError(
        `Could not submit public response: ${insertError.message}`
      );
      return;
    }

    setSubmittingPublicResponse(false);
    resetPublicResponseModal();
    setMessage("Public prayer response submitted for review.");
  }

  async function removePublicResponse(responseId: string) {
    if (!window.confirm("Remove your public prayer response?")) return;

    const { error } = await supabase.rpc(
      "remove_my_prayer_video_response",
      { response_id: responseId }
    );

    if (error) {
      setMessage(`Could not remove public response: ${error.message}`);
      return;
    }

    removePublicResponseFromView(responseId);
    setMessage("Public prayer response removed.");
  }

  async function hidePublicResponse(responseId: string) {
    if (!window.confirm("Hide this public response from your prayer?")) return;

    const { error } = await supabase.rpc("hide_prayer_video_response", {
      response_id: responseId,
    });

    if (error) {
      setMessage(`Could not hide public response: ${error.message}`);
      return;
    }

    removePublicResponseFromView(responseId);
    setMessage("Public prayer response hidden.");
  }

  function removePublicResponseFromView(responseId: string) {
    setStories((currentStories) =>
      currentStories.map((story) => ({
        ...story,
        public_video_responses: story.public_video_responses.filter(
          (response) => response.id !== responseId
        ),
      }))
    );
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

          <div className="flex items-center gap-2">
            <div className="hidden text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce] sm:block">
              Prayer
            </div>
            <Link
              href="/notifications?category=prayer"
              className="relative inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100 transition hover:bg-blue-100"
            >
              <Bell className="h-4 w-4" />
              <span>Prayer Updates</span>
              {unreadPrayerCount > 0 && (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                  {unreadPrayerCount > 99 ? "99+" : unreadPrayerCount}
                </span>
              )}
            </Link>
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
                    owner={isOriginalPoster(story)}
                    currentUserId={userId}
                    onSendPraiseVideo={() => openPrayerVideoModal(story)}
                    onShare={() => shareStory(story)}
                    onAddUpdate={() => openPrayerUpdateModal(story)}
                    onRemovePublicResponse={removePublicResponse}
                    onHidePublicResponse={hidePublicResponse}
                  />
                ) : (
                  <PrayerRequestCard
                    key={story.id}
                    story={story}
                    owner={isOriginalPoster(story)}
                    onPray={() => handlePrayNow(story)}
                    onEncourage={() => toggleReaction(story.id, "encouraged")}
                    onSendPrayerVideo={() => openPrayerVideoModal(story)}
                    onSharePublicResponse={() =>
                      openPublicResponseModal(story)
                    }
                    onShare={() => shareStory(story)}
                    onAddUpdate={() => openPrayerUpdateModal(story)}
                    currentUserId={userId}
                    onRemovePublicResponse={removePublicResponse}
                    onHidePublicResponse={hidePublicResponse}
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

      {prayerVideoStory && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="flex min-h-full items-end sm:items-center sm:justify-center">
            <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.22em] text-[#0b63ce]">
                    {isAnswered(prayerVideoStory)
                      ? "PRAISE VIDEO"
                      : "PRAYER VIDEO"}
                  </div>
                  <h3 className="mt-2 text-2xl font-black leading-tight text-[#062a57]">
                    {isAnswered(prayerVideoStory)
                      ? "Send a private praise video"
                      : "Send a private prayer video"}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={closePrayerVideoModal}
                  disabled={sendingPrayerVideo}
                  className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200 disabled:opacity-60"
                  aria-label="Close prayer video"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                {isAnswered(prayerVideoStory)
                  ? "Record or upload a short praise video up to 30 seconds. It will go privately to their Journey Inbox."
                  : "Record or upload a short prayer video up to 30 seconds. It will go privately to their Journey Inbox."}
              </p>

              <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-blue-200 bg-blue-50/60 p-6 text-center transition hover:bg-blue-50">
                <UploadCloud className="h-8 w-8 text-[#0b63ce]" />
                <span className="mt-3 text-sm font-black text-[#082f63]">
                  {isAnswered(prayerVideoStory)
                    ? "Choose or record praise video"
                    : "Choose or record prayer video"}
                </span>
                <span className="mt-1 text-xs font-semibold text-slate-500">
                  30 seconds max
                </span>
                <input
                  type="file"
                  accept="video/*"
                  capture="user"
                  className="hidden"
                  onChange={(event) =>
                    void handlePrayerVideoFile(event.target.files?.[0] ?? null)
                  }
                />
              </label>

              {prayerVideoPreviewUrl && (
                <div className="mt-4 overflow-hidden rounded-[1.5rem] bg-black">
                  <video
                    src={prayerVideoPreviewUrl}
                    controls
                    playsInline
                    className="max-h-[420px] w-full bg-black object-contain"
                  />
                </div>
              )}

              {prayerVideoDuration !== null && (
                <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-600">
                  Video length: {Math.round(prayerVideoDuration)} seconds
                </div>
              )}

              {prayerVideoError && (
                <div className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700 ring-1 ring-red-100">
                  {prayerVideoError}
                </div>
              )}

              <button
                type="button"
                onClick={sendPrayerVideo}
                disabled={!prayerVideoFile || sendingPrayerVideo}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0b63ce] px-4 py-3 text-sm font-black text-white transition hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Video className="h-4 w-4" />
                {sendingPrayerVideo
                  ? "Sending Video..."
                  : isAnswered(prayerVideoStory)
                    ? "Send Praise Video"
                    : "Send Prayer Video"}
              </button>
            </div>
          </div>
        </div>
      )}

      {publicResponseStory && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="flex min-h-full items-end sm:items-center sm:justify-center">
            <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.22em] text-[#0b63ce]">
                    Public Prayer Response
                  </div>
                  <h3 className="mt-2 text-2xl font-black leading-tight text-[#062a57]">
                    Share a public video response
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={closePublicResponseModal}
                  disabled={submittingPublicResponse}
                  className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200 disabled:opacity-60"
                  aria-label="Close public prayer response"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                This video may appear under this prayer after admin approval.
                Public responses are separate from private Journey Inbox prayer
                videos.
              </p>

              <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-blue-200 bg-blue-50/60 p-6 text-center transition hover:bg-blue-50">
                <UploadCloud className="h-8 w-8 text-[#0b63ce]" />
                <span className="mt-3 text-sm font-black text-[#082f63]">
                  Choose or record public response
                </span>
                <span className="mt-1 text-xs font-semibold text-slate-500">
                  Video only · 30 seconds max
                </span>
                <input
                  type="file"
                  accept="video/*"
                  capture="user"
                  className="hidden"
                  onChange={(event) =>
                    void handlePublicResponseFile(
                      event.target.files?.[0] ?? null
                    )
                  }
                />
              </label>

              {publicResponsePreviewUrl && (
                <div className="mt-4 overflow-hidden rounded-[1.5rem] bg-black">
                  <video
                    src={publicResponsePreviewUrl}
                    controls
                    playsInline
                    className="max-h-[420px] w-full bg-black object-contain"
                  />
                </div>
              )}

              {publicResponseDuration !== null && (
                <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-600">
                  Video length: {Math.round(publicResponseDuration)} seconds
                </div>
              )}

              {publicResponseError && (
                <div className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700 ring-1 ring-red-100">
                  {publicResponseError}
                </div>
              )}

              <button
                type="button"
                onClick={submitPublicResponse}
                disabled={!publicResponseFile || submittingPublicResponse}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0b63ce] px-4 py-3 text-sm font-black text-white transition hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Video className="h-4 w-4" />
                {submittingPublicResponse
                  ? "Submitting for Review..."
                  : "Submit Public Response"}
              </button>
            </div>
          </div>
        </div>
      )}

      {updatingStory && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="flex min-h-full items-end sm:items-center sm:justify-center">
            <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 shadow-2xl">
              <div className="text-xs font-black uppercase tracking-[0.22em] text-[#0b63ce]">
                PRAYER CIRCLE UPDATE
              </div>

              <h3 className="mt-2 text-2xl font-black leading-tight text-[#062a57]">
                Share an update with your Prayer Circle
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Everyone currently praying with this request will receive a
                Journey Inbox notification.
              </p>

              <textarea
                value={prayerUpdateText}
                onChange={(event) => setPrayerUpdateText(event.target.value)}
                rows={7}
                placeholder="Share what has changed or how the Prayer Circle can keep praying..."
                className="mt-4 min-h-[11rem] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base leading-7 text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
                style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
              />

              {message && (
                <div className="mt-3 rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-[#082f63]">
                  {message}
                </div>
              )}

              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closePrayerUpdateModal}
                  disabled={savingPrayerUpdate}
                  className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  Not Yet
                </button>

                <button
                  type="button"
                  onClick={savePrayerUpdate}
                  disabled={savingPrayerUpdate}
                  className="rounded-2xl bg-[#0b63ce] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#084f9f] disabled:opacity-60"
                >
                  {savingPrayerUpdate ? "Sharing..." : "Share Update"}
                </button>
              </div>
            </div>
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
  onSendPrayerVideo,
  onSharePublicResponse,
  onShare,
  onAddUpdate,
  onGodDidIt,
  currentUserId,
  onRemovePublicResponse,
  onHidePublicResponse,
}: {
  story: PrayerStory;
  owner: boolean;
  onPray: () => void;
  onEncourage: () => void;
  onSendPrayerVideo: () => void;
  onSharePublicResponse: () => void;
  onShare: () => void;
  onAddUpdate: () => void;
  onGodDidIt: () => void;
  currentUserId: string | null;
  onRemovePublicResponse: (responseId: string) => void;
  onHidePublicResponse: (responseId: string) => void;
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
          {praying && (
            <div className="mt-2 text-sm font-bold text-[#0b63ce]">
              You are in this Prayer Circle
            </div>
          )}
        </div>

        <PrayerUpdateHistory updates={story.updates} />
        <PublicPrayerResponses
          responses={story.public_video_responses}
          currentUserId={currentUserId}
          prayerOwnerUserId={story.user_id}
          onRemove={onRemovePublicResponse}
          onHide={onHidePublicResponse}
        />
      </div>

      <div className="border-t border-slate-100 p-4">
        <div className="grid gap-2 sm:grid-cols-4">
          <PrayerButton active={praying} onClick={onPray}>
            {praying ? "Praying" : "Pray Now"}
          </PrayerButton>
          <PrayerButton active={encouraged} onClick={onEncourage}>
            {encouraged ? "Encouraged" : "Encourage"}
          </PrayerButton>
          <div className="flex min-w-0 flex-col gap-1">
            <PrayerButton
              onClick={onSendPrayerVideo}
              disabled={owner || !story.user_id}
            >
              <span className="inline-flex items-center justify-center gap-1">
                <Video className="h-4 w-4" />
                Send Video Prayer
              </span>
            </PrayerButton>
            {!story.user_id && (
              <span className="px-1 text-center text-[11px] font-bold leading-4 text-slate-400">
                Video prayer unavailable for this request.
              </span>
            )}
          </div>
          <PrayerButton
            onClick={onSharePublicResponse}
            disabled={owner || !story.user_id}
          >
            <span className="inline-flex items-center justify-center gap-1">
              <Video className="h-4 w-4" />
              Share Public Response
            </span>
          </PrayerButton>
          <PrayerButton onClick={onShare}>
            <span className="inline-flex items-center gap-1">
              <Share2 className="h-4 w-4" />
              Share
            </span>
          </PrayerButton>
          {owner && (
            <PrayerButton onClick={onAddUpdate}>Circle Update</PrayerButton>
          )}
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
  owner,
  currentUserId,
  onSendPraiseVideo,
  onShare,
  onAddUpdate,
  onRemovePublicResponse,
  onHidePublicResponse,
}: {
  story: PrayerStory;
  owner: boolean;
  currentUserId: string | null;
  onSendPraiseVideo: () => void;
  onShare: () => void;
  onAddUpdate: () => void;
  onRemovePublicResponse: (responseId: string) => void;
  onHidePublicResponse: (responseId: string) => void;
}) {
  const praying = story.user_reactions.includes("praying");

  return (
    <article className="overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-emerald-200">
      <div className="bg-emerald-600 px-5 py-4 text-white">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] ring-1 ring-white/20">
          <CheckCircle2 className="h-4 w-4" />
          Answered Prayer
        </div>
        <div className="mt-2 text-xl font-black">God Did It</div>
      </div>

      <div className="bg-emerald-50 p-5">

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

        <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-emerald-100">
          <div className="text-sm font-black text-emerald-800">
            {formatPrayerCircleCount(story.reaction_counts.praying)}
          </div>
          {praying && (
            <div className="mt-2 text-sm font-bold text-emerald-700">
              You are in this Prayer Circle
            </div>
          )}
        </div>

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

        <PrayerUpdateHistory updates={story.updates} />
        <PublicPrayerResponses
          responses={story.public_video_responses}
          currentUserId={currentUserId}
          prayerOwnerUserId={story.user_id}
          onRemove={onRemovePublicResponse}
          onHide={onHidePublicResponse}
        />

        <div className="mt-4 flex flex-wrap gap-2">
          {!story.user_id ? (
            <button
              type="button"
              disabled
              className="rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-slate-400 ring-1 ring-slate-200"
            >
              Video prayer unavailable for this request.
            </button>
          ) : owner ? (
            <button
              type="button"
              disabled
              className="rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-slate-400 ring-1 ring-slate-200"
            >
              Your Answered Prayer
            </button>
          ) : (
            <button
              type="button"
              onClick={onSendPraiseVideo}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0b63ce] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#084f9f]"
            >
              <Video className="h-4 w-4" />
              Send Praise Video
            </button>
          )}

          <button
            type="button"
            onClick={onShare}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-emerald-700 ring-1 ring-emerald-100 transition hover:bg-emerald-100"
          >
            <Share2 className="h-4 w-4" />
            Share Testimony
          </button>

          {owner && (
            <button
              type="button"
              onClick={onAddUpdate}
              className="rounded-2xl bg-[#0b63ce] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#084f9f]"
            >
              Circle Update
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function PublicPrayerResponses({
  responses,
  currentUserId,
  prayerOwnerUserId,
  onRemove,
  onHide,
}: {
  responses: PublicPrayerVideoResponse[];
  currentUserId: string | null;
  prayerOwnerUserId: string | null;
  onRemove: (responseId: string) => void;
  onHide: (responseId: string) => void;
}) {
  if (responses.length === 0) return null;

  return (
    <section className="mt-4 rounded-2xl bg-blue-50/70 p-4 ring-1 ring-blue-100">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
          Public Prayer Responses
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-500 ring-1 ring-blue-100">
          {responses.length}
        </span>
      </div>

      <div className="mt-3 space-y-4">
        {responses.map((response) => {
          const videoSource =
            response.signed_video_url ||
            (response.video_url.startsWith("http")
              ? response.video_url
              : null);
          const canRemove = currentUserId === response.user_id;
          const canHide =
            Boolean(currentUserId) && currentUserId === prayerOwnerUserId;

          return (
            <article
              key={response.id}
              className="overflow-hidden rounded-[1.5rem] bg-white ring-1 ring-blue-100"
            >
              {videoSource ? (
                <div className="overflow-hidden bg-black">
                  <video
                    src={videoSource}
                    controls
                    playsInline
                    preload="metadata"
                    className="max-h-[520px] w-full bg-black object-contain"
                  />
                </div>
              ) : (
                <div className="flex min-h-48 items-center justify-center bg-slate-950 p-5 text-center text-sm font-bold text-white/70">
                  Video preview unavailable
                </div>
              )}

              <div className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-black text-[#062a57]">
                    {response.author_name || "HTBF Community Member"}
                  </div>
                  <div className="text-xs font-bold text-slate-400">
                    {formatPrayerUpdateDate(response.created_at)}
                  </div>
                </div>

                {response.body && (
                  <p
                    className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700"
                    style={{
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                    }}
                  >
                    {response.body}
                  </p>
                )}

                {(canRemove || canHide) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canRemove && (
                      <button
                        type="button"
                        onClick={() => onRemove(response.id)}
                        className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-200"
                      >
                        Remove My Response
                      </button>
                    )}
                    {canHide && (
                      <button
                        type="button"
                        onClick={() => onHide(response.id)}
                        className="rounded-full bg-white px-3 py-2 text-xs font-black text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                      >
                        Hide From This Prayer
                      </button>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PrayerUpdateHistory({ updates }: { updates: PrayerUpdate[] }) {
  if (updates.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
          Circle Updates
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-500 ring-1 ring-slate-200">
          {updates.length}
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {updates.map((update) => (
          <div
            key={update.id}
            className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
                Circle Update
              </span>
              <span className="text-xs font-bold text-slate-400">
                {formatPrayerUpdateDate(update.created_at)}
              </span>
            </div>
            <p
              className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700"
              style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
            >
              {update.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatPrayerUpdateDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PrayerButton({
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl px-3 py-2.5 text-sm font-black transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${
        active && !disabled
          ? "bg-[#0b63ce] text-white"
          : "bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-[#0b63ce]"
      }`}
    >
      {children}
    </button>
  );
}
