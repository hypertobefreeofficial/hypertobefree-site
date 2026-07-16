import Link from "next/link";
import { Bookmark, Share2, Video } from "lucide-react";
import type { FeedStoryDisplay } from "./types";
import CommunityFeedEngagementSummary from "./CommunityFeedEngagementSummary";
import CommunityFeedReactionSelector from "./CommunityFeedReactionSelector";
import styles from "../FreedomFeed.module.css";

type CommunityFeedStandardActionsProps = {
  story: FeedStoryDisplay;
  savedStoryIds: string[];
  showVideoResponse?: boolean;
  onToggleReaction: (
    storyId: string,
    reactionType: import("./types").FeedReactionType
  ) => void;
  onShare: () => void;
  onToggleSaved: () => void;
  videoResponseHref?: string;
};

export default function CommunityFeedStandardActions({
  story,
  savedStoryIds,
  showVideoResponse = false,
  onToggleReaction,
  onShare,
  onToggleSaved,
  videoResponseHref = "/prayer",
}: CommunityFeedStandardActionsProps) {
  const isSaved = savedStoryIds.includes(story.id);

  return (
    <>
      <CommunityFeedEngagementSummary story={story} />

      <div
        className={`${styles.primaryActionRow} ${
          showVideoResponse ? "" : styles.primaryActionRowThree
        }`}
      >
        <CommunityFeedReactionSelector
          storyId={story.id}
          userReactions={story.user_reactions}
          onToggleReaction={onToggleReaction}
        />

        {showVideoResponse ? (
          <Link href={videoResponseHref} className={styles.primaryActionButton}>
            <Video className="h-4 w-4 shrink-0" aria-hidden />
            <span className={styles.primaryActionLabelShort}>Video</span>
            <span className={styles.primaryActionLabelFull}>Video response</span>
          </Link>
        ) : null}

        <button
          type="button"
          className={styles.primaryActionButton}
          onClick={onShare}
        >
          <Share2 className="h-4 w-4 shrink-0" aria-hidden />
          Share
        </button>

        <button
          type="button"
          className={`${styles.primaryActionButton} ${
            isSaved ? styles.primaryActionButtonActive : ""
          }`}
          onClick={onToggleSaved}
        >
          <Bookmark
            className={`h-4 w-4 shrink-0 ${isSaved ? "fill-current" : ""}`}
            aria-hidden
          />
          {isSaved ? "Saved" : "Save"}
        </button>
      </div>
    </>
  );
}
