import type { ReactNode } from "react";
import CommunityFeedPostShell from "./CommunityFeedPostShell";
import CommunityFeedPostHeader from "./CommunityFeedPostHeader";
import { CommunityFeedStoryOverflowMenu } from "./CommunityFeedPostOverflowMenu";
import CommunityFeedStandardActions from "./CommunityFeedPostActions";
import type { CommunityFeedPostCallbacks, FeedStoryDisplay } from "./types";

type CreatorStudioFeedPostProps = {
  story: FeedStoryDisplay;
  callbacks: CommunityFeedPostCallbacks;
  media: ReactNode;
  supplementalCaption?: string | null;
};

export default function CreatorStudioFeedPost({
  story,
  callbacks,
  media,
  supplementalCaption,
}: CreatorStudioFeedPostProps) {
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

  return (
    <CommunityFeedPostShell
      id={`freedom-feed-story-${story.id}`}
      dedupeKey={story.dedupeKey}
      header={header}
      media={media}
      status={
        supplementalCaption ? (
          <p className="px-4 pb-2 text-sm leading-6 text-slate-600">
            {supplementalCaption}
          </p>
        ) : null
      }
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
