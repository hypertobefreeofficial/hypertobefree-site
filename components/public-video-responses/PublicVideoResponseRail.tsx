"use client";

import { Video } from "lucide-react";
import type { FeedApprovedVideoResponsePreview } from "../../lib/community-feed/loadParentApprovedVideoResponses";
import type { FeedPendingVideoResponsePreview } from "../../lib/community-feed/loadViewerPendingVideoResponses";
import {
  formatFeedVideoResponseCount,
} from "../../lib/community-feed/loadParentApprovedVideoResponses";
import { responseModuleTitle } from "../../lib/responses/publicVideoResponseLabels";
import type { PublicVideoResponseContext } from "../../lib/responses/publicVideoResponseContext";
import PublicVideoResponseCard from "./PublicVideoResponseCard";
import PublicVideoResponsePendingCard from "./PublicVideoResponsePendingCard";
import styles from "./PublicVideoResponses.module.css";

type PublicVideoResponseRailProps = {
  storyId: string;
  parentOwnerUserId: string | null;
  currentUserId: string | null;
  responseContext: PublicVideoResponseContext | string | null;
  approvedResponses: FeedApprovedVideoResponsePreview[];
  pendingResponse?: FeedPendingVideoResponsePreview | null;
  onOpenResponse: (responseId: string) => void;
  onViewAll: () => void;
  onOpenPendingStatus?: () => void;
  onDeletePending?: () => void;
  onActionMessage?: (message: string) => void;
  onResponseRemoved?: () => void;
};

export default function PublicVideoResponseRail({
  storyId,
  parentOwnerUserId,
  currentUserId,
  responseContext,
  approvedResponses,
  pendingResponse = null,
  onOpenResponse,
  onViewAll,
  onOpenPendingStatus,
  onDeletePending,
  onActionMessage,
  onResponseRemoved,
}: PublicVideoResponseRailProps) {
  const hasApproved = approvedResponses.length > 0;
  const hasPending = Boolean(pendingResponse);

  if (!hasApproved && !hasPending) return null;

  return (
    <section
      className={styles.section}
      data-testid="feed-parent-video-responses"
      aria-label={responseModuleTitle(responseContext)}
    >
      {hasApproved ? (
        <>
          <div className={styles.header}>
            <div className={styles.headerMain}>
              <Video className="h-4 w-4 shrink-0" aria-hidden />
              <h3 className={styles.title}>{responseModuleTitle(responseContext)}</h3>
            </div>
            <div className={styles.count}>
              {formatFeedVideoResponseCount(approvedResponses.length)}
            </div>
            {approvedResponses.length > 1 ? (
              <button
                type="button"
                className={styles.viewAll}
                onClick={onViewAll}
                aria-label={`View all ${approvedResponses.length} responses`}
              >
                View all
              </button>
            ) : null}
          </div>

          <div
            className={styles.rail}
            role="list"
            tabIndex={0}
            aria-label="Approved video responses"
            onKeyDown={(event) => {
              const items = event.currentTarget.querySelectorAll<HTMLElement>(
                "[data-response-card='true']"
              );
              if (items.length === 0) return;
              const currentIndex = [...items].findIndex(
                (item) => item === document.activeElement
              );
              if (event.key === "ArrowRight") {
                event.preventDefault();
                items[Math.min(currentIndex + 1, items.length - 1)]?.focus();
              }
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                items[Math.max(currentIndex - 1, 0)]?.focus();
              }
            }}
          >
            {approvedResponses.map((response) => (
              <div key={response.id} role="listitem">
                <PublicVideoResponseCard
                  response={response}
                  parentStoryId={storyId}
                  parentOwnerUserId={parentOwnerUserId}
                  currentUserId={currentUserId}
                  onOpen={() => onOpenResponse(response.id)}
                  onActionMessage={onActionMessage}
                  onResponseRemoved={onResponseRemoved}
                />
              </div>
            ))}
          </div>
        </>
      ) : null}

      {hasPending && pendingResponse ? (
        <PublicVideoResponsePendingCard
          storyId={storyId}
          pending={pendingResponse}
          onOpenStatus={onOpenPendingStatus}
          onDelete={onDeletePending}
        />
      ) : null}
    </section>
  );
}
