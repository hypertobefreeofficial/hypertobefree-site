import { supabase } from "../supabaseClient";
import {
  applyGenuinePublicDemoFilter,
  filterGenuinePublicDemoRows,
  getDemoContentSchemaCapabilities,
} from "../demo-content/eligibility";

export type VideoFeedReactionType =
  | "amen"
  | "praise_god"
  | "encouraged"
  | "praying";

type ReactionRow = {
  story_id: string | null;
  user_id: string | null;
  reaction_type: string | null;
  is_demo?: boolean | null;
};

export type VideoFeedReactionPatch = {
  reaction_counts: Record<VideoFeedReactionType, number>;
  user_reactions: VideoFeedReactionType[];
};

function buildReactionPatch(
  reactions: ReactionRow[],
  storyId: string,
  viewerUserId: string | null
): VideoFeedReactionPatch {
  const storyReactions = reactions.filter(
    (reaction) => reaction.story_id === storyId
  );

  const userReactions = storyReactions
    .filter((reaction) => reaction.user_id === viewerUserId)
    .map((reaction) => reaction.reaction_type)
    .filter(
      (reaction): reaction is VideoFeedReactionType =>
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

export async function patchVideoFeedReactionCountsForStory(
  storyId: string,
  viewerUserId: string | null
): Promise<VideoFeedReactionPatch | null> {
  if (!storyId) return null;

  const demoCapabilities = await getDemoContentSchemaCapabilities();
  let reactionQuery = supabase
    .from("story_reactions")
    .select("story_id, user_id, reaction_type, is_demo")
    .eq("story_id", storyId);

  reactionQuery = applyGenuinePublicDemoFilter(
    reactionQuery,
    "story_reactions",
    demoCapabilities
  );

  const { data: reactionData } = await reactionQuery;

  const reactions = filterGenuinePublicDemoRows(
    ((reactionData as ReactionRow[]) ?? []) as ReactionRow[]
  );
  return buildReactionPatch(reactions, storyId, viewerUserId);
}
