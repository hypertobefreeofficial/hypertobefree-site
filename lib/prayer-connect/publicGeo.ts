import { geocodePublicLocation } from "../testimonyMap/geocodeLocation";
import {
  looksLikePreciseAddress,
  sanitizePublicLocationLabel,
} from "../testimonyMap/privacy";

export type LocationVisibility =
  | "none"
  | "country"
  | "state"
  | "city"
  | "approximate"
  | "map-place";

export type PublicGeoPayload = {
  public_lat: number | null;
  public_lng: number | null;
  public_location_label: string | null;
  location_visibility: LocationVisibility;
  location: string | null;
};

/**
 * Build privacy-safe searchable coordinates for a prayer request.
 * Never stores exact residential GPS — uses the same atlas + jitter
 * pipeline as the testimony map.
 */
export function buildPublicGeoForPrayer(options: {
  locationLabel: string | null | undefined;
  visibility: LocationVisibility;
  seed: string;
}): PublicGeoPayload {
  if (options.visibility === "none" || !options.locationLabel?.trim()) {
    return {
      public_lat: null,
      public_lng: null,
      public_location_label: null,
      location_visibility: "none",
      location: null,
    };
  }

  const raw = options.locationLabel.trim();
  if (looksLikePreciseAddress(raw)) {
    return {
      public_lat: null,
      public_lng: null,
      public_location_label: null,
      location_visibility: options.visibility,
      location: null,
    };
  }

  const label = sanitizePublicLocationLabel(raw);
  if (!label) {
    return {
      public_lat: null,
      public_lng: null,
      public_location_label: null,
      location_visibility: options.visibility,
      location: null,
    };
  }

  // Country / state visibility: store label but only coarse geocode when possible.
  const geocoded = geocodePublicLocation(label, options.seed);
  if (!geocoded) {
    return {
      public_lat: null,
      public_lng: null,
      public_location_label: label,
      location_visibility: options.visibility,
      location: label,
    };
  }

  return {
    public_lat: geocoded.lat,
    public_lng: geocoded.lng,
    public_location_label: geocoded.label,
    location_visibility: options.visibility,
    location: geocoded.label,
  };
}
