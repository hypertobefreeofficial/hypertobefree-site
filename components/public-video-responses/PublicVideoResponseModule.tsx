"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { X } from "lucide-react";
import { useDialogFocusTrap } from "../../hooks/useDialogFocusTrap";
import type { FeedApprovedVideoResponsePreview } from "../../lib/community-feed/loadParentApprovedVideoResponses";
import type { FeedPendingVideoResponsePreview } from "../../lib/community-feed/loadViewerPendingVideoResponses";
import { supabase } from "../../lib/supabaseClient";
import { removePrayerVideoResponse } from "../../lib/prayer-connect/communityResponses";
import {
  buildFaithResponsesHref,
  storeFaithResponsesReturnState,
} from "../../lib/responses/faithResponsesNavigation";
import type { PublicVideoResponseContext } from "../../lib/responses/publicVideoResponseContext";
import PublicVideoResponseRail from "./PublicVideoResponseRail";
import PublicVideoResponseStatusPanel from "./PublicVideoResponseStatusPanel";
import styles from "./PublicVideoResponses.module.css";

type PublicVideoResponseModuleProps = {
  storyId: string;
  parentOwnerUserId: string | null;
  currentUserId: string | null;
  responseContext: PublicVideoResponseContext | string | null;
  approvedResponses: FeedApprovedVideoResponsePreview[];
  pendingResponse?: FeedPendingVideoResponsePreview | null;
  returnAnchorId?: string;
  onPendingRemoved?: () => void;
  onResponseMessage?: (message: string) => void;
};

export default function PublicVideoResponseModule({
  storyId,
  parentOwnerUserId,
  currentUserId,
  responseContext,
  approvedResponses,
  pendingResponse = null,
  returnAnchorId,
  onPendingRemoved,
  onResponseMessage,
}: PublicVideoResponseModuleProps) {
  const router = useRouter();
  const [statusOpen, setStatusOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");
  const statusPanelRef = useDialogFocusTrap({
    open: statusOpen,
    onClose: () => setStatusOpen(false),
  });

  function announce(message: string) {
    setLiveMessage(message);
    onResponseMessage?.(message);
  }

  const hasApproved = approvedResponses.length > 0;
  const hasPending = Boolean(pendingResponse);
  if (!hasApproved && !hasPending) return null;

  function navigateToFaithResponses(responseId?: string) {
    storeFaithResponsesReturnState({
      scrollY: window.scrollY,
      anchorId: returnAnchorId ?? `freedom-feed-story-${storyId}`,
    });
    router.push(
      buildFaithResponsesHref({
        parentStoryId: storyId,
        responseId,
      })
    );
  }

  async function deletePendingSubmission() {
    if (!pendingResponse || deleting) return;
    const confirmed = window.confirm(
      "Delete this submission? It will be removed from review and will not be published."
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        announce("Please sign in again to manage your submission.");
        return;
      }

      const result = await removePrayerVideoResponse({
        responseId: pendingResponse.id,
        accessToken: token,
      });

      if (result.ok !== true) {
        announce(result.error);
        return;
      }

      setStatusOpen(false);
      announce("Your pending video response was deleted.");
      onPendingRemoved?.();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>

      <PublicVideoResponseRail
        storyId={storyId}
        parentOwnerUserId={parentOwnerUserId}
        currentUserId={currentUserId}
        responseContext={responseContext}
        approvedResponses={approvedResponses}
        pendingResponse={pendingResponse}
        onOpenResponse={(responseId) => navigateToFaithResponses(responseId)}
        onViewAll={() => navigateToFaithResponses()}
        onOpenPendingStatus={() => setStatusOpen(true)}
        onDeletePending={() => void deletePendingSubmission()}
        onActionMessage={announce}
        onResponseRemoved={onPendingRemoved}
      />

      {statusOpen && pendingResponse ? (
        <div
          className={styles.statusOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="response-status-title"
        >
          <button
            type="button"
            className={styles.statusOverlayBackdrop}
            aria-label="Close status panel"
            onClick={() => setStatusOpen(false)}
          />
          <div className={styles.statusOverlayPanel} ref={statusPanelRef}>
            <div className={styles.statusOverlayHeader}>
              <h2 id="response-status-title" className={styles.viewerTitle}>
                Response status
              </h2>
              <button
                type="button"
                className={styles.viewerMenu}
                aria-label="Close"
                onClick={() => setStatusOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <PublicVideoResponseStatusPanel
              status={pendingResponse.status}
              aiReviewStatus={pendingResponse.ai_review_status}
            />
            <div className={styles.pendingActions}>
              <button
                type="button"
                className={styles.pendingDanger}
                disabled={deleting}
                onClick={() => void deletePendingSubmission()}
              >
                {deleting ? "Deleting…" : "Delete submission"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
