import Link from "next/link";
import { Bookmark, CheckCircle2, Share2, Video } from "lucide-react";
import type { ReactNode } from "react";
import { formatFeedRelativeTime } from "../../lib/community-feed/formatFeedRelativeTime";
import CommunityFeedPostShell from "./CommunityFeedPostShell";
import CommunityFeedPostHeader from "./CommunityFeedPostHeader";
import { CommunityFeedStoryOverflowMenu } from "./CommunityFeedPostOverflowMenu";
import type { CommunityFeedPostCallbacks, FeedStoryDisplay } from "./types";
import { canPersistentlyHideFeedItem } from "../../lib/community-feed/canHideFeedItem";
import styles from "../FreedomFeed.module.css";

type AnsweredPrayerFeedPostProps = {
  story: FeedStoryDisplay;
  callbacks: CommunityFeedPostCallbacks;
  media?: ReactNode;
  answerMedia?: ReactNode;
};

export default function AnsweredPrayerFeedPost({
  story,
  callbacks,
  media,
  answerMedia,
}: AnsweredPrayerFeedPostProps) {
  const isOwner = callbacks.isOriginalPoster(story);
  const menuOpen = callbacks.postOverflowMenuKey === story.dedupeKey;
  const isSaved = callbacks.savedStoryIds.includes(story.id);
  const answeredDate = story.answered_at
    ? formatFeedRelativeTime(story.answered_at)
    : null;

  const header = (
    <CommunityFeedPostHeader
      avatarLabel={(story.name || "H").charAt(0).toUpperCase()}
      name={story.name || "HTBF Community"}
      meta={callbacks.formatAuthorMeta(story.location, story.created_at)}
      badge={
        <span className={styles.badgeAnswered} aria-label="Answered prayer">
          Answered
        </span>
      }
      dedupeKey={story.dedupeKey}
      menuOpen={menuOpen}
      onToggleMenu={() =>
        callbacks.setPostOverflowMenuKey(menuOpen ? null : story.dedupeKey)
      }
      onCloseMenu={() => callbacks.setPostOverflowMenuKey(null)}
      menu={
        <CommunityFeedStoryOverflowMenu
          story={story}
          isOwner={isOwner}
          onReport={() => callbacks.onReportStory(story)}
          blockPending={callbacks.pendingBlockUserId === story.user_id}
          onBlockUser={
            !isOwner ? () => void callbacks.onBlockStoryUser(story) : undefined
          }
          onHide={() => void callbacks.onHideFeedItem(story)}
          showHidePost={canPersistentlyHideFeedItem(story)}
        />
      }
    />
  );

  const status = (
    <div className={`${styles.postInset} ${styles.postStatus}`}>
      <div className={styles.answeredPanel}>
        <div className={styles.answeredHeading}>
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          <span>God did it</span>
        </div>
        <p className={styles.answeredIntro}>This prayer was answered.</p>

        {story.story_text ? (
          <div className={styles.answeredBlock}>
            <div className={styles.answeredBlockLabel}>Original prayer</div>
            <blockquote className={styles.answeredQuote}>
              {story.story_text}
            </blockquote>
          </div>
        ) : null}

        <div className={styles.answeredBlock}>
          <div className={styles.answeredBlockLabel}>The update</div>
          {story.answered_text ? (
            <blockquote className={styles.answeredQuote}>
              {story.answered_text}
            </blockquote>
          ) : (
            <p className={styles.answeredFallback}>
              This prayer request was marked answered by the person who shared
              it.
            </p>
          )}
        </div>

        {answeredDate ? (
          <p className={styles.answeredDate}>Answered {answeredDate}</p>
        ) : null}

        {story.reaction_counts.praying > 0 ? (
          <p className={styles.answeredPrayerCount}>
            🙏{" "}
            {story.reaction_counts.praying === 1
              ? "1 believer prayed with this request"
              : `${story.reaction_counts.praying} believers prayed with this request`}
          </p>
        ) : null}
      </div>
    </div>
  );

  const actions = (
    <div className={styles.primaryActionRow}>
      <Link href="/prayer" className={styles.primaryActionButton}>
        <Video className="h-4 w-4 shrink-0" aria-hidden />
        <span className={styles.primaryActionLabelShort}>Video</span>
        <span className={styles.primaryActionLabelFull}>Video response</span>
      </Link>

      <button
        type="button"
        className={styles.primaryActionButton}
        onClick={() => callbacks.onShareStory(story)}
      >
        <Share2 className="h-4 w-4 shrink-0" aria-hidden />
        Share
      </button>

      <button
        type="button"
        className={`${styles.primaryActionButton} ${
          isSaved ? styles.primaryActionButtonActive : ""
        }`}
        onClick={() => void callbacks.onToggleSaved(story)}
      >
        <Bookmark
          className={`h-4 w-4 shrink-0 ${isSaved ? "fill-current" : ""}`}
          aria-hidden
        />
        {isSaved ? "Saved" : "Save"}
      </button>
    </div>
  );

  return (
    <CommunityFeedPostShell
      id={`freedom-feed-story-${story.id}`}
      dedupeKey={story.dedupeKey}
      header={header}
      media={media}
      status={
        <>
          {status}
          {answerMedia}
        </>
      }
      actions={actions}
    />
  );
}
