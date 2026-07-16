import type { FeedStoryDisplay } from "./types";
import styles from "../FreedomFeed.module.css";

export function buildEngagementSummary(story: FeedStoryDisplay) {
  const parts: string[] = [];

  if (story.reaction_counts.amen > 0) {
    parts.push(`🙏 ${story.reaction_counts.amen} Amen`);
  }

  if (story.reaction_counts.praise_god > 0) {
    parts.push(`✨ ${story.reaction_counts.praise_god} Praise God`);
  }

  if (story.reaction_counts.encouraged > 0) {
    parts.push(`💙 ${story.reaction_counts.encouraged} Encouraged`);
  }

  return parts.join(" · ");
}

type CommunityFeedEngagementSummaryProps = {
  story: FeedStoryDisplay;
};

export default function CommunityFeedEngagementSummary({
  story,
}: CommunityFeedEngagementSummaryProps) {
  const summary = buildEngagementSummary(story);
  if (!summary) return null;

  return (
    <p className={styles.engagementSummary} data-testid="feed-engagement-summary">
      {summary}
    </p>
  );
}
