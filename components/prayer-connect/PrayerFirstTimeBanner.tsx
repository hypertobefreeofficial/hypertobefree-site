"use client";

import { MapPin } from "lucide-react";
import styles from "./PrayerConnect.module.css";

type PrayerFirstTimeBannerProps = {
  onOpenSetup: () => void;
};

export default function PrayerFirstTimeBanner({
  onOpenSetup,
}: PrayerFirstTimeBannerProps) {
  return (
    <section className={styles.firstTimeBanner} aria-label="Prayer area setup">
      <div className={styles.firstTimeBannerCopy}>
        <MapPin className="h-4 w-4" aria-hidden />
        <p>
          <strong>Where would you like to pray?</strong> Choose a location to
          personalize nearby requests.
        </p>
      </div>
      <button
        type="button"
        className={styles.firstTimeBannerButton}
        onClick={onOpenSetup}
      >
        Set Search Area
      </button>
    </section>
  );
}
