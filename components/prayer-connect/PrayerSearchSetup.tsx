"use client";

import {
  Compass,
  Globe2,
  MapPin,
  Navigation,
  Search,
} from "lucide-react";
import type {
  PrayerConnectCategoryFilter,
  PrayerConnectRadiusMiles,
  PrayerConnectSearchCenter,
  PrayerConnectSearchMode,
  PrayerConnectSort,
} from "../../lib/prayer-connect/types";
import {
  PRAYER_CONNECT_CATEGORIES,
  PRAYER_CONNECT_SORTS,
  RADIUS_OPTIONS,
} from "../../lib/prayer-connect/utils";
import styles from "./PrayerConnect.module.css";

type PrayerSearchSetupProps = {
  variant?: "onboarding" | "modal";
  compact?: boolean;
  searchMode: PrayerConnectSearchMode;
  radius: PrayerConnectRadiusMiles;
  category: PrayerConnectCategoryFilter;
  sort: PrayerConnectSort;
  mediaFilter: "all" | "video" | "photo" | "text";
  placeQuery: string;
  center: PrayerConnectSearchCenter | null;
  geoError: string | null;
  authMessage: string | null;
  onSearchModeChange: (mode: PrayerConnectSearchMode) => void;
  onPlaceQueryChange: (value: string) => void;
  onRadiusChange: (radius: PrayerConnectRadiusMiles) => void;
  onCategoryChange: (category: PrayerConnectCategoryFilter) => void;
  onSortChange: (sort: PrayerConnectSort) => void;
  onMediaFilterChange: (value: "all" | "video" | "photo" | "text") => void;
  onNearMe: () => void;
  onSearchPlace: () => void;
  onChooseAnywhere: () => void;
  onOpenMap: () => void;
  onSave: () => void;
  onClose?: () => void;
};

