"use client";

import { useCallback, useEffect, useState } from "react";
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

export default function PrayerCommunityResponses({
  storyId,
  userId,
  refreshKey = 0,
  onCountChange,
}: PrayerCommunityResponsesProps) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [responses, setResponses] = useState<CommunityPrayerResponses>({
    written: [],
    video: [],
    totalCount: 0,
  });

  void userId;

  const load = useCallback(async () => {
    if (storyId.startsWith("mock-")) {
      const mock = getMockCommunityResponses(storyId);
      setResponses(mock ?? { written: [], video: [], totalCount: 0 });
      onCountChange?.(mock?.video.length ?? 0);
      setLoading(false);
      setErrorMessage(null);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    const result = await loadCommunityPrayerResponses(storyId);
    if (result.ok === false) {
      setErrorMessage(result.userMessage);
      setResponses({ written: [], video: [], totalCount: 0 });
      onCountChange?.(0);
      setLoading(false);
      return;
    }
    setResponses(result.responses);
    // Public prayer responses are video-only; ignore any legacy written rows.
    onCountChange?.(result.responses.video.length);
    setLoading(false);
  }, [onCountChange, storyId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const videoCount = responses.video.length;

  return (
    <section className={styles.communitySection} aria-labelledby="video-prayers-title">
      <div className={styles.communityHeader}>
        <h3 id="video-prayers-title">Video Prayers</h3>
        <span className={styles.communityCount}>
          {loading ? "Loading video prayers…" : formatResponseCount(videoCount)}
        </span>
      </div>

      {loading ? (
        <div className={styles.communitySkeleton} aria-busy="true">
          <div className={styles.communitySkeletonLine} />
          <div className={styles.communitySkeletonLine} />
        </div>
      ) : null}

      {errorMessage ? (
        <div className={styles.communityError} role="status">
          <p>{errorMessage}</p>
          <button type="button" className={styles.secondaryButton} onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Try Again
          </button>
        </div>
      ) : null}

      {!loading && !errorMessage && videoCount === 0 ? (
        <p className={styles.communityEmpty}>
          No video prayers yet. Be the first to pray by video.
        </p>
      ) : null}

      {!loading && !errorMessage && videoCount > 0 ? (
        <div className={styles.communityList}>
          {responses.video.map((item) => (
            <article key={item.id} className={styles.communityCard}>
              <div className={styles.communityAuthorRow}>
                <AuthorAvatar author={item.author} />
                <div>
                  <p className={styles.communityAuthorName}>{item.author.displayName}</p>
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
                <div className={styles.communityVideoFallback}>Video unavailable</div>
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
      <img
        src={author.avatarUrl}
        alt=""
        className={styles.communityAvatar}
      />
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
