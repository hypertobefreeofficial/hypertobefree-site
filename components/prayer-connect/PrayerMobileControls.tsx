"use client";

import { MapPin, Search, X } from "lucide-react";
import type { PrayerViewTab } from "./PrayerSectionNav";
import styles from "./PrayerConnect.module.css";

const MOBILE_TABS: { id: PrayerViewTab; label: string }[] = [
  { id: "discover", label: "Discover" },
  { id: "following", label: "Following" },
  { id: "my-requests", label: "My Requests" },
  { id: "answered", label: "Answered" },
];

type PrayerMobileControlsProps = {
  activeTab: PrayerViewTab;
  onSelectTab: (tab: PrayerViewTab) => void;
  showDiscoverControls: boolean;
  locationLabel: string;
  onOpenLocation: () => void;
  searchActive: boolean;
  contentQuery: string;
  onContentQueryChange: (value: string) => void;
  onClearSearch: () => void;
  resultCountLabel: string;
};

export default function PrayerMobileControls({
  activeTab,
  onSelectTab,
  showDiscoverControls,
  locationLabel,
  onOpenLocation,
  searchActive,
  contentQuery,
  onContentQueryChange,
  onClearSearch,
  resultCountLabel,
}: PrayerMobileControlsProps) {
  return (
    <div className={styles.mobileControls}>
      <div
        className={styles.mobileTabRow}
        role="tablist"
        aria-label="Prayer views"
      >
        {MOBILE_TABS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.mobileTab} ${
                isActive ? styles.mobileTabActive : ""
              }`}
              onClick={() => onSelectTab(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {searchActive ? (
        <div className={styles.mobileSearchField}>
          <Search className="h-4 w-4" aria-hidden />
          <input
            id="prayer-content-search"
            type="search"
            className={styles.mobileSearchInput}
            value={contentQuery}
            placeholder="Search prayers by need, topic, or location"
            aria-label="Search prayers by need, topic, or location"
            autoFocus
            onChange={(event) => onContentQueryChange(event.target.value)}
          />
          {contentQuery ? (
            <button
              type="button"
              className={styles.mobileSearchClear}
              aria-label="Clear search"
              onClick={onClearSearch}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}

      {showDiscoverControls ? (
        <div className={styles.mobileMetaRow}>
          <button
            type="button"
            className={styles.mobileLocationPill}
            onClick={onOpenLocation}
          >
            <MapPin className="h-4 w-4" aria-hidden />
            <span className={styles.mobileLocationLabel}>{locationLabel}</span>
          </button>
          <span
            className={styles.mobileResultCount}
            role="status"
            aria-live="polite"
          >
            {resultCountLabel}
          </span>
        </div>
      ) : null}
    </div>
  );
}
