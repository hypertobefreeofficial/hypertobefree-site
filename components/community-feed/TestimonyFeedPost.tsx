import type { ReactNode } from "react";
import CommunityFeedPostShell from "./CommunityFeedPostShell";
import CommunityFeedPostHeader from "./CommunityFeedPostHeader";
import { CommunityFeedStoryOverflowMenu } from "./CommunityFeedPostOverflowMenu";
import CommunityFeedStandardActions from "./CommunityFeedPostActions";
import FeedStoryText, { FeedStoryLead } from "./FeedStoryText";
import type { CommunityFeedPostCallbacks, FeedStoryDisplay } from "./types";

type TestimonyFeedPostProps = {
  story: FeedStoryDisplay;
  callbacks: CommunityFeedPostCallbacks;
  media?: ReactNode;
  showCaptionAfterMedia?: boolean;
  textOnly?: boolean;
};

export default function TestimonyFeedPost({
  story,
  callbacks,
  media,
  showCaptionAfterMedia = false,
  textOnly = false,
}: TestimonyFeedPostProps) {
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
        callbacks.setPostOverflowMenuKey(
          menuOpen ? null : story.dedupeKey
        )
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
        textOnly ? (
          <FeedStoryText
            text={story.story_text}
            variant="testimony"
            onOpen={() => callbacks.onOpenStory(story)}
          />
        ) : (
          <>
            <FeedStoryLead text={story.story_text} variant="testimony" />
            {media ? null : (
              <FeedStoryText
                text={story.story_text}
                variant="testimony"
                onOpen={() => callbacks.onOpenStory(story)}
              />
            )}
          </>
        )
      ) : null}
    </>
  );

  const captionAfter =
    showCaptionAfterMedia && story.story_text ? (
      <FeedStoryText text={story.story_text} variant="testimony" />
    ) : null;

  return (
    <CommunityFeedPostShell
      id={`freedom-feed-story-${story.id}`}
      dedupeKey={story.dedupeKey}
      header={header}
      body={body}
      media={media}
      status={captionAfter}
      actions={
        <CommunityFeedStandardActions
          story={story}
          savedStoryIds={callbacks.savedStoryIds}
          currentUserId={callbacks.userId}
          onToggleReaction={callbacks.onToggleReaction}
          pendingReactionKey={callbacks.pendingReactionKey}
          onShare={() => callbacks.onShareStory(story)}
          onToggleSaved={() => void callbacks.onToggleSaved(story)}
          onPrepareReturn={() => callbacks.onPrepareFeedReturn?.(story.id)}
          onResponseMessage={callbacks.onResponseMessage}
          onRefreshStoryVideoResponses={callbacks.onRefreshStoryVideoResponses}
        />
      }
    />
  );
}
