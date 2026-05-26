"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Globe2,
  Play,
  Search,
  Sparkles,
  Send,
} from "lucide-react";
import { supabase } from "import { supabase } from "../lib/supabaseClient";

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

export default function StoriesPage() {
  const [stories, setStories] = useState<ApprovedStory[]>([]);
  const [filteredStories, setFilteredStories] = useState<ApprovedStory[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [reactionMessage, setReactionMessage] = useState("");

  const categories = [
    "All",
    "Testimony",
    "Praise Report",
    "Prayer Encouragement",
    "Freedom Story",
    "Answered Prayer",
    "Video Testimony",
  ];

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

  useEffect(() => {
    let results = stories;

    if (category !== "All") {
      results = results.filter((story) => story.story_type === category);
    }

    if (search.trim()) {
      const term = search.toLowerCase();

      results = results.filter((story) => {
        return (
          story.story_text?.toLowerCase().includes(term) ||
          story.location?.toLowerCase().includes(term) ||
          story.story_type?.toLowerCase().includes(term) ||
          story.name?.toLowerCase().includes(term)
        );
      });
    }

    setFilteredStories(results);
  }, [search, category, stories]);

  async function loadApprovedStories(currentUserId: string | null) {
    const { data, error } = await supabase
      .from("stories")
      .select(
        "id, name, location, story_type, story_text, video_url, status, created_at"
      )
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (error || !data) {
      setLoading(false);
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

    const storiesWithVideosAndReactions: ApprovedStory[] = await Promise.all(
      data.map(async (story) => {
        let signedVideoUrl: string | null = null;

        if (story.video_url) {
          const { data: signedData } = await supabase.storage
            .from("story-videos")
            .createSignedUrl(story.video_url, 60 * 60);

          signedVideoUrl = signedData?.signedUrl ?? null;
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

    setStories(storiesWithVideosAndReactions);
    setFilteredStories(storiesWithVideosAndReactions);
    setLoading(false);
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

  function formatDate(value: string | null) {
    if (!value) return "Date unavailable";

    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] text-slate-900">
      <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#0b63ce] hover:text-[#084f9f]"
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>

          <Link
            href="/share-your-story"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#084f9f]"
          >
            Share <Send className="h-4 w-4" />
          </Link>
        </div>

        <div className="sticky top-0 z-40 -mx-4 border-b border-slate-200 bg-[#f8fbff]/95 px-4 py-4 backdrop-blur-xl sm:-mx-6 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-[#0b63ce]">
              <Sparkles className="h-4 w-4" />
              Continuous Freedom Feed
            </div>

            <h1 className="text-3xl font-black tracking-tight text-[#062a57] sm:text-5xl">
              Stories being shared now.
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
              Scroll through approved testimonies, praise reports, answered
              prayers, encouragement, and video stories from the Hyper to Be
              Free community.
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-[1fr_240px]">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-12 pr-4 outline-none focus:border-[#0b63ce]"
                  placeholder="Search stories..."
                />
              </div>

              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#0b63ce]"
              >
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>

            {reactionMessage && (
              <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm font-semibold text-[#082f63]">
                {reactionMessage}
              </div>
            )}

            <div className="mt-4 rounded-2xl bg-white p-4 text-sm font-semibold text-[#082f63] shadow-sm">
              Showing {filteredStories.length} approved stor
              {filteredStories.length === 1 ? "y" : "ies"}.
            </div>
          </div>
        </div>

        {loading ? (
          <div className="mt-8 rounded-3xl bg-white p-6 text-slate-600 shadow-sm">
            Loading stories...
          </div>
        ) : filteredStories.length === 0 ? (
          <div className="mt-8 rounded-3xl bg-white p-6 text-slate-600 shadow-sm">
            No approved stories match this search yet.
          </div>
        ) : (
          <div className="mt-8 grid gap-8">
            {filteredStories.map((story, index) => (
              <article
                key={story.id}
                className="min-h-[86vh] scroll-mt-40 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-6 md:rounded-[2.5rem] md:p-8"
              >
                <div className="flex h-full flex-col">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[#0b63ce]">
                        {story.story_type || "Story"}
                      </span>

                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                        Approved
                      </span>
                    </div>

                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
                      {index + 1}/{filteredStories.length}
                    </span>
                  </div>

                  <div className="overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-[#eaf5ff] via-white to-[#fff0cf] p-3 sm:p-4">
                    {story.signed_video_url ? (
                      <video
                        controls
                        playsInline
                        className="h-[46vh] max-h-[560px] min-h-[280px] w-full rounded-[1.2rem] bg-black object-contain"
                        src={story.signed_video_url}
                      >
                        Your browser does not support the video tag.
                      </video>
                    ) : (
                      <div className="flex h-[46vh] max-h-[560px] min-h-[280px] items-center justify-center rounded-[1.2rem] border border-white bg-white/50">
                        <Play className="h-14 w-14 fill-[#0b63ce] text-[#0b63ce]" />
                      </div>
                    )}
                  </div>

                  <div className="mt-5 flex-1">
                    <p className="text-xl font-black leading-8 text-slate-900 sm:text-2xl sm:leading-9">
                      {story.story_text || "Story of freedom"}
                    </p>

                    <div className="mt-5 flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <Globe2 className="h-4 w-4" />
                        {story.location || "Location not shared"}
                      </span>

                      <span>Shared {formatDate(story.created_at)}</span>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-2 text-xs font-bold">
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
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
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
      className={`rounded-full px-4 py-2 text-xs font-bold transition sm:text-sm ${
        active
          ? "bg-[#0b63ce] text-white"
          : "bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-[#0b63ce]"
      }`}
    >
      {label} {count}
    </button>
  );
}
