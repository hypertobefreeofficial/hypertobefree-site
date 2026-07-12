"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { getCategoryMarkerClass } from "../../lib/testimonyMap/categories";
import type { MapStoryRecord } from "../../lib/testimonyMap/types";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "./testimony-map.css";

import "leaflet.markercluster";

function createMarkerIcon(className: string) {
  return L.divIcon({
    className: "",
    html: `<span class="htbf-testimony-map__marker ${className}" aria-hidden="true"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function ClusterMarkers({
  stories,
  onSelect,
  focusStoryId,
}: {
  stories: MapStoryRecord[];
  onSelect: (story: MapStoryRecord) => void;
  focusStoryId?: string | null;
}) {
  const map = useMap();
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const cluster = (
      L as typeof L & {
        markerClusterGroup: (options?: object) => L.LayerGroup;
      }
    ).markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 52,
      iconCreateFunction: (childCluster: {
        getChildCount: () => number;
      }) =>
        L.divIcon({
          html: `<span class="htbf-testimony-map__cluster">${childCluster.getChildCount()}</span>`,
          className: "",
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        }),
    });

    stories.forEach((story) => {
      const marker = L.marker([story.lat, story.lng], {
        icon: createMarkerIcon(getCategoryMarkerClass(story.category)),
        title: story.locationLabel,
      });

      marker.on("click", () => onSelectRef.current(story));
      cluster.addLayer(marker);
    });

    map.addLayer(cluster);

    if (stories.length > 0) {
      const bounds = L.latLngBounds(stories.map((story) => [story.lat, story.lng]));
      map.fitBounds(bounds.pad(0.22), { animate: false });
    }

    return () => {
      map.removeLayer(cluster);
    };
  }, [map, stories]);

  useEffect(() => {
    if (!focusStoryId) return;

    const story = stories.find((item) => item.id === focusStoryId);
    if (!story) return;

    map.flyTo([story.lat, story.lng], Math.max(map.getZoom(), 5), {
      duration: 0.8,
    });
  }, [focusStoryId, map, stories]);

  return null;
}

type TestimonyMapLeafletProps = {
  stories: MapStoryRecord[];
  onSelect: (story: MapStoryRecord) => void;
  focusStoryId?: string | null;
};

export default function TestimonyMapLeaflet({
  stories,
  onSelect,
  focusStoryId,
}: TestimonyMapLeafletProps) {
  const tileUrl =
    process.env.NEXT_PUBLIC_MAP_TILE_URL ??
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  return (
    <div className="htbf-testimony-map__surface h-full min-h-[420px] lg:min-h-[560px]">
      <MapContainer
        center={[20, 0]}
        zoom={2}
        scrollWheelZoom
        className="htbf-testimony-map__leaflet"
        aria-label="Interactive testimony map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={tileUrl}
        />
        <ClusterMarkers
          stories={stories}
          onSelect={onSelect}
          focusStoryId={focusStoryId}
        />
      </MapContainer>
    </div>
  );
}
