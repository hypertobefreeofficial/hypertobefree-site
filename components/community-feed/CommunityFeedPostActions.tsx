import Link from "next/link";
import { Bookmark, Share2, Video } from "lucide-react";
import type { FeedStoryDisplay } from "./types";
import CommunityFeedEngagementSummary from "./CommunityFeedEngagementSummary";
import CommunityFeedInlineEncouragement from "./CommunityFeedInlineEncouragement";
import PublicVideoResponseModule from "../public-video-responses/PublicVideoResponseModule";
import CommunityFeedRespondLauncher from "./CommunityFeedRespondLauncher";
import styles from "../FreedomFeed.module.css";

type CommunityFeedStandardActionsProps = {
  story: FeedStoryDisplay;
  savedStoryIds: string[];
  currentUserId?: string | null;
  showVideoResponse?: boolean;
  onToggleReaction: (
    storyId: string,
    reactionType: import("./types").FeedReactionType
  ) => void;
  pendingReactionKey?: string | null;
  onShare: () => void;
  onToggleSaved: () => void;
  onPrepareReturn?: () => void;
  onResponseMessage?: (message: string) => void;
  onRefreshStoryVideoResponses?: (storyId: string) => void;
  videoResponseHref?: string;
};

export default function CommunityFeedStandardActions({
  story,
  savedStoryIds,
  currentUserId = null,
  showVideoResponse = false,
  onToggleReaction,
  pendingReactionKey = null,
  onShare,
  onToggleSaved,
  onPrepareReturn,
  onResponseMessage,
  onRefreshStoryVideoResponses,
  videoResponseHref = "/prayer",
}: CommunityFeedStandardActionsProps) {
  const isSaved = savedStoryIds.includes(story.id);

  return (
    <>
      <CommunityFeedEngagementSummary story={story} />

      <CommunityFeedInlineEncouragement
        storyId={story.id}
        userReactions={story.user_reactions}
        pendingReactionKey={pendingReactionKey}
        onToggleReaction={onToggleReaction}
      />

      <div
        className={`${styles.primaryActionRow} mt-2 ${
          showVideoResponse ? styles.primaryActionRowFive : styles.primaryActionRowThree
        }`}
        data-testid="feed-main-action-row"
      >
        <CommunityFeedRespondLauncher
          story={story}
          currentUserId={currentUserId}
          onPrepareReturn={onPrepareReturn}
          onResponseMessage={onResponseMessage}
          onRefreshStoryVideoResponses={onRefreshStoryVideoResponses}
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

      <PublicVideoResponseModule
        storyId={story.id}
        parentOwnerUserId={story.user_id}
        currentUserId={currentUserId}
        responseContext={story.response_context}
        approvedResponses={story.approved_video_responses}
        pendingResponse={story.viewer_pending_response}
        returnAnchorId={`freedom-feed-story-${story.id}`}
        onPendingRemoved={() => onRefreshStoryVideoResponses?.(story.id)}
        onResponseMessage={(message) => {
          onResponseMessage?.(message);
          onRefreshStoryVideoResponses?.(story.id);
        }}
      />
    </>
  );
}
