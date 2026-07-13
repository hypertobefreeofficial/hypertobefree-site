"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import type { PrayerConnectMediaKind } from "../../lib/prayer-connect/types";
import { getPrayerCardPoster } from "../../lib/prayer-connect/media";
import styles from "./PrayerConnect.module.css";

type PrayerMediaProps = {
  mediaKind: PrayerConnectMediaKind;
  title: string;
  body?: string;
  categoryLabel: string;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  variant?: "card" | "detail" | "composer";
  className?: string;
};

export default function PrayerMedia({
  mediaKind,
  title,
  body = "",
  categoryLabel,
  imageUrl,
  thumbnailUrl,
  videoUrl,
  variant = "card",
  className = "",
}: PrayerMediaProps) {
  const [failed, setFailed] = useState(false);
  const poster = getPrayerCardPoster({
    mediaKind,
    imageUrl,
    thumbnailUrl,
    videoUrl,
  });

  useEffect(() => {
    setFailed(false);
  }, [poster, mediaKind, variant]);

  if (mediaKind === "video" && videoUrl && variant === "detail") {
    return (
      <video
        className={`${styles.mediaAsset} ${className}`}
        src={videoUrl}
        controls
        playsInline
        preload="metadata"
        poster={thumbnailUrl || imageUrl || undefined}
      />
    );
  }

  if (poster && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={poster}
        alt=""
        className={`${styles.mediaAsset} ${className}`}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  if (mediaKind === "video") {
    return (
      <div className={`${styles.mediaFallback} ${styles.mediaFallbackVideo} ${className}`}>
        <Play className="h-7 w-7" aria-hidden />
        <span>Video prayer</span>
      </div>
    );
  }

  return (
    <div className={`${styles.mediaFallback} ${styles.mediaFallbackText} ${className}`}>
      <span className={styles.mediaFallbackQuote} aria-hidden>
        “
      </span>
      <p className={styles.mediaFallbackExcerpt}>
        {body.trim() || title}
      </p>
      <span className={styles.mediaFallbackCategory}>{categoryLabel}</span>
    </div>
  );
}
