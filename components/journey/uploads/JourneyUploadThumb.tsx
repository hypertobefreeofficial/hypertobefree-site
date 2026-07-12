"use client";

import { useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Film,
  HeartHandshake,
  Music2,
  Play,
  Quote,
  Sparkles,
  FileText,
} from "lucide-react";
import type { JourneyUpload } from "../../../lib/journey/uploads/types";
import {
  getUploadImageSource,
  getUploadPosterSource,
} from "../../../lib/journey/uploads/media";
import { getContentTypeLabel, getUploadStatus } from "../../../lib/journey/uploads/utils";
import styles from "./JourneyUploads.module.css";

type JourneyUploadThumbProps = {
  upload: JourneyUpload;
  size?: "row" | "grid" | "hero";
  interactive?: boolean;
  onPlay?: () => void;
  onOpenDetails?: () => void;
  className?: string;
};

function getTypeVisual(upload: JourneyUpload) {
  const type = (upload.story_type || "").toLowerCase();
  const answered =
    type.includes("prayer") && upload.prayer_status === "answered";

  if (answered) {
    return {
      label: "Answered Prayer",
      icon: CheckCircle2,
      gradient: "linear-gradient(145deg, #ecfdf5 0%, #d1fae5 55%, #a7f3d0 100%)",
      color: "#047857",
    };
  }
  if (type.includes("worship")) {
    return {
      label: "Worship",
      icon: Music2,
      gradient: "linear-gradient(145deg, #eff6ff 0%, #dbeafe 55%, #bfdbfe 100%)",
      color: "#0b63ce",
    };
  }
  if (type.includes("prayer")) {
    return {
      label: "Prayer Request",
      icon: HeartHandshake,
      gradient: "linear-gradient(145deg, #fff7ed 0%, #ffedd5 55%, #fed7aa 100%)",
      color: "#c2410c",
    };
  }
  if (type.includes("praise")) {
    return {
      label: "Praise Report",
      icon: Sparkles,
      gradient: "linear-gradient(145deg, #f0f9ff 0%, #e0f2fe 55%, #bae6fd 100%)",
      color: "#0369a1",
    };
  }
  if (type.includes("testimony")) {
    return {
      label: "Testimony",
      icon: Quote,
      gradient: "linear-gradient(145deg, #eff6ff 0%, #dbeafe 55%, #93c5fd 100%)",
      color: "#084f9f",
    };
  }
  if (type.includes("story")) {
    return {
      label: "Story",
      icon: BookOpen,
      gradient: "linear-gradient(145deg, #f8fafc 0%, #e2e8f0 55%, #cbd5e1 100%)",
      color: "#334155",
    };
  }
  return {
    label: getContentTypeLabel(upload),
    icon: FileText,
    gradient: "linear-gradient(145deg, #f8fbff 0%, #e8f1fb 55%, #d7e6f7 100%)",
    color: "#0b63ce",
  };
}

export default function JourneyUploadThumb({
  upload,
  size = "row",
  interactive = false,
  onPlay,
  onOpenDetails,
  className = "",
}: JourneyUploadThumbProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasVideo = Boolean(upload.video_url || upload.signed_video_url);
  const poster = getUploadPosterSource(upload);
  const image = getUploadImageSource(upload);
  const mediaUrl = hasVideo ? poster : image || poster;
  const status = getUploadStatus(upload);
  const visual = getTypeVisual(upload);
  const Icon = visual.icon;
  const showImage = Boolean(mediaUrl) && !imageFailed;
  const title = upload.story_text?.trim()?.slice(0, 40) || visual.label;

  const sizeClass =
    size === "grid"
      ? styles.thumbGrid
      : size === "hero"
        ? styles.thumbHero
        : styles.thumbRow;

  const content = showImage ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={mediaUrl!}
      alt=""
      loading="lazy"
      decoding="async"
      className={styles.thumbImage}
      onError={() => setImageFailed(true)}
    />
  ) : hasVideo ? (
    <div
      className={styles.thumbPlaceholder}
      style={{
        background:
          "linear-gradient(145deg, #0f2744 0%, #163a63 45%, #0b63ce 100%)",
        color: "#fff",
      }}
    >
      <Film className={styles.thumbPlaceholderIcon} aria-hidden />
      <span className={styles.thumbPlaceholderLabel}>Video</span>
    </div>
  ) : (
    <div
      className={styles.thumbPlaceholder}
      style={{ background: visual.gradient, color: visual.color }}
    >
      <Icon className={styles.thumbPlaceholderIcon} aria-hidden />
      <span className={styles.thumbPlaceholderLabel}>{visual.label}</span>
    </div>
  );

  const badges = (
    <>
      {hasVideo ? (
        <span className={styles.thumbPlayBadge} aria-hidden>
          <Play className="h-3.5 w-3.5 fill-current" />
        </span>
      ) : null}
      {status === "removed" ? (
        <span className={styles.thumbStatusChip}>Hidden</span>
      ) : null}
      {upload.prayer_status === "answered" &&
      (upload.story_type || "").toLowerCase().includes("prayer") ? (
        <span className={styles.thumbAnsweredChip}>Answered</span>
      ) : null}
    </>
  );

  if (interactive && hasVideo && onPlay) {
    return (
      <button
        type="button"
        className={`${styles.thumbButton} ${sizeClass} ${className}`}
        onClick={(event) => {
          event.stopPropagation();
          onPlay();
        }}
        aria-label={`Play video: ${title}`}
      >
        {content}
        {badges}
      </button>
    );
  }

  if (interactive && onOpenDetails) {
    return (
      <button
        type="button"
        className={`${styles.thumbButton} ${sizeClass} ${className}`}
        onClick={(event) => {
          event.stopPropagation();
          onOpenDetails();
        }}
        aria-label={`View details: ${title}`}
      >
        {content}
        {badges}
      </button>
    );
  }

  return (
    <div className={`${styles.thumbStatic} ${sizeClass} ${className}`} aria-hidden>
      {content}
      {badges}
    </div>
  );
}
