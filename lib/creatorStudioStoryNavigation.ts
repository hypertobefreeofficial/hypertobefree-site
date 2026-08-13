import {
  isCreatorStudioFeedPost,
  readStoredCreatorStudioDesignFromStory,
} from "./creatorStudioMetadata";

export type StoryDetailDestination = "video-feed" | "photo-viewer";

export function resolveStoryDetailDestination(story: {
  signed_video_url?: string | null;
  video_url?: string | null;
}): StoryDetailDestination {
  if (story.signed_video_url || story.video_url) {
    return "video-feed";
  }

  return "photo-viewer";
}

export function isCreatorStudioVideoStory(story: {
  ai_suggestions?: unknown;
  creation_mode?: string | null;
  signed_video_url?: string | null;
  video_url?: string | null;
}) {
  if (!(story.signed_video_url || story.video_url)) {
    return false;
  }

  return isCreatorStudioFeedPost({
    aiSuggestions: story.ai_suggestions,
    creationMode: story.creation_mode,
    hasVideoMedia: true,
  });
}

export function isCreatorStudioPhotoStory(story: {
  ai_suggestions?: unknown;
  creation_mode?: string | null;
  signed_video_url?: string | null;
  video_url?: string | null;
  signed_image_url?: string | null;
  image_url?: string | null;
}) {
  const hasVideo = Boolean(story.signed_video_url || story.video_url);
  const hasPhoto = Boolean(story.signed_image_url || story.image_url);

  if (hasVideo || !hasPhoto) {
    return false;
  }

  return isCreatorStudioFeedPost({
    aiSuggestions: story.ai_suggestions,
    creationMode: story.creation_mode,
    hasImageMedia: true,
  });
}

export function readCreatorStudioVideoFeedDesign(story: {
  ai_suggestions?: unknown;
  creation_mode?: string | null;
  signed_video_url?: string | null;
  video_url?: string | null;
}) {
  if (!isCreatorStudioVideoStory(story)) {
    return null;
  }

  return readStoredCreatorStudioDesignFromStory({
    ai_suggestions: story.ai_suggestions ?? null,
    creation_mode: story.creation_mode,
  });
}
