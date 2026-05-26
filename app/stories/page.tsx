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
import { supabase } from "../../lib/supabaseClient";

type ReactionType = "amen" | "praise_god" | "encouraged";

type ApprovedStory = {
  id: string;
  name: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  video_url: string | null;
  signed_video_url?: string | null;
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

      setUserId(user?.id ?? null);
      await loadApprovedStories(user?.id ?? null);
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

    const { data: reactions } = await supabase
      .from("story_reactions")
      .select("story_id, user_id, reaction_type")
      .in("story_id", storyIds);

    const storiesWithVideosAndReactions = await Promise.all(
      data.map(async (story) => {
        let signedVideoUrl: string | null = null;

        if (story.video_url) {
          const { data: signedData } = await supabase.storage
            .from("story-videos")
            .createSignedUrl(story.video_url, 60 * 60);

          signedVideoUrl = signedData?.signedUrl ?? null;
        }

        const storyReactions =
          reactions?.filter((reaction) => reaction.story_id === story.id) ?? [];

        const userReactions = storyReactions
          .filter((reaction) => reaction.user_id === currentUserId)
          .map((reaction) => reaction.reaction_type as ReactionType);

        return {
          ...story,
          signed_video_url: signedVideoUrl,
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
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[#0b63ce] hover:text-[#084f9f]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:rounded-[2.5rem] sm:p-8 md:p-12">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-[#0b63ce]">
            <Sparkles className="h-4 w-4" />
            Freedom Feed
          </div>

          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-tight text-[#062a57] sm:text-5xl md:text-6xl">
                Stories being shared now.
              </h1>

              <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 sm:text-lg">
                Browse approved testimonies, praise reports, answered prayers,
                encouragement, and stories of freedom from the Hyper to Be Free
                community.
              </p>
            </div>

            <Link
              href="/share-your-story"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-6 py-3.5 text-base font-bold text-white shadow-sm hover:bg-[#084f9f] sm:w-fit"
            >
              Share Your Story <Send className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-[1fr_260px]">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 outline-none focus:border-[#0b63ce] focus:bg-white"
                placeholder="Search stories..."
              />
            </div>

            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-[#0b63ce] focus:bg-white"
            >
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>

          {reactionMessage && (
            <div className="mt-6 rounded-2xl bg-blue-50 p-4 text-sm font-semibold text-[#082f63]">
              {reactionMessage}
            </div>
          )}

          <div className="mt-8 rounded-3xl bg-blue-50 p-5 text-sm font-semibold text-[#082f63]">
            Showing {filteredStories.length} approved stor
            {filteredStories.length === 1 ? "y" : "ies"}.
          </div>

          {loading ? (
            <div className="mt-10 rounded-2xl bg-slate-50 p-6 text-slate-600">
              Loading stories...
            </div>
          ) : filteredStories.length === 0 ? (
            <div className="mt-10 rounded-2xl bg-slate-50 p-6 text-slate-600">
              No approved stories match this search yet.
            </div>
          ) : (
            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredStories.map((story) => (
                <article
                  key={story.id}
                  className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-950/5"
                >
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[#0b63ce]">
                      {story.story_type || "Story"}
                    </span>

                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                      Approved
                    </span>
                  </div>

                  <div className="mb-4 overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-[#eaf5ff] via-white to-[#fff0cf] p-4">
                    {story.signed_video_url ? (
                      <video
                        controls
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

                  <p className="text-lg font-bold leading-8 text-slate-900">
                    {story.story_text || "Story of freedom"}
                  </p>

                  <div className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-500">
                    <Globe2 className="h-4 w-4" />
                    {story.location || "Location not shared"}
                  </div>

                  <div className="mt-2 text-sm text-slate-500">
                    Shared {formatDate(story.created_at)}
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
              ))}
            </div>
          )}
        </div>
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
      className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
        active
          ? "bg-[#0b63ce] text-white"
          : "bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-[#0b63ce]"
      }`}
    >
      {label} {count}
    </button>
  );
}"use client";

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
import { supabase } from "../../lib/supabaseClient";

type ReactionType = "amen" | "praise_god" | "encouraged";

type ApprovedStory = {
  id: string;
  name: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  video_url: string | null;
  signed_video_url?: string | null;
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

      setUserId(user?.id ?? null);
      await loadApprovedStories(user?.id ?? null);
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

    const { data: reactions } = await supabase
      .from("story_reactions")
      .select("story_id, user_id, reaction_type")
      .in("story_id", storyIds);

    const storiesWithVideosAndReactions = await Promise.all(
      data.map(async (story) => {
        let signedVideoUrl: string | null = null;

        if (story.video_url) {
          const { data: signedData } = await supabase.storage
            .from("story-videos")
            .createSignedUrl(story.video_url, 60 * 60);

          signedVideoUrl = signedData?.signedUrl ?? null;
        }

        const storyReactions =
          reactions?.filter((reaction) => reaction.story_id === story.id) ?? [];

        const userReactions = storyReactions
          .filter((reaction) => reaction.user_id === currentUserId)
          .map((reaction) => reaction.reaction_type as ReactionType);

        return {
          ...story,
          signed_video_url: signedVideoUrl,
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
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[#0b63ce] hover:text-[#084f9f]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:rounded-[2.5rem] sm:p-8 md:p-12">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-[#0b63ce]">
            <Sparkles className="h-4 w-4" />
            Freedom Feed
          </div>

          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-tight text-[#062a57] sm:text-5xl md:text-6xl">
                Stories being shared now.
              </h1>

              <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 sm:text-lg">
                Browse approved testimonies, praise reports, answered prayers,
                encouragement, and stories of freedom from the Hyper to Be Free
                community.
              </p>
            </div>

            <Link
              href="/share-your-story"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-6 py-3.5 text-base font-bold text-white shadow-sm hover:bg-[#084f9f] sm:w-fit"
            >
              Share Your Story <Send className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-[1fr_260px]">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 outline-none focus:border-[#0b63ce] focus:bg-white"
                placeholder="Search stories..."
              />
            </div>

            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-[#0b63ce] focus:bg-white"
            >
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>

          {reactionMessage && (
            <div className="mt-6 rounded-2xl bg-blue-50 p-4 text-sm font-semibold text-[#082f63]">
              {reactionMessage}
            </div>
          )}

          <div className="mt-8 rounded-3xl bg-blue-50 p-5 text-sm font-semibold text-[#082f63]">
            Showing {filteredStories.length} approved stor
            {filteredStories.length === 1 ? "y" : "ies"}.
          </div>

          {loading ? (
            <div className="mt-10 rounded-2xl bg-slate-50 p-6 text-slate-600">
              Loading stories...
            </div>
          ) : filteredStories.length === 0 ? (
            <div className="mt-10 rounded-2xl bg-slate-50 p-6 text-slate-600">
              No approved stories match this search yet.
            </div>
          ) : (
            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredStories.map((story) => (
                <article
                  key={story.id}
                  className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-950/5"
                >
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[#0b63ce]">
                      {story.story_type || "Story"}
                    </span>

                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                      Approved
                    </span>
                  </div>

                  <div className="mb-4 overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-[#eaf5ff] via-white to-[#fff0cf] p-4">
                    {story.signed_video_url ? (
                      <video
                        controls
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

                  <p className="text-lg font-bold leading-8 text-slate-900">
                    {story.story_text || "Story of freedom"}
                  </p>

                  <div className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-500">
                    <Globe2 className="h-4 w-4" />
                    {story.location || "Location not shared"}
                  </div>

                  <div className="mt-2 text-sm text-slate-500">
                    Shared {formatDate(story.created_at)}
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
              ))}
            </div>
          )}
        </div>
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
