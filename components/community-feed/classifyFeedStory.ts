import {
  isAnsweredPrayer,
  isPrayerStory,
  isPraiseStory,
} from "../../lib/community-feed/eligibility";
import {
  isCreatorStudioFeedPost,
  readStoredCreatorStudioDesignFromStory,
} from "../../lib/creatorStudioMetadata";
import type { FeedStoryDisplay, FeedStoryPresentation } from "./types";

export function classifyFeedStory(story: FeedStoryDisplay): FeedStoryPresentation {
  if (isAnsweredPrayer(story)) return "prayer-answered";
  if (isPrayerStory(story)) return "prayer-active";

  const hasVideoMedia = Boolean(story.signed_video_url || story.video_url);
  const hasImageMedia = Boolean(story.signed_image_url);

  if (
    isCreatorStudioFeedPost({
      aiSuggestions: story.ai_suggestions,
      creationMode: story.creation_mode,
      hasVideoMedia,
      hasImageMedia,
    }) &&
    readStoredCreatorStudioDesignFromStory(story)
  ) {
    return "creator-studio";
  }

  const metadata = story.ai_suggestions as Record<string, unknown> | null;
  const selectedTemplate = metadata?.selectedTemplate;
  if (
    selectedTemplate &&
    story.story_text &&
    !hasVideoMedia &&
    !hasImageMedia
  ) {
    return "template";
  }

  if (isPraiseStory(story)) return "praise";
  return "testimony";
}
