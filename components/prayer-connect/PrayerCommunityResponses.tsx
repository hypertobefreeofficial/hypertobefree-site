"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, Flag, RefreshCw, UserRound } from "lucide-react";
import {
  loadCommunityPrayerResponses,
  type CommunityPrayerResponses,
} from "../../lib/prayer-connect/communityResponses";
import { getMockCommunityResponses } from "../../lib/prayer-connect/mockPrayerData";
import { formatResponseCount } from "../../lib/prayer-connect/responseCounts";
import styles from "./PrayerConnect.module.css";

type PrayerCommunityResponsesProps = {
  storyId: string;
  userId: string | null;
  refreshKey?: number;
  onCountChange?: (count: number) => void;
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
  refreshKey = 0,
  onCountChange,
}: PrayerCommunityResponsesProps) {
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [responses, setResponses] =
    useState<CommunityPrayerResponses>(EMPTY_RESPONSES);
  const [reloadNonce, setReloadNonce] = useState(0);

  void userId;

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
        result = await loadCommunityPrayerResponses(storyId);
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
                <div>
                  <p className={styles.communityAuthorName}>
                    {item.author.displayName}
                  </p>
                  <p className={styles.communityMeta}>
                    Video prayer · {formatWhen(item.createdAt)}
                    {item.status && item.status !== "approved"
                      ? ` · ${item.status}`
                      : ""}
                  </p>
                </div>
              </div>
              {item.signedVideoUrl ? (
                <video
                  className={styles.communityVideo}
                  src={item.signedVideoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={`Video prayer from ${item.author.displayName}`}
                />
              ) : (
                <div className={styles.communityVideoFallback}>
                  Video unavailable
                </div>
              )}
              <div className={styles.communityActions}>
                <button type="button" className={styles.quietDanger}>
                  <Flag className="h-3.5 w-3.5" aria-hidden />
                  Report
                </button>
                <button type="button" className={styles.quietDanger}>
                  <Ban className="h-3.5 w-3.5" aria-hidden />
                  Block
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
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
