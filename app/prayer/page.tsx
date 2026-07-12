"use client";

import { Suspense } from "react";
import PrayerConnectExperience from "../../components/prayer-connect/PrayerConnectExperience";
import styles from "../../components/prayer-connect/PrayerConnect.module.css";

function PrayerPageFallback() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.skeletonGrid} aria-busy="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className={styles.skeletonCard} />
          ))}
        </div>
      </div>
    </main>
  );
}

export default function PrayerPage() {
  return (
    <Suspense fallback={<PrayerPageFallback />}>
      <PrayerConnectExperience />
    </Suspense>
  );
}
