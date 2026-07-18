import type { ReactNode } from "react";
import type {
  FeedDisplayItem,
  FeedStoryDisplay,
  FeedVideoResponseDisplay,
} from "../../lib/community-feed/enrichFeedItems";

export type FeedReactionType = "amen" | "praise_god" | "encouraged" | "praying";

export type CommunityFeedPostCallbacks = {
  userId: string | null;
  savedStoryIds: string[];
  postOverflowMenuKey: string | null;
  setPostOverflowMenuKey: (key: string | null) => void;
  formatAuthorMeta: (
    location: string | null | undefined,
    createdAt: string | null | undefined
  ) => string;
  isOriginalPoster: (story: FeedStoryDisplay) => boolean;
  onOpenStory: (story: FeedStoryDisplay) => void;
  onShareStory: (story: FeedStoryDisplay) => void;
  onShareVideoResponse: (item: FeedVideoResponseDisplay) => void;
  onToggleReaction: (storyId: string, reactionType: FeedReactionType) => void;
  pendingReactionKey?: string | null;
  onToggleSaved: (story: FeedStoryDisplay) => void;
  onPrepareFeedReturn?: (storyId: string) => void;
  onResponseMessage?: (message: string) => void;
  onRefreshStoryVideoResponses?: (storyId: string) => void;
  onReportStory: (story: FeedStoryDisplay) => void;
  onReportVideoResponse: (item: FeedVideoResponseDisplay) => void;
  pendingBlockUserId?: string | null;
  onBlockStoryUser: (story: FeedStoryDisplay) => void;
  onHideFeedItem: (item: FeedDisplayItem) => void;
  onBlockFeedUser: (userId: string | null | undefined) => void;
  onGodDidIt: (story: FeedStoryDisplay) => void;
};

export type CommunityFeedPostShellProps = {
  id: string;
  className?: string;
  dedupeKey: string;
  header: ReactNode;
  body?: ReactNode;
  media?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  ownerSection?: ReactNode;
};

export type FeedStoryPresentation =
  | "testimony"
  | "praise"
  | "creator-studio"
  | "template"
  | "prayer-active"
  | "prayer-answered";

export type { FeedStoryDisplay, FeedVideoResponseDisplay, FeedDisplayItem };
