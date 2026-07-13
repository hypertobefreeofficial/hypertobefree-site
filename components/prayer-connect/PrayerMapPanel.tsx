"use client";

import dynamic from "next/dynamic";
import { Expand, LocateFixed, Minus, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { PrayerConnectRequest } from "../../lib/prayer-connect/types";
import type { PrayerConnectRadiusMiles } from "../../lib/prayer-connect/types";
import styles from "./PrayerConnect.module.css";

const PrayerConnectMap = dynamic(() => import("./PrayerConnectMap"), {
  ssr: false,
  loading: () => (
    <div className={styles.mapLoadingState} aria-busy="true">
      <div className={styles.mapLoadingPulse} />
      <p>Loading map…</p>
    </div>
  ),
});

type PrayerMapPanelProps = {
  requests: PrayerConnectRequest[];
  center: { lat: number; lng: number } | null;
  radiusMiles: PrayerConnectRadiusMiles;
  pendingMapCenter: { lat: number; lng: number } | null;
  onSelect: (request: PrayerConnectRequest) => void;
  onMapIdle: (center: { lat: number; lng: number }) => void;
  onSearchThisArea: () => void;
  onRecenter?: () => void;
  onExpand?: () => void;
  spotlight?: ReactNode;
};

export default function PrayerMapPanel({
  requests,
  center,
  radiusMiles,
  pendingMapCenter,
  onSelect,
  onMapIdle,
  onSearchThisArea,
  onRecenter,
  onExpand,
  spotlight,
}: PrayerMapPanelProps) {
  const [zoomSignal, setZoomSignal] = useState(0);
  const [zoomDirection, setZoomDirection] = useState<"in" | "out">("in");
  const showSearchThisArea =
    pendingMapCenter &&
    (!center ||
      pendingMapCenter.lat !== center.lat ||
      pendingMapCenter.lng !== center.lng);

  return (
    <div className={styles.mapColumn}>
      <div className={styles.mapToolbar}>
        <div className={styles.mapToolbarCopy}>
          <span className={styles.mapToolbarTitle}>Prayer map</span>
          <span className={styles.mapToolbarMeta}>
            {requests.length} request{requests.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className={styles.mapToolbarActions}>
          {showSearchThisArea ? (
            <button
              type="button"
              className={styles.mapSearchAreaButton}
              onClick={onSearchThisArea}
            >
              Search This Area
            </button>
          ) : null}
          {onExpand ? (
            <button
              type="button"
              className={styles.mapExpandButton}
              onClick={onExpand}
              aria-label="Expand map"
            >
              <Expand className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.mapSurface}>
        <PrayerConnectMap
          requests={requests}
          center={center}
          radiusMiles={radiusMiles}
          onSelect={onSelect}
          onMapIdle={onMapIdle}
          zoomSignal={zoomSignal}
          zoomDirection={zoomDirection}
        />

        <div className={styles.mapControls} aria-label="Map controls">
          <button
            type="button"
            className={styles.mapControlButton}
            aria-label="Zoom in"
            onClick={() => {
              setZoomDirection("in");
              setZoomSignal((value) => value + 1);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            className={styles.mapControlButton}
            aria-label="Zoom out"
            onClick={() => {
              setZoomDirection("out");
              setZoomSignal((value) => value + 1);
            }}
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          {onRecenter ? (
            <button
              type="button"
              className={styles.mapControlButton}
              aria-label="Recenter map"
              onClick={onRecenter}
            >
              <LocateFixed className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      {spotlight}

      <div className={styles.mapLegend}>
        <span className={styles.mapLegendItem}>
          <span className={styles.mapLegendDot} data-kind="request" />
          Prayer requests
        </span>
        <span className={styles.mapLegendItem}>
          <span className={styles.mapLegendDot} data-kind="answered" />
          Answered
        </span>
      </div>
    </div>
  );
}
