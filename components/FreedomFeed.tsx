"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Globe2, Play } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

type ReactionType = "amen" | "praise_god" | "encouraged";

type ReactionRow = {
  story_id: string | null;
  user_id: string | null;
  reaction_type: string | null;
};

type ApprovedStory = {
  id: string;
  name: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  video_url: string | null;
  signed_video_url: string | null;
  status: string | null;
  created_at: string | null;
  reaction_counts: {
    amen: number;
    praise_god: number;
    encouraged: number;
  };
  user_reactions: ReactionType[];
};

export default function FreedomFeed() {
  const [stories, setStories] = useState<ApprovedStory[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [reactionMessage, setReactionMessage] = useState("");

  useEffect(() => {
    async function loadPage() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const currentUserId = user?.id ?? null;
      setUserId(currentUserId);

      await loadApprovedStories(currentUserId);
    }

    loadPage();
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

  async function loadApprovedStories(currentUserId: string | null) {
    const { data, error } = await supabase
      .from("stories")
      .select(
        "id, name, location, story_type, story_text, video_url, status, created_at"
      )
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(6);

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
              reaction === "encouraged"
          );

        return {
          id: story.id,
          name: story.name,
          location: story.location,
          story_type: story.story_type,
          story_text: story.story_text,
          video_url: story.video_url,
          signed_video_url: signedVideoUrl,
          status: story.status,
          created_at: story.created_at,
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
          },
          user_reactions: userReactions,
        };
      })
    );

    setStories(updatedStories);
  }

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

  return (
    <section id="stories" className="mx-auto max-w-7xl px-6 py-14">
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="text-sm font-bold uppercase tracking-[0.22em] text-[#0b63ce]">
            Freedom Feed
          </div>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-[#062a57] md:text-4xl">
            Stories being shared now
          </h2>
        </div>

        <Link
          href="/stories"
          className="w-fit rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-[#082f63] shadow-sm hover:bg-slate-50"
        >
          View More Stories
        </Link>
      </div>

      {reactionMessage && (
        <div className="mb-6 rounded-2xl bg-blue-50 p-4 text-sm font-semibold text-[#082f63]">
          {reactionMessage}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-3">
        {stories.length === 0 ? (
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-600 shadow-sm md:col-span-3">
            No approved stories are showing yet. Approved stories will appear
            here after review.
          </div>
        ) : (
          stories.map((story) => (
            <article
              key={story.id}
              className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-950/5"
            >
              <div className="mb-5 flex items-center justify-between">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[#0b63ce]">
                  {story.story_type || "Story"}
                </span>
              </div>

              <div className="mb-4 overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-[#eaf5ff] via-white to-[#fff0cf] p-4">
                {story.signed_video_url ? (
                  <video
                    controls
                    playsInline
                    preload="metadata"
                    className="h-44 w-full rounded-[1.2rem] bg-black object-cover"
                    src={story.signed_video_url}
                  >
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <div className="flex h-44 items-center justify-center rounded-[1.2rem] border border-white bg-white/50">
                    <Play className="h-10 w-10 fill-[#0b63ce] text-[#0b63ce]" />
                  </div>
                )}
              </div>

              <h3 className="text-xl font-black leading-tight text-slate-900">
                {story.story_text
                  ? story.story_text.length > 85
                    ? `${story.story_text.slice(0, 85)}...`
                    : story.story_text
                  : "Story of freedom"}
              </h3>

              <div className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-500">
                <Globe2 className="h-4 w-4" />
                {story.location || "Location not shared"}
              </div>

              <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
                <ReactionButton
                  active={story.user_reactions.includes("amen")}
                  label="Amen"
                  count={story.reaction_counts.amen}
                  onClick={() => toggleReaction(story.id, "amen")}
                />

                <ReactionButton
                  active={story.user_reactions.includes("praise_god")}
                  label="Praise God"
                  count={story.reaction_counts.praise_god}
                  onClick={() => toggleReaction(story.id, "praise_god")}
                />

                <ReactionButton
                  active={story.user_reactions.includes("encouraged")}
                  label="This encouraged me"
                  count={story.reaction_counts.encouraged}
                  onClick={() => toggleReaction(story.id, "encouraged")}
                />
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function ReactionButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
        active
          ? "bg-[#0b63ce] text-white"
          : "bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-[#0b63ce]"
      }`}
    >
      {label} {count}
    </button>
  );
}
