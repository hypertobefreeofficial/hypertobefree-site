"use client";

import {
  Globe2,
  MapPin,
  Navigation,
  Search,
} from "lucide-react";
import type {
  PrayerConnectCategoryFilter,
  PrayerConnectRadiusMiles,
  PrayerConnectSearchMode,
} from "../../lib/prayer-connect/types";
import { RADIUS_OPTIONS } from "../../lib/prayer-connect/utils";
import styles from "./PrayerConnect.module.css";

type PrayerSearchRailProps = {
  searchMode: PrayerConnectSearchMode;
  radius: PrayerConnectRadiusMiles;
  placeQuery: string;
  geoError: string | null;
  onSearchModeChange: (mode: PrayerConnectSearchMode) => void;
  onPlaceQueryChange: (value: string) => void;
  onRadiusChange: (radius: PrayerConnectRadiusMiles) => void;
  onNearMe: () => void;
  onSearchPlace: () => void;
  onChooseAnywhere: () => void;
  onOpenMap: () => void;
  onSave: () => void;
};

export default function PrayerSearchRail({
  searchMode,
  radius,
  placeQuery,
  geoError,
  onSearchModeChange,
  onPlaceQueryChange,
  onRadiusChange,
  onNearMe,
  onSearchPlace,
  onChooseAnywhere,
  onOpenMap,
  onSave,
}: PrayerSearchRailProps) {
  return (
    <section className={styles.searchRail} aria-label="Prayer search setup">
      <div className={styles.searchRailIntro}>
        <h2 className={styles.searchRailTitle}>Where would you like to pray?</h2>
        <p className={styles.searchRailSubtitle}>
          Choose a location to personalize nearby prayer requests.
        </p>
      </div>

      <div className={styles.searchRailControls}>
        <div className={styles.searchRailModes} role="tablist" aria-label="Location mode">
          <button
            type="button"
            role="tab"
            aria-selected={searchMode === "near-me"}
            className={`${styles.searchRailMode} ${
              searchMode === "near-me" ? styles.searchRailModeActive : ""
            }`}
            onClick={() => void onNearMe()}
          >
            <Navigation className="h-3.5 w-3.5" aria-hidden />
            Near Me
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={searchMode === "place"}
            className={`${styles.searchRailMode} ${
              searchMode === "place" ? styles.searchRailModeActive : ""
            }`}
            onClick={() => onSearchModeChange("place")}
          >
            <Search className="h-3.5 w-3.5" aria-hidden />
            ZIP / City
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={searchMode === "map"}
            className={`${styles.searchRailMode} ${
              searchMode === "map" ? styles.searchRailModeActive : ""
            }`}
            onClick={onOpenMap}
          >
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            On Map
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={searchMode === "anywhere"}
            className={`${styles.searchRailMode} ${
              searchMode === "anywhere" ? styles.searchRailModeActive : ""
            }`}
            onClick={onChooseAnywhere}
          >
            <Globe2 className="h-3.5 w-3.5" aria-hidden />
            Anywhere
          </button>
        </div>

        {searchMode === "place" ? (
          <div className={styles.searchRailPlaceRow}>
            <input
              className={styles.searchRailPlaceInput}
              value={placeQuery}
              placeholder="ZIP, city, or country"
              aria-label="ZIP, city, or country"
              onChange={(event) => onPlaceQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void onSearchPlace();
              }}
            />
            <button
              type="button"
              className={styles.searchRailGhostButton}
              onClick={() => void onSearchPlace()}
            >
              Search
            </button>
          </div>
        ) : null}

        {searchMode !== "anywhere" ? (
          <label className={styles.searchRailRadius}>
            <span className="sr-only">Radius</span>
            <select
              value={String(radius)}
              onChange={(event) =>
                onRadiusChange(
                  event.target.value === "anywhere"
                    ? "anywhere"
                    : (Number(event.target.value) as PrayerConnectRadiusMiles)
                )
              }
            >
              {RADIUS_OPTIONS.filter((option) => option.id !== "anywhere").map(
                (option) => (
                  <option key={String(option.id)} value={String(option.id)}>
                    {option.label}
                  </option>
                )
              )}
            </select>
          </label>
        ) : null}

        <button type="button" className={styles.searchRailSave} onClick={onSave}>
          Save Search Area
        </button>
      </div>

      {geoError ? (
        <p className={styles.searchRailError} role="alert">
          {geoError}
        </p>
      ) : null}
    </section>
  );
}
