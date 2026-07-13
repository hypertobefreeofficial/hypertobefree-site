"use client";

import {
  ArrowUpDown,
  CircleHelp,
  LayoutGrid,
  List,
  Map as MapIcon,
  MapPinned,
  SlidersHorizontal,
} from "lucide-react";
import PrayerMobileSheet from "./PrayerMobileSheet";
import styles from "./PrayerConnect.module.css";

type PrayerMobileOverflowMenuProps = {
  open: boolean;
  onClose: () => void;
  resultsLayout: "grid" | "list";
  onFilter: () => void;
  onSort: () => void;
  onSaveSearchArea: () => void;
  onViewMap: () => void;
  onLayoutChange: (layout: "grid" | "list") => void;
  onHowItWorks: () => void;
};

export default function PrayerMobileOverflowMenu({
  open,
  onClose,
  resultsLayout,
  onFilter,
  onSort,
  onSaveSearchArea,
  onViewMap,
  onLayoutChange,
  onHowItWorks,
}: PrayerMobileOverflowMenuProps) {
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <PrayerMobileSheet
      open={open}
      onClose={onClose}
      side="bottom"
      labelledBy="mobile-overflow-title"
    >
      <div className={styles.mobileSheetHandle} aria-hidden />
      <h2 id="mobile-overflow-title" className={styles.mobileSheetTitle}>
        Prayer options
      </h2>

      <div className={styles.mobileLayoutToggle} role="group" aria-label="Card layout">
        <button
          type="button"
          aria-pressed={resultsLayout === "grid"}
          className={`${styles.mobileLayoutButton} ${
            resultsLayout === "grid" ? styles.mobileLayoutButtonActive : ""
          }`}
          onClick={run(() => onLayoutChange("grid"))}
        >
          <LayoutGrid className="h-4 w-4" aria-hidden />
          Grid
        </button>
        <button
          type="button"
          aria-pressed={resultsLayout === "list"}
          className={`${styles.mobileLayoutButton} ${
            resultsLayout === "list" ? styles.mobileLayoutButtonActive : ""
          }`}
          onClick={run(() => onLayoutChange("list"))}
        >
          <List className="h-4 w-4" aria-hidden />
          List
        </button>
      </div>

      <div className={styles.mobileMenuNav}>
        <button type="button" className={styles.mobileMenuItem} onClick={run(onFilter)}>
          <SlidersHorizontal className="h-5 w-5" aria-hidden />
          Filter
        </button>
        <button type="button" className={styles.mobileMenuItem} onClick={run(onSort)}>
          <ArrowUpDown className="h-5 w-5" aria-hidden />
          Sort
        </button>
        <button
          type="button"
          className={styles.mobileMenuItem}
          onClick={run(onSaveSearchArea)}
        >
          <MapPinned className="h-5 w-5" aria-hidden />
          Save Search Area
        </button>
        <button type="button" className={styles.mobileMenuItem} onClick={run(onViewMap)}>
          <MapIcon className="h-5 w-5" aria-hidden />
          View Map
        </button>
        <button
          type="button"
          className={styles.mobileMenuItem}
          onClick={run(onHowItWorks)}
        >
          <CircleHelp className="h-5 w-5" aria-hidden />
          How Prayer Works
        </button>
      </div>
    </PrayerMobileSheet>
  );
}
