} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

type ReactionType = "amen" | "praise_god" | "encouraged";

type ApprovedStory = {
id: string;
name: string | null;
@@ -25,59 +27,167 @@ type ApprovedStory = {
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

export default function Home() {
const [stories, setStories] = useState<ApprovedStory[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [reactionMessage, setReactionMessage] = useState("");

useEffect(() => {
    async function loadApprovedStories() {
      const { data, error } = await supabase
        .from("stories")
        .select(
          "id, name, location, story_type, story_text, video_url, status, created_at"
        )
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(6);
    async function loadPage() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUserId(user?.id ?? null);
      await loadApprovedStories(user?.id ?? null);
    }

    loadPage();
  }, []);

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
  }

  async function toggleReaction(storyId: string, reactionType: ReactionType) {
    setReactionMessage("");

    if (!userId) {
      setReactionMessage("Please sign in to react to stories.");
      return;
    }

    const story = stories.find((item) => item.id === storyId);
    const alreadyReacted = story?.user_reactions.includes(reactionType);

      if (error || !data) {
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

      const storiesWithSignedVideos = await Promise.all(
        data.map(async (story) => {
          if (!story.video_url) {
            return {
              ...story,
              signed_video_url: null,
            };
          }

          const { data: signedData, error: signedError } =
            await supabase.storage
              .from("story-videos")
              .createSignedUrl(story.video_url, 60 * 60);

          if (signedError || !signedData?.signedUrl) {
            return {
              ...story,
              signed_video_url: null,
            };
          }

          return {
            ...story,
            signed_video_url: signedData.signedUrl,
          };
        })
      setStories((currentStories) =>
        currentStories.map((item) =>
          item.id === storyId
            ? {
                ...item,
                reaction_counts: {
                  ...item.reaction_counts,
                  [reactionType]: Math.max(
                    item.reaction_counts[reactionType] - 1,
                    0
                  ),
                },
                user_reactions: item.user_reactions.filter(
                  (reaction) => reaction !== reactionType
                ),
              }
            : item
        )
);

      setStories(storiesWithSignedVideos);
      return;
}

    loadApprovedStories();
  }, []);
    const { error } = await supabase.from("story_reactions").insert({
      story_id: storyId,
      user_id: userId,
      reaction_type: reactionType,
    });

    if (error) {
      setReactionMessage(`Could not add reaction: ${error.message}`);
      return;
    }

    setStories((currentStories) =>
      currentStories.map((item) =>
        item.id === storyId
          ? {
              ...item,
              reaction_counts: {
                ...item.reaction_counts,
                [reactionType]: item.reaction_counts[reactionType] + 1,
              },
              user_reactions: [...item.user_reactions, reactionType],
            }
          : item
      )
    );
  }

const categories = [
"Freedom",
@@ -277,6 +387,12 @@ export default function Home() {
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
@@ -328,16 +444,27 @@ export default function Home() {
{story.location || "Location not shared"}
</div>

                  <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                    <span className="rounded-full bg-slate-100 px-3 py-1.5">
                      Amen
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1.5">
                      Praise God
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1.5">
                      This encouraged me
                    </span>
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
@@ -516,6 +643,31 @@ export default function Home() {
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

function InfoCard({
icon,
title,
