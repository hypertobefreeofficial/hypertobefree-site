import type { ReactNode } from "react";
import { classifyFeedStory } from "./classifyFeedStory";
import TestimonyFeedPost from "./TestimonyFeedPost";
import PraiseFeedPost from "./PraiseFeedPost";
import PrayerRequestFeedPost from "./PrayerRequestFeedPost";
import AnsweredPrayerFeedPost from "./AnsweredPrayerFeedPost";
import CreatorStudioFeedPost from "./CreatorStudioFeedPost";
import type { CommunityFeedPostCallbacks, FeedStoryDisplay } from "./types";

export type CommunityFeedStoryItemProps = {
  story: FeedStoryDisplay;
  callbacks: CommunityFeedPostCallbacks;
  media?: ReactNode;
  answerMedia?: ReactNode;
  showCaptionAfterMedia?: boolean;
  textOnly?: boolean;
  supplementalCaption?: string | null;
};

export default function CommunityFeedStoryItem({
  story,
  callbacks,
  media,
  answerMedia,
  showCaptionAfterMedia = false,
  textOnly = false,
  supplementalCaption,
}: CommunityFeedStoryItemProps) {
  const presentation = classifyFeedStory(story);

  switch (presentation) {
    case "prayer-answered":
      return (
        <AnsweredPrayerFeedPost
          story={story}
          callbacks={callbacks}
          media={media}
          answerMedia={answerMedia}
        />
      );
    case "prayer-active":
      return (
        <PrayerRequestFeedPost
          story={story}
          callbacks={callbacks}
          media={media}
        />
      );
    case "praise":
      return (
        <PraiseFeedPost
          story={story}
          callbacks={callbacks}
          media={media}
          showCaptionAfterMedia={showCaptionAfterMedia}
        />
      );
    case "creator-studio":
      return (
        <CreatorStudioFeedPost
          story={story}
          callbacks={callbacks}
          media={media ?? null}
          supplementalCaption={supplementalCaption}
        />
      );
    case "template":
    case "testimony":
    default:
      return (
        <TestimonyFeedPost
          story={story}
          callbacks={callbacks}
          media={media}
          showCaptionAfterMedia={showCaptionAfterMedia}
          textOnly={textOnly}
        />
      );
  }
}
