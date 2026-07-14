"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, Flag, RefreshCw, Trash2, UserRound } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import {
  loadCommunityPrayerResponses,
  removePrayerVideoResponse,
  type CommunityPrayerResponses,
} from "../../lib/prayer-connect/communityResponses";
import { getMockCommunityResponses } from "../../lib/prayer-connect/mockPrayerData";
import { formatResponseCount } from "../../lib/prayer-connect/responseCounts";
import PrayerActionMenu, { type PrayerActionItem } from "./PrayerActionMenu";
import PrayerConfirmDialog from "./PrayerConfirmDialog";
import styles from "./PrayerConnect.module.css";

type PrayerCommunityResponsesProps = {
  storyId: string;
  userId: string | null;
  /** Owner of the parent prayer (to enable owner-removal of responses). */
  prayerOwnerId?: string | null;
  refreshKey?: number;
  onCountChange?: (count: number) => void;
  onReportResponse?: (opts: {
    responseId: string;
    authorUserId: string;
  }) => void;
  onBlockUser?: (authorUserId: string) => void;
  onViewProfile?: (authorUserId: string) => void;
};

type LoadStatus = "idle" | "loading" | "loaded" | "refreshing" | "error";

const EMPTY_RESPONSES: CommunityPrayerResponses = {
  written: [],
  video: [],
  totalCount: 0,
};

