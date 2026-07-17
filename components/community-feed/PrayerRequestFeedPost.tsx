import { Bookmark, Share2 } from "lucide-react";
import type { ReactNode } from "react";
import CommunityFeedPostShell from "./CommunityFeedPostShell";
import CommunityFeedPostHeader from "./CommunityFeedPostHeader";
import { CommunityFeedStoryOverflowMenu } from "./CommunityFeedPostOverflowMenu";
import CommunityFeedRespondLauncher from "./CommunityFeedRespondLauncher";
import FeedStoryText from "./FeedStoryText";
import PublicVideoResponseModule from "../public-video-responses/PublicVideoResponseModule";
import type { CommunityFeedPostCallbacks, FeedStoryDisplay } from "./types";
import { canPersistentlyHideFeedItem } from "../../lib/community-feed/canHideFeedItem";
import styles from "../FreedomFeed.module.css";

type PrayerRequestFeedPostProps = {
  story: FeedStoryDisplay;
  callbacks: CommunityFeedPostCallbacks;
  media?: ReactNode;
};

export default function PrayerRequestFeedPost({
  story,
  callbacks,
  media,
}: PrayerRequestFeedPostProps) {
  const isOwner = callbacks.isOriginalPoster(story);
  const menuOpen = callbacks.postOverflowMenuKey === story.dedupeKey;
  const praying = story.reaction_counts.praying;
  const isPraying = story.user_reactions.includes("praying");
  const isSaved = callbacks.savedStoryIds.includes(story.id);

  const header = (
    <CommunityFeedPostHeader
      avatarLabel={(story.name || "H").charAt(0).toUpperCase()}
      name={story.name || "HTBF Community"}
      meta={callbacks.formatAuthorMeta(story.location, story.created_at)}
      dedupeKey={story.dedupeKey}
      menuOpen={menuOpen}
      onToggleMenu={() =>
        callbacks.setPostOverflowMenuKey(menuOpen ? null : story.dedupeKey)
      }
      menu={
        <CommunityFeedStoryOverflowMenu
          story={story}
          isOwner={isOwner}
          onReport={() => callbacks.onReportStory(story)}
          onBlockUser={
            !isOwner ? () => void callbacks.onBlockStoryUser(story) : undefined
          }
          onHide={() => void callbacks.onHideFeedItem(story)}
          showHidePost={canPersistentlyHideFeedItem(story)}
        />
      }
    />
  );

  const body = story.story_text ? (
    <FeedStoryText text={story.story_text} variant="prayer" />
  ) : null;

  const status = (
    <div className={`${styles.postInset} ${styles.postStatus}`}>
      <div className={styles.panelPrayerCompact}>
        <div className={styles.panelPrayerLabel}>Prayer request</div>
        <div className={styles.panelPrayerCount}>
          {praying === 0
            ? "Be the first to pray"
            : praying === 1
              ? "1 person is praying"
              : `${praying} people are praying`}
        </div>
        <p className={styles.panelPrayerSupport}>
          Stand with this request and let them know they are not praying alone.
        </p>
      </div>
    </div>
  );

  const actions = (
    <>
      <div className={styles.primaryActionRow}>
        <button
          type="button"
          className={`${styles.primaryActionButton} ${
            isPraying ? styles.prayerCompactActionActive : ""
          }`}
          aria-pressed={isPraying}
          onClick={() => callbacks.onToggleReaction(story.id, "praying")}
        >
          {isPraying ? "Praying" : "I'm Praying"}
        </button>

        <CommunityFeedRespondLauncher
          story={story}
          currentUserId={callbacks.userId}
          onPrepareReturn={() => callbacks.onPrepareFeedReturn?.(story.id)}
          onResponseMessage={callbacks.onResponseMessage}
          onRefreshStoryVideoResponses={callbacks.onRefreshStoryVideoResponses}
        />

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

      <PublicVideoResponseModule
        storyId={story.id}
        parentOwnerUserId={story.user_id}
        currentUserId={callbacks.userId}
        responseContext={story.response_context}
        approvedResponses={story.approved_video_responses}
        pendingResponse={story.viewer_pending_response}
        returnAnchorId={`freedom-feed-story-${story.id}`}
        onPendingRemoved={() =>
          callbacks.onRefreshStoryVideoResponses?.(story.id)
        }
        onResponseMessage={callbacks.onResponseMessage}
      />
    </>
  );

  const ownerSection = isOwner ? (
    <div className={styles.ownerSection}>
      <div className={styles.ownerSectionLabel}>Your prayer request</div>
      <p className={styles.ownerSectionCopy}>
        Has God answered this prayer? Share the good news with everyone who
        prayed.
      </p>
      <button
        type="button"
        className={styles.godDidItButton}
        data-testid="god-did-it-button"
        onClick={() => callbacks.onGodDidIt(story)}
      >
        God Did It
      </button>
    </div>
  ) : null;

  return (
    <CommunityFeedPostShell
      id={`freedom-feed-story-${story.id}`}
      dedupeKey={story.dedupeKey}
      header={header}
      body={body}
      media={media}
      status={status}
      actions={actions}
      ownerSection={ownerSection}
    />
  );
}
