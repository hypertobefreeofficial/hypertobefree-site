"use client";

import { Bookmark, CheckCircle2, Play, AlertTriangle } from "lucide-react";
import type { PrayerConnectRequest } from "../../lib/prayer-connect/types";
import {
  formatApproximateDistance,
  formatRelativeTime,
} from "../../lib/prayer-connect/utils";
import PrayerMedia from "./PrayerMedia";
import { formatResponseCount } from "../../lib/prayer-connect/responseCounts";
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
  const authorLabel = request.displayName || "Anonymous";
  const authorInitials = request.displayName
    ? request.displayName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("")
    : "A";

  return (
    <article
      className={`${styles.card} ${selected ? styles.cardSelected : ""}`}
    >
      <button
        type="button"
        className={styles.cardOpenButton}
        onClick={onOpen}
        aria-label={`Open prayer request: ${request.title}`}
      >
        <div className={styles.cardMediaWrap}>
          <PrayerMedia
            mediaKind={request.mediaKind}
            title={request.title}
            body={request.body}
            categoryLabel={request.categoryLabel}
            imageUrl={request.imageUrl}
            thumbnailUrl={request.thumbnailUrl}
            videoUrl={request.videoUrl}
            variant="card"
            className={styles.cardMediaImage}
          />

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

          <button
            type="button"
            className={`${styles.cardSaveOverlay} ${
              saved ? styles.cardSaveOverlayActive : ""
            }`}
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

        <div className={styles.cardBody}>
          <div className={styles.cardAuthorRow}>
            {request.avatarUrl ? (
              <img
                src={request.avatarUrl}
                alt=""
                className={styles.cardAvatarImage}
              />
            ) : (
              <span className={styles.cardAvatarFallback} aria-hidden>
                {authorInitials}
              </span>
            )}
            <div className={styles.cardAuthorMeta}>
              <span className={styles.cardAuthorName}>{authorLabel}</span>
              <span className={styles.cardPostedTime}>
                {formatRelativeTime(request.createdAt)}
              </span>
            </div>
          </div>

          <h3 className={styles.cardTitle}>{request.title}</h3>

          <p className={styles.cardMeta}>
            {[request.categoryLabel, request.locationLabel, distance]
              .filter(Boolean)
              .join(" · ")}
          </p>

          <div className={styles.cardFooter}>
            <span className={styles.cardActivity}>
              {request.prayingCount}{" "}
              {request.prayingCount === 1 ? "person" : "people"} prayed ·{" "}
              {formatResponseCount(request.responseCount)}
            </span>
          </div>
        </div>
      </button>
    </article>
  );
}
