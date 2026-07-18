import type { FeedDisplayItem, FeedReactionType } from "./enrichFeedItems";
import { supabase } from "../supabaseClient";

type ReactionRow = {
  story_id: string | null;
  user_id: string | null;
  reaction_type: string | null;
};

function buildReactionCounts(
  reactions: ReactionRow[],
  storyId: string,
  viewerUserId: string | null
) {
  const storyReactions = reactions.filter(
    (reaction) => reaction.story_id === storyId
  );

  const userReactions = storyReactions
    .filter((reaction) => reaction.user_id === viewerUserId)
    .map((reaction) => reaction.reaction_type)
    .filter(
      (reaction): reaction is FeedReactionType =>
        reaction === "amen" ||
        reaction === "praise_god" ||
        reaction === "encouraged" ||
        reaction === "praying"
    );

  return {
    reaction_counts: {
      amen: storyReactions.filter((r) => r.reaction_type === "amen").length,
      praise_god: storyReactions.filter((r) => r.reaction_type === "praise_god")
        .length,
      encouraged: storyReactions.filter((r) => r.reaction_type === "encouraged")
        .length,
      praying: storyReactions.filter((r) => r.reaction_type === "praying")
        .length,
    },
    user_reactions: userReactions,
  };
}

export async function patchFeedReactionCountsForStories(
  loaded: FeedDisplayItem[],
  storyIds: string[],
  viewerUserId: string | null
) {
  const uniqueStoryIds = [...new Set(storyIds.filter(Boolean))];
  if (uniqueStoryIds.length === 0) return loaded;

  const { data: reactionData } = await supabase
    .from("story_reactions")
    .select("story_id, user_id, reaction_type")
    .in("story_id", uniqueStoryIds);

  const reactions = (reactionData as ReactionRow[]) ?? [];
  const targetIds = new Set(uniqueStoryIds);

  return loaded.map((item) => {
    if (item.kind !== "story" || !targetIds.has(item.id)) return item;
    const { reaction_counts, user_reactions } = buildReactionCounts(
      reactions,
      item.id,
      viewerUserId
    );
    return {
      ...item,
      reaction_counts,
      user_reactions,
    };
  });
}