export default function PrayerSearchSetup({
  variant = "onboarding",
  compact = false,
  searchMode,
  radius,
  category,
  sort,
  mediaFilter,
  placeQuery,
  center,
  geoError,
  authMessage,
  onSearchModeChange,
  onPlaceQueryChange,
  onRadiusChange,
  onCategoryChange,
  onSortChange,
  onMediaFilterChange,
  onNearMe,
  onSearchPlace,
  onChooseAnywhere,
  onOpenMap,
  onSave,
  onClose,
}: PrayerSearchSetupProps) {
  const panelClass =
    variant === "modal"
      ? styles.searchSetupModal
      : compact
        ? styles.searchOnboardingCompact
        : styles.searchOnboarding;

  return (
    <section className={panelClass} aria-label="Prayer search setup">
      <div
        className={
          compact ? styles.searchOnboardingCompactGrid : styles.searchOnboardingGrid
        }
      >
        {!compact ? (
          <div className={styles.searchOnboardingIntro}>
            <p className={styles.searchOnboardingEyebrow}>Where would you like to pray?</p>
            <h2 className={styles.searchOnboardingTitle}>
              Choose a place to discover prayer requests nearby.
            </h2>
            <p className={styles.searchOnboardingBody}>
              HTBF uses approximate public locations only. Exact home addresses and
              residential coordinates are never shown.
            </p>
            <div className={styles.searchOnboardingArt} aria-hidden>
              <Globe2 className="h-10 w-10" />
            </div>
          </div>
        ) : (
          <p className={styles.searchOnboardingCompactLead}>
            Where would you like to pray?
          </p>
        )}

        <div className={styles.searchOnboardingControls}>
          {variant === "modal" && onClose ? (
            <div className={styles.searchSetupModalHeader}>
              <h2>Update search area</h2>
              <button
                type="button"
                className={styles.headerGhostButton}
                onClick={onClose}
              >
                Close
              </button>
            </div>
          ) : null}

          <div className={styles.searchTabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={searchMode === "near-me"}
              className={`${styles.searchTab} ${
                searchMode === "near-me" ? styles.searchTabActive : ""
              }`}
              onClick={() => void onNearMe()}
            >
              <Navigation className="h-4 w-4" aria-hidden />
              Near Me
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={searchMode === "place"}
              className={`${styles.searchTab} ${
                searchMode === "place" ? styles.searchTabActive : ""
              }`}
              onClick={() => onSearchModeChange("place")}
            >
              <Search className="h-4 w-4" aria-hidden />
              ZIP or City
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={searchMode === "map"}
              className={`${styles.searchTab} ${
                searchMode === "map" ? styles.searchTabActive : ""
              }`}
              onClick={onOpenMap}
            >
              <MapPin className="h-4 w-4" aria-hidden />
              Choose on Map
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={searchMode === "anywhere"}
              className={`${styles.searchTab} ${
                searchMode === "anywhere" ? styles.searchTabActive : ""
              }`}
              onClick={onChooseAnywhere}
            >
              <Globe2 className="h-4 w-4" aria-hidden />
              Anywhere in the World
            </button>
          </div>

          {searchMode === "place" ? (
            <div className={styles.placeRow}>
              <label htmlFor="prayer-place" className="sr-only">
                ZIP code, city, state, or country
              </label>
              <input
                id="prayer-place"
                className={styles.placeInput}
                value={placeQuery}
                onChange={(event) => onPlaceQueryChange(event.target.value)}
                placeholder="Search ZIP, city, state, or country"
                onKeyDown={(event) => {
                  if (event.key === "Enter") void onSearchPlace();
                }}
              />
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void onSearchPlace()}
              >
                Search
              </button>
            </div>
          ) : null}

          {searchMode !== "anywhere" && !compact ? (
            <div className={styles.radiusRow}>
              <span className={styles.controlLabel}>Radius</span>
              <div className={styles.pillRow}>
                {RADIUS_OPTIONS.filter((option) => option.id !== "anywhere").map(
                  (option) => (
                    <button
                      key={String(option.id)}
                      type="button"
                      className={`${styles.pill} ${
                        radius === option.id ? styles.pillActive : ""
                      }`}
                      onClick={() => onRadiusChange(option.id)}
                    >
                      {option.label}
                    </button>
                  )
                )}
              </div>
            </div>
          ) : null}

          {!compact ? (
          <div className={styles.filterSelectRow}>
            <select
              className={styles.select}
              value={category}
              aria-label="Category"
              onChange={(event) =>
                onCategoryChange(
                  event.target.value as PrayerConnectCategoryFilter
                )
              }
            >
              {PRAYER_CONNECT_CATEGORIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              className={styles.select}
              value={sort}
              aria-label="Sort"
              onChange={(event) =>
                onSortChange(event.target.value as PrayerConnectSort)
              }
            >
              {PRAYER_CONNECT_SORTS.filter(
                (item) => !["video", "photo", "text"].includes(item.id)
              ).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              className={styles.select}
              value={mediaFilter}
              aria-label="Content type"
              onChange={(event) =>
                onMediaFilterChange(
                  event.target.value as "all" | "video" | "photo" | "text"
                )
              }
            >
              <option value="all">All media</option>
              <option value="video">Video</option>
              <option value="photo">Photo</option>
              <option value="text">Text</option>
            </select>
          </div>
          ) : null}

          {!compact && center ? (
            <p className={styles.centerLabel}>
              <Compass className="h-4 w-4" aria-hidden />
              Searching near {center.label}
            </p>
          ) : !compact && searchMode === "anywhere" ? (
            <p className={styles.centerLabel}>
              <Globe2 className="h-4 w-4" aria-hidden />
              Browsing prayer requests anywhere in the world
            </p>
          ) : null}

          {geoError ? (
            <p className={styles.errorText} role="alert">
              {geoError}
            </p>
          ) : null}

          {authMessage ? (
            <p className={styles.errorText} role="status">
              {authMessage}
            </p>
          ) : null}

          <div className={styles.searchSetupActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={onSave}
            >
              Save Search Area
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
