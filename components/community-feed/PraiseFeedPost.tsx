import styles from "../FreedomFeed.module.css";
import type { ReactNode } from "react";
import CommunityFeedPostShell from "./CommunityFeedPostShell";
import CommunityFeedPostHeader from "./CommunityFeedPostHeader";
import { CommunityFeedStoryOverflowMenu } from "./CommunityFeedPostOverflowMenu";
import CommunityFeedStandardActions from "./CommunityFeedPostActions";
import FeedStoryText, { FeedStoryLead } from "./FeedStoryText";
import type { CommunityFeedPostCallbacks, FeedStoryDisplay } from "./types";

type PraiseFeedPostProps = {
  story: FeedStoryDisplay;
  callbacks: CommunityFeedPostCallbacks;
  media?: ReactNode;
  showCaptionAfterMedia?: boolean;
};

export default function PraiseFeedPost({
  story,
  callbacks,
  media,
  showCaptionAfterMedia = false,
}: PraiseFeedPostProps) {
  const isOwner = callbacks.isOriginalPoster(story);
  const menuOpen = callbacks.postOverflowMenuKey === story.dedupeKey;

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
        />
      }
    />
  );

  const body = (
    <>
      {!showCaptionAfterMedia && story.story_text ? (
        <>
          <div className={styles.praiseAccentWrap}>
            <FeedStoryLead text={story.story_text} variant="praise" />
          </div>
          {!media ? (
            <FeedStoryText text={story.story_text} variant="praise" />
          ) : null}
        </>
      ) : null}
    </>
  );

  const captionAfter =
    showCaptionAfterMedia && story.story_text ? (
      <FeedStoryText text={story.story_text} variant="praise" />
    ) : null;

  return (
    <CommunityFeedPostShell
      id={`freedom-feed-story-${story.id}`}
      dedupeKey={story.dedupeKey}
      header={header}
      body={
        <>
          {body}
          <div className="sr-only" aria-hidden>
            Praise report
          </div>
        </>
      }
      media={media}
      status={captionAfter}
      actions={
        <CommunityFeedStandardActions
          story={story}
          savedStoryIds={callbacks.savedStoryIds}
          onToggleReaction={callbacks.onToggleReaction}
          onShare={() => callbacks.onShareStory(story)}
          onToggleSaved={() => void callbacks.onToggleSaved(story)}
        />
      }
    />
  );
}
