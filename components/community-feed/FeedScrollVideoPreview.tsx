"use client";

import { useState } from "react";
import { Play, Video } from "lucide-react";
import { FEED_MEDIA_EL_CLASS } from "../../lib/feedMediaClasses";
import styles from "../FreedomFeed.module.css";

type FeedScrollVideoPreviewProps = {
  posterUrl?: string | null;
  fallbackLabel: string;
  frameClassName: string;
  onClick: () => void;
  ariaLabel: string;
  overlay?: React.ReactNode;
};

export default function FeedScrollVideoPreview({
  posterUrl,
  fallbackLabel,
  frameClassName,
  onClick,
  ariaLabel,
  overlay,
}: FeedScrollVideoPreviewProps) {
  const [posterFailed, setPosterFailed] = useState(false);
  const [posterLoaded, setPosterLoaded] = useState(false);
  const showPoster = Boolean(posterUrl) && !posterFailed;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${styles.mediaOpenButton} ${styles.mediaBleed}`}
      aria-label={ariaLabel}
    >
      <div className={frameClassName}>
        {showPoster && !posterLoaded ? (
          <div className={styles.videoPosterSkeleton} aria-hidden />
        ) : null}

        {showPoster ? (
          <img
            src={posterUrl ?? undefined}
            alt=""
            className={`${FEED_MEDIA_EL_CLASS} ${styles.videoPosterImage}`}
            onLoad={() => setPosterLoaded(true)}
            onError={() => setPosterFailed(true)}
          />
        ) : (
          <div className={styles.videoFallback} aria-hidden>
            <Video className="h-8 w-8 text-white/80" />
            <span>{fallbackLabel}</span>
          </div>
        )}

        <span className={styles.videoPlayControl} aria-hidden>
          <Play className="h-7 w-7 fill-white text-white" />
        </span>

        {overlay}
      </div>
    </button>
  );
}
