"use client";

import { AlertTriangle, HeartHandshake } from "lucide-react";
import type { PrayerConnectRequest } from "../../lib/prayer-connect/types";
import styles from "./PrayerConnect.module.css";

type PrayerSpotlightProps = {
  request: PrayerConnectRequest | null;
  onOpen: () => void;
};

export default function PrayerSpotlight({ request, onOpen }: PrayerSpotlightProps) {
  if (!request) return null;

  return (
    <aside className={styles.spotlight} aria-label="Prayer spotlight">
      <p className={styles.spotlightEyebrow}>Prayer spotlight</p>
      <h3 className={styles.spotlightTitle}>{request.title}</h3>
      <p className={styles.spotlightMeta}>
        {request.isUrgent ? (
          <span className={styles.spotlightUrgent}>
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            Urgent
          </span>
        ) : (
          <span>Needs prayer</span>
        )}
        <span>{request.prayingCount} prayed</span>
      </p>
      <button type="button" className={styles.spotlightButton} onClick={onOpen}>
        <HeartHandshake className="h-4 w-4" aria-hidden />
        Pray now
      </button>
    </aside>
  );
}
