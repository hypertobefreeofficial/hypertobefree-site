"use client";

import { X } from "lucide-react";
import type { FeedTemporaryNotificationState } from "../../lib/feed/feedTemporaryNotification";
import styles from "../FreedomFeed.module.css";

type FeedTemporaryNotificationProps = {
  notification: FeedTemporaryNotificationState | null;
  onDismiss: () => void;
};

export default function FeedTemporaryNotification({
  notification,
  onDismiss,
}: FeedTemporaryNotificationProps) {
  if (!notification) return null;

  const surfaceClass =
    notification.type === "error"
      ? styles.bannerMessageError
      : styles.bannerMessage;

  return (
    <div
      className={`${surfaceClass} ${styles.bannerMessageToast} ${
        notification.phase === "exiting" ? styles.bannerMessageExiting : ""
      }`}
      role="status"
      aria-live="polite"
    >
      <p className={styles.bannerMessageText}>{notification.message}</p>
      <button
        type="button"
        className={styles.bannerMessageDismiss}
        aria-label="Dismiss notification"
        onClick={onDismiss}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
