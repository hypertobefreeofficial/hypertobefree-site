"use client";

import { Play, Video } from "lucide-react";
import type { FeedApprovedVideoResponsePreview } from "../../lib/community-feed/loadParentApprovedVideoResponses";
import { formatRelativeResponseTime } from "../../lib/responses/publicVideoResponseLabels";
import PublicVideoResponseSafetyMenu from "./PublicVideoResponseSafetyMenu";
import styles from "./PublicVideoResponses.module.css";

type PublicVideoResponseCardProps = {
  response: FeedApprovedVideoResponsePreview;
  parentStoryId: string;
  parentOwnerUserId: string | null;
  currentUserId: string | null;
  onOpen: () => void;
  onActionMessage?: (message: string) => void;
  onResponseRemoved?: () => void;
};

export default function PublicVideoResponseCard({
  response,
  parentStoryId,
  parentOwnerUserId,
  currentUserId,
  onOpen,
  onActionMessage,
  onResponseRemoved,
}: PublicVideoResponseCardProps) {
  const avatarLabel = (response.authorName || "H").charAt(0).toUpperCase();

  return (
    <article
      className={styles.card}
      data-testid={`feed-parent-video-response-${response.id}`}
    >
      <PublicVideoResponseSafetyMenu
        response={response}
        parentStoryId={parentStoryId}
        parentOwnerUserId={parentOwnerUserId}
        currentUserId={currentUserId}
        onActionMessage={onActionMessage}
        onResponseRemoved={onResponseRemoved}
      />

      <button
        type="button"
        className={styles.cardOpen}
        data-response-card="true"
        aria-label={`Open video response from ${response.authorName || "community member"}`}
        onClick={onOpen}
      >
        <div className={styles.thumbWrap}>
          {response.signed_thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={response.signed_thumbnail_url}
              alt=""
              className={styles.thumb}
            />
          ) : (
            <div className={styles.thumbFallback}>
              <Video className="h-6 w-6" aria-hidden />
            </div>
          )}
          <span className={styles.playBadge} aria-hidden>
            <Play className="h-4 w-4 fill-current" />
          </span>
        </div>

        <div className={styles.meta}>
          <div className={styles.authorRow}>
            <span className={styles.avatar} aria-hidden>
              {avatarLabel}
            </span>
            <div>
              <div className={styles.authorName}>
                {response.authorName || "HTBF community member"}
              </div>
              <div className={styles.timestamp}>
                {formatRelativeResponseTime(response.created_at)}
              </div>
            </div>
          </div>
          {response.body?.trim() ? (
            <p className={styles.caption}>{response.body.trim()}</p>
          ) : null}
        </div>
      </button>
    </article>
  );
}
