"use client";

import { Video } from "lucide-react";
import type { FeedPendingVideoResponsePreview } from "../../lib/community-feed/loadViewerPendingVideoResponses";
import { formatRelativeResponseTime } from "../../lib/responses/publicVideoResponseLabels";
import styles from "./PublicVideoResponses.module.css";

type PublicVideoResponsePendingCardProps = {
  storyId: string;
  pending: FeedPendingVideoResponsePreview;
  onOpenStatus?: () => void;
  onDelete?: () => void;
};

export default function PublicVideoResponsePendingCard({
  pending,
  onOpenStatus,
  onDelete,
}: PublicVideoResponsePendingCardProps) {
  return (
    <article
      className={styles.pendingCard}
      data-testid="feed-pending-video-response"
      aria-label="Your pending video response"
    >
      <div className={styles.pendingThumbWrap}>
        {pending.signed_thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pending.signed_thumbnail_url}
            alt=""
            className={styles.thumb}
          />
        ) : (
          <div className={styles.thumbFallback}>
            <Video className="h-6 w-6" aria-hidden />
          </div>
        )}
        <span className={styles.pendingBadge}>Pending review</span>
      </div>

      <div className={styles.pendingBody}>
        <h4 className={styles.pendingTitle}>Your response is under review</h4>
        <p className={styles.pendingCopy}>
          Submitted {formatRelativeResponseTime(pending.created_at)}. Only you
          can see this until HTBF approves it for the community.
        </p>
        <div className={styles.pendingActions}>
          <button
            type="button"
            className={styles.pendingButton}
            onClick={onOpenStatus}
          >
            View status
          </button>
          {onDelete ? (
            <button
              type="button"
              className={styles.pendingDanger}
              onClick={onDelete}
            >
              Delete submission
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
