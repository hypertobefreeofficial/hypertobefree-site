import { geocodePublicLocation } from "../testimonyMap/geocodeLocation";

export type PlaceGeocodeResult = {
  lat: number;
  lng: number;
  label: string;
};

/**
 * Resolve a place query using the existing static HTBF location atlas first,
 * then optionally OpenStreetMap Nominatim (same tile provider family; no new
 * paid map provider).
 */
export async function geocodePlaceQuery(
  query: string
): Promise<PlaceGeocodeResult | null> {
  const cleaned = query.trim();
  if (!cleaned) return null;

  const local = geocodePublicLocation(cleaned, `place:${cleaned.toLowerCase()}`);
  if (local) {
    return { lat: local.lat, lng: local.lng, label: local.label };
  }

  if (typeof fetch !== "function") return null;

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", cleaned);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
    }>;

    const hit = data[0];
    if (!hit?.lat || !hit?.lon) return null;

    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    // Round publicly exposed search centers for privacy safety.
    return {
      lat: Math.round(lat * 100) / 100,
      lng: Math.round(lng * 100) / 100,
      label: hit.display_name?.split(",").slice(0, 3).join(",").trim() || cleaned,
    };
  } catch {
    return null;
  }
}
