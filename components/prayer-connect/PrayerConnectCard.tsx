"use client";

import { Bookmark, CheckCircle2, Play, AlertTriangle } from "lucide-react";
import type { PrayerConnectRequest } from "../../lib/prayer-connect/types";
import {
  formatApproximateDistance,
  formatRelativeTime,
} from "../../lib/prayer-connect/utils";
import styles from "./PrayerConnect.module.css";

type PrayerConnectCardProps = {
  request: PrayerConnectRequest;
  selected?: boolean;
  saved?: boolean;
  onOpen: () => void;
  onToggleSave: () => void;
};

export default function PrayerConnectCard({
  request,
  selected = false,
  saved = false,
  onOpen,
  onToggleSave,
}: PrayerConnectCardProps) {
  const distance = formatApproximateDistance(request.distanceMiles);
  const mediaSrc = request.thumbnailUrl || request.imageUrl;

  return (
    <article
      className={`${styles.card} ${selected ? styles.cardSelected : ""}`}
    >
      <button
        type="button"
        className={styles.cardMediaButton}
        onClick={onOpen}
        aria-label={`Open prayer request: ${request.title}`}
      >
        {mediaSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaSrc}
            alt=""
            loading="lazy"
            className={styles.cardMediaImage}
          />
        ) : request.mediaKind === "video" ? (
          <div className={`${styles.cardMediaFallback} ${styles.cardMediaVideo}`}>
            <Play className="h-7 w-7" aria-hidden />
            <span>Video request</span>
          </div>
        ) : (
          <div className={styles.cardMediaFallback}>
            <span className={styles.cardCategoryChip}>{request.categoryLabel}</span>
            <p className={styles.cardFallbackTitle}>{request.title}</p>
          </div>
        )}

        {request.mediaKind === "video" ? (
          <span className={styles.cardPlayBadge} aria-hidden>
            <Play className="h-3.5 w-3.5 fill-current" />
          </span>
        ) : null}

        {request.isUrgent ? (
          <span className={styles.cardUrgent}>
            <AlertTriangle className="h-3 w-3" aria-hidden />
            Urgent
          </span>
        ) : null}

        {request.prayerStatus === "answered" ? (
          <span className={styles.cardAnswered}>
            <CheckCircle2 className="h-3 w-3" aria-hidden />
            Answered
          </span>
        ) : null}
      </button>

      <div className={styles.cardBody}>
        <div className={styles.cardTopRow}>
          <button type="button" className={styles.cardTitleButton} onClick={onOpen}>
            <h3 className={styles.cardTitle}>{request.title}</h3>
          </button>
          <button
            type="button"
            className={`${styles.saveButton} ${saved ? styles.saveButtonActive : ""}`}
            aria-label={saved ? "Remove saved prayer" : "Save prayer request"}
            aria-pressed={saved}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSave();
            }}
          >
            <Bookmark className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <p className={styles.cardMeta}>
          {[request.locationLabel, distance, formatRelativeTime(request.createdAt)]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <div className={styles.cardFooter}>
          <span className={styles.cardCategoryChip}>{request.categoryLabel}</span>
          <span className={styles.cardStat}>
            {request.prayingCount} prayed
          </span>
          {request.encouragementCount > 0 ? (
            <span className={styles.cardStat}>
              {request.encouragementCount} encouragements
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
