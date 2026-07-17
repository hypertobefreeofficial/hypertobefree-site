"use client";

import Link from "next/link";
import { Play, Video } from "lucide-react";
import type { FeedApprovedVideoResponsePreview } from "../../lib/community-feed/loadParentApprovedVideoResponses";
import { formatFeedVideoResponseCount } from "../../lib/community-feed/loadParentApprovedVideoResponses";
import styles from "../FreedomFeed.module.css";

const VISIBLE_LIMIT = 4;

type CommunityFeedParentVideoResponsesProps = {
  storyId: string;
  responses: FeedApprovedVideoResponsePreview[];
};

export default function CommunityFeedParentVideoResponses({
  storyId,
  responses,
}: CommunityFeedParentVideoResponsesProps) {
  if (responses.length === 0) return null;

  const visible = responses.slice(0, VISIBLE_LIMIT);
  const hiddenCount = Math.max(responses.length - visible.length, 0);

  return (
    <section
      className={styles.parentVideoResponsesSection}
      data-testid="feed-parent-video-responses"
      aria-label="Video responses"
    >
      <div className={styles.parentVideoResponsesHeader}>
        <div className={styles.parentVideoResponsesTitleRow}>
          <Video className="h-4 w-4 shrink-0" aria-hidden />
          <h3 className={styles.parentVideoResponsesTitle}>Video Responses</h3>
        </div>
        <span className={styles.parentVideoResponsesCount}>
          {formatFeedVideoResponseCount(responses.length)}
        </span>
      </div>

      <div className={styles.parentVideoResponsesRail} role="list">
        {visible.map((response) => (
          <Link
            key={response.id}
            href={`#freedom-feed-response-${response.id}`}
            className={styles.parentVideoResponseCard}
            role="listitem"
            data-testid={`feed-parent-video-response-${response.id}`}
          >
            <div className={styles.parentVideoResponseThumbWrap}>
              {response.signed_thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={response.signed_thumbnail_url}
                  alt=""
                  className={styles.parentVideoResponseThumb}
                />
              ) : (
                <div className={styles.parentVideoResponseThumbFallback}>
                  <Video className="h-5 w-5" aria-hidden />
                </div>
              )}
              <span className={styles.parentVideoResponsePlayBadge} aria-hidden>
                <Play className="h-3.5 w-3.5 fill-current" />
              </span>
            </div>
            {response.authorName ? (
              <span className={styles.parentVideoResponseAuthor}>
                {response.authorName}
              </span>
            ) : null}
          </Link>
        ))}
      </div>

      {hiddenCount > 0 ? (
        <Link
          href={`#freedom-feed-response-${responses[VISIBLE_LIMIT]?.id ?? responses[0]?.id}`}
          className={styles.parentVideoResponsesViewAll}
        >
          View all {responses.length}
        </Link>
      ) : null}
    </section>
  );
}
