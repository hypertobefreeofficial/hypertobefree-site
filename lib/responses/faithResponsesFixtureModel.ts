import type { FaithResponsesViewerModel } from "../../components/public-video-responses/FaithResponsesViewer";
import { getCommunityFeedVisualValidationFixturesPage1 } from "../community-feed/visualValidationFixtures";
import type { FeedStoryDisplay } from "../community-feed/enrichFeedItems";

export function loadFaithResponsesFixtureModel(
  parentStoryId: string,
  initialResponseId?: string | null
): FaithResponsesViewerModel | null {
  const story = getCommunityFeedVisualValidationFixturesPage1().find(
    (item): item is FeedStoryDisplay =>
      item.kind === "story" && item.id === parentStoryId
  );

  if (!story || story.approved_video_responses.length === 0) {
    return null;
  }

  return {
    parentStoryId: story.id,
    parentAuthorName: story.name,
    parentCaption: story.story_text,
    parentThumbnailUrl: story.signed_thumbnail_url,
    parentOwnerUserId: story.user_id,
    responseContext: story.response_context,
    responses: story.approved_video_responses,
    initialResponseId,
  };
}
