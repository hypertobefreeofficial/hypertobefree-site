"use client";

import { List, Map as MapIcon } from "lucide-react";
import styles from "./PrayerConnect.module.css";

type PrayerSearchSummaryBarProps = {
  locationLine: string;
  filterLine: string;
  viewMode: "requests" | "map";
  onViewMap: () => void;
  onReturnToRequests: () => void;
  onChangeLocation: () => void;
  onRadius: () => void;
  onFilters: () => void;
  onReset: () => void;
};

export default function PrayerSearchSummaryBar({
  locationLine,
  filterLine,
  viewMode,
  onViewMap,
  onReturnToRequests,
  onChangeLocation,
  onRadius,
  onFilters,
  onReset,
}: PrayerSearchSummaryBarProps) {
  const inMap = viewMode === "map";

  return (
    <section className={styles.searchSummary} aria-label="Saved search">
      <div className={styles.searchSummaryCopy}>
        <p className={styles.searchSummaryLocation}>{locationLine}</p>
        <p className={styles.searchSummaryFilters}>{filterLine}</p>
      </div>
      <div className={styles.searchSummaryActions}>
        <button
          type="button"
          className={styles.summaryViewToggle}
          onClick={inMap ? onReturnToRequests : onViewMap}
          aria-pressed={inMap}
        >
          {inMap ? (
            <>
              <List className="h-4 w-4" aria-hidden />
              Return to Requests
            </>
          ) : (
            <>
              <MapIcon className="h-4 w-4" aria-hidden />
              View Map
            </>
          )}
        </button>
        <button
          type="button"
          className={styles.summaryChipButton}
          onClick={onChangeLocation}
        >
          Change location
        </button>
        <button
          type="button"
          className={styles.summaryChipButton}
          onClick={onRadius}
        >
          Radius
        </button>
        <button
          type="button"
          className={styles.summaryChipButton}
          onClick={onFilters}
        >
          Filters
        </button>
        <button
          type="button"
          className={styles.summaryResetButton}
          onClick={onReset}
        >
          Reset
        </button>
      </div>
    </section>
  );
}
