"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Circle, Marker, useMap, useMapEvents } from "react-leaflet";
import type { PrayerConnectRequest } from "../../lib/prayer-connect/types";
import type { MapStoryRecord } from "../../lib/testimonyMap/types";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "../testimony-map/testimony-map.css";
import "leaflet.markercluster";

function createMarkerIcon() {
  return L.divIcon({
    className: "",
    html: `<span class="htbf-testimony-map__marker htbf-testimony-map__marker--prayer" aria-hidden="true"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function CenterController({
  center,
  zoom,
}: {
  center: { lat: number; lng: number } | null;
  zoom: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!center) return;
    map.setView([center.lat, center.lng], zoom, { animate: true });
  }, [center, map, zoom]);

  return null;
}

function MoveWatcher({
  onIdleCenter,
}: {
  onIdleCenter: (center: { lat: number; lng: number }) => void;
}) {
  const map = useMapEvents({
    moveend: () => {
      const next = map.getCenter();
      onIdleCenter({
        lat: Math.round(next.lat * 100) / 100,
        lng: Math.round(next.lng * 100) / 100,
      });
    },
  });

  return null;
}

function ClusterLayer({
  requests,
  onSelect,
}: {
  requests: PrayerConnectRequest[];
  onSelect: (request: PrayerConnectRequest) => void;
}) {
  const map = useMap();
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const mappable = requests.filter(
      (item): item is PrayerConnectRequest & { lat: number; lng: number } =>
        item.lat != null && item.lng != null
    );

    const cluster = (
      L as typeof L & {
        markerClusterGroup: (options?: object) => L.LayerGroup;
      }
    ).markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 52,
      iconCreateFunction: (childCluster: { getChildCount: () => number }) =>
        L.divIcon({
          html: `<span class="htbf-testimony-map__cluster">${childCluster.getChildCount()}</span>`,
          className: "",
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        }),
    });

    mappable.forEach((request) => {
      const marker = L.marker([request.lat, request.lng], {
        icon: createMarkerIcon(),
        title: request.locationLabel || "Prayer request",
      });
      marker.on("click", () => onSelectRef.current(request));
      cluster.addLayer(marker);
    });

    map.addLayer(cluster);
    return () => {
      map.removeLayer(cluster);
    };
  }, [map, requests]);

  return null;
}

type PrayerConnectMapProps = {
  requests: PrayerConnectRequest[];
  center: { lat: number; lng: number } | null;
  radiusMiles: number | "anywhere";
  onSelect: (request: PrayerConnectRequest) => void;
  onMapIdle: (center: { lat: number; lng: number }) => void;
};

export default function PrayerConnectMap({
  requests,
  center,
  radiusMiles,
  onSelect,
  onMapIdle,
}: PrayerConnectMapProps) {
  const tileUrl =
    process.env.NEXT_PUBLIC_MAP_TILE_URL ??
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  const viewCenter = center ?? { lat: 20, lng: 0 };
  const zoom = center ? (radiusMiles === "anywhere" ? 3 : radiusMiles <= 10 ? 11 : radiusMiles <= 25 ? 10 : 8) : 2;
  const radiusMeters =
    typeof radiusMiles === "number" ? radiusMiles * 1609.34 : 0;

  return (
    <div className="htbf-testimony-map__surface h-full min-h-[280px]">
      <MapContainer
        center={[viewCenter.lat, viewCenter.lng]}
        zoom={zoom}
        scrollWheelZoom
        className="htbf-testimony-map__leaflet"
        aria-label="Prayer Connect map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={tileUrl}
        />
        <CenterController center={center} zoom={zoom} />
        <MoveWatcher onIdleCenter={onMapIdle} />
        {center && typeof radiusMiles === "number" ? (
          <Circle
            center={[center.lat, center.lng]}
            radius={radiusMeters}
            pathOptions={{
              color: "#0b63ce",
              fillColor: "#69b7ff",
              fillOpacity: 0.12,
              weight: 2,
            }}
          />
        ) : null}
        {center ? (
          <Marker
            position={[center.lat, center.lng]}
            icon={L.divIcon({
              className: "",
              html: `<span class="htbf-testimony-map__marker htbf-testimony-map__marker--answered" aria-hidden="true"></span>`,
              iconSize: [22, 22],
              iconAnchor: [11, 11],
            })}
          />
        ) : null}
        <ClusterLayer requests={requests} onSelect={onSelect} />
      </MapContainer>
    </div>
  );
}

/** Adapter helper if map story records are needed elsewhere */
export function toMapStoryRecord(
  request: PrayerConnectRequest
): MapStoryRecord | null {
  if (request.lat == null || request.lng == null) return null;
  return {
    id: request.id,
    userId: request.userId,
    name: request.displayName,
    locationLabel: request.locationLabel || "Approximate area",
    storyType: "Prayer Request",
    storyText: request.body,
    imageUrl: request.imageUrl,
    videoUrl: request.videoUrl,
    prayerStatus: request.prayerStatus,
    createdAt: request.createdAt,
    category: request.prayerStatus === "answered" ? "answered" : "prayer",
    lat: request.lat,
    lng: request.lng,
    reactionSummary: {
      amen: 0,
      praiseGod: 0,
      encouraged: request.encouragementCount,
      praying: request.prayingCount,
    },
  };
}
