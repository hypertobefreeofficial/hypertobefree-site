"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FeedApprovedVideoResponsePreview } from "../../lib/community-feed/loadParentApprovedVideoResponses";
import {
  clearFaithResponsesReturnState,
  readFaithResponsesReturnState,
} from "../../lib/responses/faithResponsesNavigation";
import { responseViewerTitle } from "../../lib/responses/publicVideoResponseLabels";
import type { PublicVideoResponseContext } from "../../lib/responses/publicVideoResponseContext";
import { supabase } from "../../lib/supabaseClient";
import { useDialogFocusTrap } from "../../hooks/useDialogFocusTrap";
import ParentContentContext from "./ParentContentContext";
import PublicVideoResponseSafetyMenu from "./PublicVideoResponseSafetyMenu";
import styles from "./PublicVideoResponses.module.css";

export type FaithResponsesViewerModel = {
  parentStoryId: string;
  parentAuthorName: string | null;
  parentCaption: string | null;
  parentThumbnailUrl: string | null;
  parentOwnerUserId?: string | null;
  responseContext: PublicVideoResponseContext | string | null;
  responses: FeedApprovedVideoResponsePreview[];
  initialResponseId?: string | null;
};

type FaithResponsesViewerProps = {
  model: FaithResponsesViewerModel;
  onActionMessage?: (message: string) => void;
  onResponseRemoved?: () => void;
};

export default function FaithResponsesViewer({
  model,
  onActionMessage,
  onResponseRemoved,
}: FaithResponsesViewerProps) {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");

  const initialIndex = useMemo(() => {
    if (!model.initialResponseId) return 0;
    const index = model.responses.findIndex(
      (response) => response.id === model.initialResponseId
    );
    return index >= 0 ? index : 0;
  }, [model.initialResponseId, model.responses]);

  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const activeResponse = model.responses[activeIndex] ?? model.responses[0];

  function handleBack() {
    const returnState = readFaithResponsesReturnState();
    clearFaithResponsesReturnState();
    if (returnState) {
      router.push("/feed");
      requestAnimationFrame(() => {
        window.scrollTo({ top: returnState.scrollY, behavior: "auto" });
        if (returnState.anchorId) {
          document.getElementById(returnState.anchorId)?.scrollIntoView({
            block: "center",
          });
        }
      });
      return;
    }
    router.back();
  }

  const shellRef = useDialogFocusTrap({
    open: true,
    onClose: handleBack,
    restoreFocus: true,
  });

  useEffect(() => {
    document.body.style.overflow = "hidden";
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  function announce(message: string) {
    setLiveMessage(message);
    onActionMessage?.(message);
  }

  if (!activeResponse) {
    return (
      <div className={styles.viewerShell} ref={shellRef}>
        <div className={styles.viewerTopBar}>
          <button
            type="button"
            className={styles.viewerBack}
            aria-label="Go back"
            onClick={handleBack}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className={styles.viewerTitle}>{responseViewerTitle()}</h1>
          <span aria-hidden />
        </div>
        <div className={styles.viewerContent}>
          <p>No approved responses are available yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.viewerShell} ref={shellRef}>
      <div className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>

      <header className={styles.viewerTopBar}>
        <button
          type="button"
          className={styles.viewerBack}
          aria-label="Go back"
          onClick={handleBack}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className={styles.viewerTitle}>{responseViewerTitle()}</h1>
        <PublicVideoResponseSafetyMenu
          response={activeResponse}
          parentStoryId={model.parentStoryId}
          parentOwnerUserId={model.parentOwnerUserId ?? null}
          currentUserId={currentUserId}
          variant="toolbar"
          onActionMessage={announce}
          onResponseRemoved={onResponseRemoved}
        />
      </header>

      <div className={styles.viewerContent}>
        <ParentContentContext
          parentStoryId={model.parentStoryId}
          parentAuthorName={model.parentAuthorName}
          parentCaption={model.parentCaption}
          parentThumbnailUrl={model.parentThumbnailUrl}
          responseContext={model.responseContext}
          compact
        />

        <article className={styles.viewerPanel}>
          {activeResponse.signed_video_url ? (
            <video
              className={styles.viewerVideo}
              controls
              playsInline
              preload="metadata"
              poster={activeResponse.signed_thumbnail_url ?? undefined}
              src={activeResponse.signed_video_url}
            />
          ) : (
            <div className={styles.thumbFallback}>
              Video preview unavailable
            </div>
          )}

          <div className={styles.viewerMeta}>
            <div className={styles.authorName}>
              {activeResponse.authorName || "HTBF community member"}
            </div>
            {activeResponse.body?.trim() ? (
              <p className={styles.caption}>{activeResponse.body.trim()}</p>
            ) : null}
          </div>
        </article>

        {model.responses.length > 1 ? (
          <div
            className={styles.rail}
            role="tablist"
            aria-label="Responses"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                setActiveIndex((index) =>
                  Math.min(index + 1, model.responses.length - 1)
                );
              }
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              }
            }}
          >
            {model.responses.map((response, index) => (
              <button
                key={response.id}
                type="button"
                role="tab"
                aria-selected={index === activeIndex}
                className={styles.card}
                onClick={() => setActiveIndex(index)}
              >
                {response.signed_thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={response.signed_thumbnail_url}
                    alt=""
                    className={styles.thumb}
                  />
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