export default function PrayerCommunityResponses({
  storyId,
  userId,
  prayerOwnerId = null,
  refreshKey = 0,
  onCountChange,
  onReportResponse,
  onBlockUser,
  onViewProfile,
}: PrayerCommunityResponsesProps) {
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [responses, setResponses] =
    useState<CommunityPrayerResponses>(EMPTY_RESPONSES);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [removeTarget, setRemoveTarget] = useState<{
    responseId: string;
    isAuthor: boolean;
  } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const isPrayerOwner = Boolean(prayerOwnerId) && prayerOwnerId === userId;

  // Keep the count callback in a ref so it never becomes an effect dependency.
  // An inline parent callback would otherwise re-trigger the load on every
  // render and cause the "Loading video prayers…" flashing loop.
  const onCountChangeRef = useRef(onCountChange);
  useEffect(() => {
    onCountChangeRef.current = onCountChange;
  }, [onCountChange]);

  // Guards so stale / overlapping requests can never resolve into the UI.
  const requestIdRef = useRef(0);
  const lastEmittedCountRef = useRef<number | null>(null);
  const loadedStoryRef = useRef<string | null>(null);

  function emitCount(count: number) {
    if (lastEmittedCountRef.current === count) return;
    lastEmittedCountRef.current = count;
    onCountChangeRef.current?.(count);
  }

  useEffect(() => {
    let active = true;
    const requestId = ++requestIdRef.current;

    // A new story is an initial load (show skeletons, clear the previous list).
    // A bumped refreshKey for the same story is a background refresh that keeps
    // existing responses visible.
    const isNewStory = loadedStoryRef.current !== storyId;
    if (isNewStory) {
      lastEmittedCountRef.current = null;
      setResponses(EMPTY_RESPONSES);
      setStatus("loading");
    } else {
      setStatus((prev) => (prev === "loaded" ? "refreshing" : "loading"));
    }
    setErrorMessage(null);

    async function run() {
      let result:
        | { ok: true; responses: CommunityPrayerResponses }
        | { ok: false; userMessage: string };

      if (storyId.startsWith("mock-")) {
        const mock = getMockCommunityResponses(storyId);
        result = { ok: true, responses: mock ?? EMPTY_RESPONSES };
      } else {
        result = await loadCommunityPrayerResponses(storyId, userId);
      }

      if (!active || requestId !== requestIdRef.current) return;
      loadedStoryRef.current = storyId;

      if (result.ok === false) {
        setResponses(EMPTY_RESPONSES);
        emitCount(0);
        setErrorMessage(result.userMessage);
        setStatus("error");
        return;
      }

      setResponses(result.responses);
      // Public prayer responses are video-only; ignore any legacy written rows.
      emitCount(result.responses.video.length);
      setStatus("loaded");
    }

    void run();

    return () => {
      active = false;
    };
    // Intentionally only re-run when the story changes or an explicit refresh is
    // requested — never because response data or the count callback changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyId, refreshKey, reloadNonce]);

  const videoCount = responses.video.length;
  const showSkeleton = status === "loading";
  const showError = status === "error";
  const showEmpty = status === "loaded" && videoCount === 0;
  const showList = videoCount > 0 && (status === "loaded" || status === "refreshing");

  function retry() {
    // Force a fresh initial load through the guarded effect above.
    loadedStoryRef.current = null;
    setReloadNonce((value) => value + 1);
  }

  function refreshOnce() {
    // Same-story background refresh — keeps existing responses visible and does
    // not flash skeletons (see the load effect's isNewStory branch).
    setReloadNonce((value) => value + 1);
  }

  async function confirmRemoval() {
    if (!removeTarget || removing) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setRemoveError("Please sign in again to remove this response.");
        setRemoving(false);
        return;
      }
      const result = await removePrayerVideoResponse({
        responseId: removeTarget.responseId,
        accessToken: token,
      });
      if (result.ok !== true) {
        setRemoveError(result.error);
        setRemoving(false);
        return;
      }
      // Optimistically drop it, then refresh once to reconcile with the server.
      const removedId = removeTarget.responseId;
      setResponses((prev) => ({
        ...prev,
        video: prev.video.filter((item) => item.id !== removedId),
      }));
      setRemoveTarget(null);
      setRemoving(false);
      refreshOnce();
    } catch (error) {
      console.error("Remove video response failed:", error);
      setRemoveError("Could not remove the response. Please try again.");
      setRemoving(false);
    }
  }

  function buildResponseMenu(item: {
    id: string;
    authorUserId: string;
  }): PrayerActionItem[] {
    const isAuthor = Boolean(userId) && item.authorUserId === userId;
    const items: PrayerActionItem[] = [];

    if (isPrayerOwner && !isAuthor) {
      items.push({
        id: "remove",
        label: "Remove video response",
        icon: Trash2,
        danger: true,
        onSelect: () => setRemoveTarget({ responseId: item.id, isAuthor: false }),
      });
    }
    if (isAuthor) {
      items.push({
        id: "delete",
        label: "Delete my video response",
        icon: Trash2,
        danger: true,
        onSelect: () => setRemoveTarget({ responseId: item.id, isAuthor: true }),
      });
    }
    if (!isAuthor) {
      items.push({
        id: "report",
        label: "Report to Admin",
        icon: Flag,
        onSelect: () =>
          onReportResponse?.({
            responseId: item.id,
            authorUserId: item.authorUserId,
          }),
      });
      items.push({
        id: "block",
        label: "Block user",
        icon: Ban,
        danger: true,
        onSelect: () => onBlockUser?.(item.authorUserId),
      });
    } else {
      items.push({
        id: "report-problem",
        label: "Report a problem",
        icon: Flag,
        onSelect: () =>
          onReportResponse?.({
            responseId: item.id,
            authorUserId: item.authorUserId,
          }),
      });
    }
    if (onViewProfile && !isAuthor) {
      items.push({
        id: "profile",
        label: "View profile",
        icon: UserRound,
        onSelect: () => onViewProfile(item.authorUserId),
      });
    }
    return items;
  }

  const viewerRemovedCount = responses.viewer?.removedCount ?? 0;
  const viewerPendingCount = responses.viewer?.pendingCount ?? 0;

  return (
    <section
      className={styles.communitySection}
      aria-labelledby="video-prayers-title"
    >
      <div className={styles.communityHeader}>
        <h3 id="video-prayers-title">Video Prayers</h3>
        <span className={styles.communityCount}>
          {showSkeleton
            ? "Loading video prayers…"
            : formatResponseCount(videoCount)}
        </span>
      </div>

      {showSkeleton ? (
        <div className={styles.communitySkeleton} aria-busy="true">
          <div className={styles.communitySkeletonLine} />
          <div className={styles.communitySkeletonLine} />
        </div>
      ) : null}

      {showError ? (
        <div className={styles.communityError} role="status">
          <p>{errorMessage ?? "We couldn't load the video prayers."}</p>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={retry}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Try Again
          </button>
        </div>
      ) : null}

      {showEmpty ? (
        <p className={styles.communityEmpty}>
          No public video prayers yet. Be the first to pray by video.
        </p>
      ) : null}

      {showList ? (
        <div className={styles.communityList} aria-busy={status === "refreshing"}>
          {responses.video.map((item) => (
            <article key={item.id} className={styles.communityCard}>
              <div className={styles.communityAuthorRow}>
                <AuthorAvatar author={item.author} />
                <div className={styles.communityAuthorText}>
                  <p className={styles.communityAuthorName}>
                    {item.author.displayName}
                  </p>
                  <p className={styles.communityMeta}>
                    Video prayer · {formatWhen(item.createdAt)}
                  </p>
                </div>
                {buildResponseMenu(item).length > 0 ? (
                  <PrayerActionMenu
                    items={buildResponseMenu(item)}
                    size="sm"
                    triggerLabel={`Options for ${item.author.displayName}'s video prayer`}
                    sheetTitle="Video prayer options"
                  />
                ) : null}
              </div>
              {item.signedVideoUrl ? (
                <video
                  className={styles.communityVideo}
                  src={item.signedVideoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  poster={item.signedThumbnailUrl || undefined}
                  aria-label={`Video prayer from ${item.author.displayName}`}
                />
              ) : (
                <div className={styles.communityVideoFallback}>
                  Video unavailable
                </div>
              )}
            </article>
          ))}
        </div>
      ) : null}

      {!showSkeleton && (viewerRemovedCount > 0 || viewerPendingCount > 0) ? (
        <div className={styles.communityViewerNote} role="status">
          {viewerPendingCount > 0 ? (
            <p>Your video prayer is awaiting review.</p>
          ) : null}
          {viewerRemovedCount > 0 ? (
            <p>This video response is no longer visible on the prayer.</p>
          ) : null}
        </div>
      ) : null}

      <PrayerConfirmDialog
        open={Boolean(removeTarget)}
        danger
        loading={removing}
        errorMessage={removeError}
        title={
          removeTarget?.isAuthor
            ? "Delete your video prayer response?"
            : "Remove this video prayer response?"
        }
        body={
          removeTarget?.isAuthor
            ? "This video will no longer appear publicly on the prayer."
            : "This video will no longer appear publicly on your prayer. This does not automatically report or block the person who posted it."
        }
        confirmLabel={
          removeTarget?.isAuthor ? "Delete response" : "Remove response"
        }
        onCancel={() => {
          if (removing) return;
          setRemoveTarget(null);
          setRemoveError(null);
        }}
        onConfirm={() => void confirmRemoval()}
      />
    </section>
  );
}

function AuthorAvatar({
  author,
}: {
  author: { displayName: string; avatarUrl: string | null; isAnonymous: boolean };
}) {
  if (author.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={author.avatarUrl} alt="" className={styles.communityAvatar} />
    );
  }

  return (
    <span className={styles.communityAvatarFallback} aria-hidden>
      <UserRound className="h-4 w-4" />
    </span>
  );
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
