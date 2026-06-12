"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Globe2,
  Plus,
  Video,
  MessageCircleHeart,
  Sparkles,
  CheckCircle2,
  Share2,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

type ReactionType = "amen" | "praise_god" | "encouraged" | "praying";

type FeedFilter =
  | "all"
  | "videos"
  | "testimony"
  | "praise"
  | "prayer"
  | "answered";

type ReactionRow = {
  story_id: string | null;
  user_id: string | null;
  reaction_type: string | null;
};

type ApprovedStory = {
  id: string;
  user_id: string | null;
  name: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  video_url: string | null;
  signed_video_url: string | null;
  status: string | null;
  created_at: string | null;
  prayer_status: string | null;
  answered_at: string | null;
  answered_text: string | null;
  reaction_counts: {
    amen: number;
    praise_god: number;
    encouraged: number;
    praying: number;
  };
  user_reactions: ReactionType[];
};

export default function FreedomFeed({
  defaultFilter = "all",
  lockedFilter = false,
}: {
  defaultFilter?: FeedFilter;
  lockedFilter?: boolean;
}) {
  const [stories, setStories] = useState<ApprovedStory[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [reactionMessage, setReactionMessage] = useState("");
  const [activeFilter, setActiveFilter] = useState<FeedFilter>(defaultFilter);

  useEffect(() => {
    let currentUserId: string | null = null;

    async function loadPage() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      currentUserId = user?.id ?? null;
      setUserId(currentUserId);

      await loadApprovedStories(currentUserId);
    }

    loadPage();

    const channel = supabase
      .channel("freedom-feed-live-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "story_reactions",
        },
        async () => {
          await loadApprovedStories(currentUserId);
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
          await loadApprovedStories(currentUserId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function getVideoStoragePath(videoUrl: string) {
    if (!videoUrl) return null;

    if (videoUrl.includes("story-videos/")) {
      const afterBucket = videoUrl.split("story-videos/")[1];
      const pathOnly = afterBucket.split("?")[0];
      return decodeURIComponent(pathOnly);
    }

    if (videoUrl.startsWith("http")) {
      return null;
    }

    return videoUrl;
  }

  function isPrayerStory(story: ApprovedStory) {
    return story.story_type?.toLowerCase().includes("prayer") ?? false;
  }

  function isOriginalPoster(story: ApprovedStory) {
    return Boolean(userId && story.user_id && story.user_id === userId);
  }

  async function loadApprovedStories(currentUserId: string | null) {
    const { data, error } = await supabase
      .from("stories")
      .select(
        "id, user_id, name, location, story_type, story_text, video_url, status, created_at, prayer_status, answered_at, answered_text"
      )
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(40);

    if (error || !data) {
      console.error("Could not load approved stories:", error);
      return;
    }

    const storyIds = data.map((story) => story.id);

    let reactions: ReactionRow[] = [];

    if (storyIds.length > 0) {
      const { data: reactionData } = await supabase
        .from("story_reactions")
        .select("story_id, user_id, reaction_type")
        .in("story_id", storyIds);

      reactions = (reactionData as ReactionRow[]) ?? [];
    }

    const updatedStories: ApprovedStory[] = await Promise.all(
      data.map(async (story) => {
        let signedVideoUrl: string | null = null;

        if (story.video_url) {
          const storagePath = getVideoStoragePath(story.video_url);

          if (storagePath) {
            const { data: signedData, error: signedError } =
              await supabase.storage
                .from("story-videos")
                .createSignedUrl(storagePath, 60 * 60);

            if (signedError) {
              console.error("Could not create signed video URL:", signedError);
            }

            signedVideoUrl = signedData?.signedUrl ?? null;
          } else if (story.video_url.startsWith("http")) {
            signedVideoUrl = story.video_url;
          }
        }

        const storyReactions = reactions.filter(
          (reaction) => reaction.story_id === story.id
        );

        const userReactions = storyReactions
          .filter((reaction) => reaction.user_id === currentUserId)
          .map((reaction) => reaction.reaction_type)
          .filter(
            (reaction): reaction is ReactionType =>
              reaction === "amen" ||
              reaction === "praise_god" ||
              reaction === "encouraged" ||
              reaction === "praying"
          );

        return {
          id: story.id,
          user_id: story.user_id,
          name: story.name,
          location: story.location,
          story_type: story.story_type,
          story_text: story.story_text,
          video_url: story.video_url,
          signed_video_url: signedVideoUrl,
          status: story.status,
          created_at: story.created_at,
          prayer_status: story.prayer_status ?? "active",
          answered_at: story.answered_at,
          answered_text: story.answered_text,
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
      })
    );

    setStories(updatedStories);
  }

  const filteredStories = useMemo(() => {
    if (activeFilter === "all") return stories;

    if (activeFilter === "videos") {
      return stories.filter((story) => story.signed_video_url || story.video_url);
    }

    if (activeFilter === "testimony") {
      return stories.filter((story) =>
        story.story_type?.toLowerCase().includes("testimony")
      );
    }

    if (activeFilter === "praise") {
      return stories.filter((story) =>
        story.story_type?.toLowerCase().includes("praise")
      );
    }

    if (activeFilter === "prayer") {
      return stories.filter((story) =>
        story.story_type?.toLowerCase().includes("prayer")
      );
    }

    if (activeFilter === "answered") {
      return stories.filter(
        (story) =>
          story.story_type?.toLowerCase().includes("prayer") &&
          story.prayer_status === "answered"
      );
    }

    return stories;
  }, [activeFilter, stories]);

  async function toggleReaction(storyId: string, reactionType: ReactionType) {
    setReactionMessage("");

    if (!userId) {
      setReactionMessage("Please sign in to react to stories.");
      return;
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
        setReactionMessage(`Could not remove reaction: ${error.message}`);
        return;
      }

      updateLocalReaction(storyId, reactionType, "remove");
      return;
    }

    const { error } = await supabase.from("story_reactions").insert({
      story_id: storyId,
      user_id: userId,
      reaction_type: reactionType,
    });

    if (error) {
      setReactionMessage(`Could not add reaction: ${error.message}`);
      return;
    }

    updateLocalReaction(storyId, reactionType, "add");
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

  async function markPrayerAnswered(storyId: string) {
    setReactionMessage("");

    if (!userId) {
      setReactionMessage("Please sign in to mark a prayer request answered.");
      return;
    }

    const story = stories.find((item) => item.id === storyId);

    if (!story) {
      setReactionMessage("Could not find this prayer request.");
      return;
    }

    if (story.user_id !== userId) {
      setReactionMessage(
        "Only the person who shared this prayer request can mark it answered."
      );
      return;
    }

    const answeredText = window.prompt(
      "God did it! What happened? Share a short update so others can be encouraged."
    );

    if (answeredText === null) return;

    const cleanAnsweredText = answeredText.trim();

    if (!cleanAnsweredText) {
      setReactionMessage(
        "Please add a short answered prayer update before marking this answered."
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
      setReactionMessage(`Could not mark prayer answered: ${error.message}`);
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

    setReactionMessage("Prayer request marked as answered. God did it.");
  }

  async function shareStory(story: ApprovedStory) {
    setReactionMessage("");

    const storyType = story.story_type || "HTBF Story";

    let shareText = "See this story on Hyper to Be Free.";

    if (isPrayerStory(story) && story.prayer_status === "answered") {
      shareText = story.answered_text
        ? `God did it. Read this answered prayer: ${story.answered_text.slice(0, 140)}`
        : "God did it. Read this answered prayer on Hyper to Be Free.";
    } else if (isPrayerStory(story)) {
      shareText = story.story_text
        ? `Stand in prayer with this request: ${story.story_text.slice(0, 140)}`
        : "Stand in prayer with this request on Hyper to Be Free.";
    } else if (story.signed_video_url || story.video_url) {
      shareText = story.story_text
        ? `Watch this video testimony: ${story.story_text.slice(0, 140)}`
        : "Watch this video testimony on Hyper to Be Free.";
    } else if (story.story_text) {
      shareText = story.story_text.slice(0, 140);
    }

    const shareUrl = `${window.location.origin}/feed`;

    const shareData = {
      title: `Hyper to Be Free - ${storyType}`,
      text: shareText,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }

      await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      setReactionMessage("Share link copied.");
    } catch (error) {
      console.error("Share failed:", error);
    }
  }

  const feedLabel =
    lockedFilter && defaultFilter === "videos"
      ? "Video Testimonies"
      : lockedFilter && defaultFilter === "prayer"
        ? "Prayer Support"
        : lockedFilter && defaultFilter === "answered"
          ? "Answered Prayers"
          : "Community Feed";

  const feedHeading =
    lockedFilter && defaultFilter === "videos"
      ? "Videos being shared now"
      : lockedFilter && defaultFilter === "prayer"
        ? "Prayer requests being shared now"
        : lockedFilter && defaultFilter === "answered"
          ? "God Did It"
          : "Stories being shared now";

  const emptyMessage =
    lockedFilter && defaultFilter === "videos"
      ? "No approved videos are showing yet. Approved video testimonies will appear here after review."
      : lockedFilter && defaultFilter === "prayer"
        ? "No approved prayer requests are showing yet. Approved prayer requests will appear here after review."
        : lockedFilter && defaultFilter === "answered"
          ? "No answered prayers are showing yet. When someone marks a prayer request as answered, it will appear here."
          : "No approved stories are showing yet. Approved stories will appear here after review.";

  return (
    <section
      id="stories"
      className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-10"
    >
      <div className="mx-auto max-w-3xl">
        {!lockedFilter && (
          <div className="mb-6 rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#0b63ce]">
                <Sparkles className="h-6 w-6" />
              </div>

              <Link
                href="/share-your-story"
                className="flex min-h-12 flex-1 items-center rounded-full bg-slate-100 px-5 text-left text-base font-semibold text-slate-500 hover:bg-slate-200"
              >
                What has God done?
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-sm font-bold text-slate-600">
              <Link
                href="/share-your-story"
                className="flex items-center justify-center gap-2 rounded-2xl px-2 py-2 hover:bg-blue-50 hover:text-[#0b63ce]"
              >
                <Plus className="h-4 w-4" />
                Story
              </Link>

              <Link
                href="/videos"
                className="flex items-center justify-center gap-2 rounded-2xl px-2 py-2 hover:bg-blue-50 hover:text-[#0b63ce]"
              >
                <Video className="h-4 w-4" />
                Videos
              </Link>

              <Link
                href="/prayer"
                className="flex items-center justify-center gap-2 rounded-2xl px-2 py-2 hover:bg-blue-50 hover:text-[#0b63ce]"
              >
                <MessageCircleHeart className="h-4 w-4" />
                Prayer
              </Link>
            </div>
          </div>
        )}

        <div className="mb-6">
          <div className="mb-4">
            <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
              {feedLabel}
            </div>

            <h2 className="mt-1 text-3xl font-black tracking-tight text-[#062a57] sm:text-4xl">
              {feedHeading}
            </h2>
          </div>

          {!lockedFilter && (
            <div className="flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <FilterButton
                label="All"
                active={activeFilter === "all"}
                onClick={() => setActiveFilter("all")}
              />

              <FilterButton
                label="Testimonies"
                active={activeFilter === "testimony"}
                onClick={() => setActiveFilter("testimony")}
              />

              <FilterButton
                label="Praise"
                active={activeFilter === "praise"}
                onClick={() => setActiveFilter("praise")}
              />

              <FilterButton
                label="Prayer"
                active={activeFilter === "prayer"}
                onClick={() => setActiveFilter("prayer")}
              />
            </div>
          )}
        </div>

        {reactionMessage && (
          <div className="mb-5 rounded-2xl bg-blue-50 p-4 text-sm font-semibold text-[#082f63]">
            {reactionMessage}
          </div>
        )}

        <div className="space-y-5">
          {filteredStories.length === 0 ? (
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
              {emptyMessage}
            </div>
          ) : (
            filteredStories.map((story) => {
              const prayerStory = isPrayerStory(story);
              const originalPoster = isOriginalPoster(story);
              const prayerAnswered = story.prayer_status === "answered";

              return (
                <article
                  key={story.id}
                  className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm"
                >
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
                            {story.story_type || "Story"}
                          </span>

                          {prayerStory && prayerAnswered && (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                              Answered
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-sm font-medium text-slate-500">
                          <Globe2 className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 break-words">
                            {story.location || "Location not shared"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {story.story_text && (
                      <p
                        className="mt-4 max-w-full whitespace-pre-wrap text-[17px] leading-7 text-slate-800"
                        style={{
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                        }}
                      >
                        {story.story_text}
                      </p>
                    )}
                  </div>

                  {story.signed_video_url && (
                    <div className="bg-black">
                      <video
                        controls
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        className="max-h-[560px] w-full bg-black object-contain"
                        src={story.signed_video_url}
                      >
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  )}

                  {!story.signed_video_url && story.video_url && (
                    <div className="mx-5 mb-5 flex h-48 items-center justify-center rounded-[1.5rem] border border-red-100 bg-red-50 p-4 text-center text-sm font-bold text-red-700">
                      Video found, but the secure video link could not be
                      created.
                    </div>
                  )}

                  <div className="border-t border-slate-100 px-5 py-3">
                    {prayerStory ? (
                      <>
                        {prayerAnswered ? (
                          <div className="mb-3 rounded-2xl bg-emerald-50 p-4">
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
                                🙏{" "}
                                {story.reaction_counts.praying === 1
                                  ? "1 believer prayed with this request"
                                  : `${story.reaction_counts.praying} believers prayed with this request`}
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
                                This prayer request was marked answered by the
                                person who shared it.
                              </p>
                            )}

                            <button
                              onClick={() => shareStory(story)}
                              className="mt-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-emerald-700 ring-1 ring-emerald-100 transition hover:bg-emerald-100"
                            >
                              <Share2 className="h-4 w-4" />
                              Share Testimony
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="mb-3 rounded-2xl bg-blue-50 p-4">
                              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                                Prayer Chain
                              </div>

                              <div className="mt-1 text-base font-black text-[#062a57]">
                                {story.reaction_counts.praying === 0
                                  ? "Be the first to pray"
                                  : story.reaction_counts.praying === 1
                                    ? "1 person is praying"
                                    : `${story.reaction_counts.praying} people are praying`}
                              </div>

                              <p className="mt-2 text-sm leading-6 text-slate-600">
                                Stand with this prayer request and let them know
                                they are not praying alone.
                              </p>
                            </div>

                            <div className="flex flex-col gap-2 sm:flex-row">
                              <ReactionButton
                                active={story.user_reactions.includes("praying")}
                                label={
                                  story.user_reactions.includes("praying")
                                    ? "Praying"
                                    : "I’m Praying"
                                }
                                onClick={() =>
                                  toggleReaction(story.id, "praying")
                                }
                              />

                              <button
                                onClick={() => shareStory(story)}
                                className="inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 text-sm font-black text-slate-600 transition hover:bg-blue-50 hover:text-[#0b63ce]"
                              >
                                <Share2 className="h-4 w-4 shrink-0" />
                                Share
                              </button>

                              {originalPoster && (
                                <button
                                  onClick={() => markPrayerAnswered(story.id)}
                                  className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700"
                                >
                                  God Did It
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="mb-3 grid grid-cols-3 gap-2 text-center text-sm font-semibold text-slate-500 sm:flex sm:flex-wrap sm:items-center sm:gap-4 sm:text-left">
                          <span className="min-w-0 break-words">
                            {story.reaction_counts.amen} Amen
                          </span>
                          <span className="min-w-0 break-words">
                            {story.reaction_counts.praise_god} Praise God
                          </span>
                          <span className="min-w-0 break-words">
                            {story.reaction_counts.encouraged} Encouraged
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <ReactionButton
                            active={story.user_reactions.includes("amen")}
                            label="Amen"
                            onClick={() => toggleReaction(story.id, "amen")}
                          />

                          <ReactionButton
                            active={story.user_reactions.includes("praise_god")}
                            label={
                              <>
                                <span className="sm:hidden">Praise</span>
                                <span className="hidden sm:inline">
                                  Praise God
                                </span>
                              </>
                            }
                            onClick={() =>
                              toggleReaction(story.id, "praise_god")
                            }
                          />

                          <ReactionButton
                            active={story.user_reactions.includes("encouraged")}
                            label="Encouraged"
                            onClick={() =>
                              toggleReaction(story.id, "encouraged")
                            }
                          />

                          <button
                            onClick={() => shareStory(story)}
                            className="inline-flex min-w-0 items-center justify-center gap-1 rounded-2xl bg-slate-50 px-3 py-2.5 text-xs font-black text-slate-600 transition hover:bg-blue-50 hover:text-[#0b63ce] sm:text-sm"
                          >
                            <Share2 className="h-4 w-4 shrink-0" />
                            Share
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

function FilterButton({
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
      onClick={onClick}
      className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-black transition ${
        active
          ? "bg-[#0b63ce] text-white shadow-sm"
          : "bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-blue-50 hover:text-[#0b63ce]"
      }`}
    >
      {label}
    </button>
  );
}

function ReactionButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`min-w-0 rounded-2xl px-2 py-2.5 text-xs font-black transition sm:px-3 sm:text-sm ${
        active
          ? "bg-[#0b63ce] text-white"
          : "bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-[#0b63ce]"
      }`}
    >
      <span
        style={{
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {label}
      </span>
    </button>
  );
}
