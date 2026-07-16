import type { FeedVideoResponseDisplay } from "./enrichFeedItems";

export function buildVideoResponseSharePayload(
  item: FeedVideoResponseDisplay,
  origin = "https://hypertobefree.com"
) {
  const parentStoryId = item.parentStoryId?.trim();
  const shareUrl = parentStoryId
    ? `${origin}/prayer?story=${parentStoryId}`
    : `${origin}/prayer`;

  const parentLabel = item.parentStoryAuthor?.trim() || "this prayer request";
  const excerpt = item.parentStoryTitle?.trim().slice(0, 140);

  const shareText = excerpt
    ? `Watch this video prayer for ${parentLabel}: ${excerpt}`
    : `Watch this video prayer for ${parentLabel} on Hyper to Be Free.`;

  return {
    title: "Hyper to Be Free — Video prayer",
    text: shareText,
    url: shareUrl,
    parentStoryId,
  };
}
