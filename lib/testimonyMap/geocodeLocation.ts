import {
  applyPrivacyCoordinates,
  looksLikePreciseAddress,
  sanitizePublicLocationLabel,
} from "./privacy";

type CoordinateLookup = {
  lat: number;
  lng: number;
};

const CITY_COORDINATES: Record<string, CoordinateLookup> = {
  "phoenix, usa": { lat: 33.4484, lng: -112.074 },
  "phoenix, az": { lat: 33.4484, lng: -112.074 },
  "phoenix, arizona": { lat: 33.4484, lng: -112.074 },
  "austin, usa": { lat: 30.2672, lng: -97.7431 },
  "austin, tx": { lat: 30.2672, lng: -97.7431 },
  "austin, texas": { lat: 30.2672, lng: -97.7431 },
  "denver, usa": { lat: 39.7392, lng: -104.9903 },
  "denver, co": { lat: 39.7392, lng: -104.9903 },
  "denver, colorado": { lat: 39.7392, lng: -104.9903 },
  "buckeye, az": { lat: 33.3703, lng: -112.5838 },
  "buckeye, arizona": { lat: 33.3703, lng: -112.5838 },
  "los angeles, usa": { lat: 34.0522, lng: -118.2437 },
  "los angeles, ca": { lat: 34.0522, lng: -118.2437 },
  "new york, usa": { lat: 40.7128, lng: -74.006 },
  "new york, ny": { lat: 40.7128, lng: -74.006 },
  "chicago, usa": { lat: 41.8781, lng: -87.6298 },
  "chicago, il": { lat: 41.8781, lng: -87.6298 },
  "houston, usa": { lat: 29.7604, lng: -95.3698 },
  "houston, tx": { lat: 29.7604, lng: -95.3698 },
  "dallas, usa": { lat: 32.7767, lng: -96.797 },
  "dallas, tx": { lat: 32.7767, lng: -96.797 },
  "miami, usa": { lat: 25.7617, lng: -80.1918 },
  "miami, fl": { lat: 25.7617, lng: -80.1918 },
  "atlanta, usa": { lat: 33.749, lng: -84.388 },
  "atlanta, ga": { lat: 33.749, lng: -84.388 },
  "seattle, usa": { lat: 47.6062, lng: -122.3321 },
  "seattle, wa": { lat: 47.6062, lng: -122.3321 },
  "nashville, usa": { lat: 36.1627, lng: -86.7816 },
  "nashville, tn": { lat: 36.1627, lng: -86.7816 },
  "lagos, nigeria": { lat: 6.5244, lng: 3.3792 },
  "manila, philippines": { lat: 14.5995, lng: 120.9842 },
  "seoul, south korea": { lat: 37.5665, lng: 126.978 },
  "seoul, korea": { lat: 37.5665, lng: 126.978 },
  "london, uk": { lat: 51.5074, lng: -0.1278 },
  "london, united kingdom": { lat: 51.5074, lng: -0.1278 },
  "toronto, canada": { lat: 43.6532, lng: -79.3832 },
  "sydney, australia": { lat: -33.8688, lng: 151.2093 },
  "melbourne, australia": { lat: -37.8136, lng: 144.9631 },
  "johannesburg, south africa": { lat: -26.2041, lng: 28.0473 },
  "cape town, south africa": { lat: -33.9249, lng: 18.4241 },
  "nairobi, kenya": { lat: -1.2921, lng: 36.8219 },
  "accra, ghana": { lat: 5.6037, lng: -0.187 },
  "mexico city, mexico": { lat: 19.4326, lng: -99.1332 },
  "sao paulo, brazil": { lat: -23.5505, lng: -46.6333 },
  "buenos aires, argentina": { lat: -34.6037, lng: -58.3816 },
  "bogota, colombia": { lat: 4.711, lng: -74.0721 },
  "lima, peru": { lat: -12.0464, lng: -77.0428 },
  "paris, france": { lat: 48.8566, lng: 2.3522 },
  "berlin, germany": { lat: 52.52, lng: 13.405 },
  "rome, italy": { lat: 41.9028, lng: 12.4964 },
  "madrid, spain": { lat: 40.4168, lng: -3.7038 },
  "amsterdam, netherlands": { lat: 52.3676, lng: 4.9041 },
  "dublin, ireland": { lat: 53.3498, lng: -6.2603 },
  "warsaw, poland": { lat: 52.2297, lng: 21.0122 },
  "stockholm, sweden": { lat: 59.3293, lng: 18.0686 },
  "oslo, norway": { lat: 59.9139, lng: 10.7522 },
  "helsinki, finland": { lat: 60.1699, lng: 24.9384 },
  "zurich, switzerland": { lat: 47.3769, lng: 8.5417 },
  "vienna, austria": { lat: 48.2082, lng: 16.3738 },
  "prague, czech republic": { lat: 50.0755, lng: 14.4378 },
  "athens, greece": { lat: 37.9838, lng: 23.7275 },
  "istanbul, turkey": { lat: 41.0082, lng: 28.9784 },
  "dubai, uae": { lat: 25.2048, lng: 55.2708 },
  "riyadh, saudi arabia": { lat: 24.7136, lng: 46.6753 },
  "tel aviv, israel": { lat: 32.0853, lng: 34.7818 },
  "mumbai, india": { lat: 19.076, lng: 72.8777 },
  "delhi, india": { lat: 28.7041, lng: 77.1025 },
  "bangalore, india": { lat: 12.9716, lng: 77.5946 },
  "kolkata, india": { lat: 22.5726, lng: 88.3639 },
  "chennai, india": { lat: 13.0827, lng: 80.2707 },
  "jakarta, indonesia": { lat: -6.2088, lng: 106.8456 },
  "bangkok, thailand": { lat: 13.7563, lng: 100.5018 },
  "singapore, singapore": { lat: 1.3521, lng: 103.8198 },
  "kuala lumpur, malaysia": { lat: 3.139, lng: 101.6869 },
  "hong kong, china": { lat: 22.3193, lng: 114.1694 },
  "shanghai, china": { lat: 31.2304, lng: 121.4737 },
  "beijing, china": { lat: 39.9042, lng: 116.4074 },
  "tokyo, japan": { lat: 35.6762, lng: 139.6503 },
  "osaka, japan": { lat: 34.6937, lng: 135.5023 },
  "taipei, taiwan": { lat: 25.033, lng: 121.5654 },
  "auckland, new zealand": { lat: -36.8485, lng: 174.7633 },
};

const REGION_COORDINATES: Record<string, CoordinateLookup> = {
  arizona: { lat: 34.0489, lng: -111.0937 },
  az: { lat: 34.0489, lng: -111.0937 },
  texas: { lat: 31.9686, lng: -99.9018 },
  tx: { lat: 31.9686, lng: -99.9018 },
  california: { lat: 36.7783, lng: -119.4179 },
  ca: { lat: 36.7783, lng: -119.4179 },
  colorado: { lat: 39.5501, lng: -105.7821 },
  co: { lat: 39.5501, lng: -105.7821 },
  florida: { lat: 27.6648, lng: -81.5158 },
  fl: { lat: 27.6648, lng: -81.5158 },
  georgia: { lat: 32.1656, lng: -82.9001 },
  ga: { lat: 32.1656, lng: -82.9001 },
  tennessee: { lat: 35.5175, lng: -86.5804 },
  tn: { lat: 35.5175, lng: -86.5804 },
  washington: { lat: 47.7511, lng: -120.7401 },
  wa: { lat: 47.7511, lng: -120.7401 },
  illinois: { lat: 40.6331, lng: -89.3985 },
  il: { lat: 40.6331, lng: -89.3985 },
  "new york": { lat: 43.2994, lng: -74.2179 },
  ny: { lat: 43.2994, lng: -74.2179 },
};

const COUNTRY_COORDINATES: Record<string, CoordinateLookup> = {
  usa: { lat: 39.8283, lng: -98.5795 },
  "united states": { lat: 39.8283, lng: -98.5795 },
  us: { lat: 39.8283, lng: -98.5795 },
  nigeria: { lat: 9.082, lng: 8.6753 },
  philippines: { lat: 12.8797, lng: 121.774 },
  "south korea": { lat: 35.9078, lng: 127.7669 },
  korea: { lat: 35.9078, lng: 127.7669 },
  uk: { lat: 55.3781, lng: -3.436 },
  "united kingdom": { lat: 55.3781, lng: -3.436 },
  canada: { lat: 56.1304, lng: -106.3468 },
  australia: { lat: -25.2744, lng: 133.7751 },
  "south africa": { lat: -30.5595, lng: 22.9375 },
  kenya: { lat: -0.0236, lng: 37.9062 },
  ghana: { lat: 7.9465, lng: -1.0232 },
  mexico: { lat: 23.6345, lng: -102.5528 },
  brazil: { lat: -14.235, lng: -51.9253 },
  argentina: { lat: -38.4161, lng: -63.6167 },
  colombia: { lat: 4.5709, lng: -74.2973 },
  peru: { lat: -9.19, lng: -75.0152 },
  france: { lat: 46.2276, lng: 2.2137 },
  germany: { lat: 51.1657, lng: 10.4515 },
  italy: { lat: 41.8719, lng: 12.5674 },
  spain: { lat: 40.4637, lng: -3.7492 },
  netherlands: { lat: 52.1326, lng: 5.2913 },
  ireland: { lat: 53.4129, lng: -8.2439 },
  poland: { lat: 51.9194, lng: 19.1451 },
  sweden: { lat: 60.1282, lng: 18.6435 },
  norway: { lat: 60.472, lng: 8.4689 },
  finland: { lat: 61.9241, lng: 25.7482 },
  switzerland: { lat: 46.8182, lng: 8.2275 },
  austria: { lat: 47.5162, lng: 14.5501 },
  greece: { lat: 39.0742, lng: 21.8243 },
  turkey: { lat: 38.9637, lng: 35.2433 },
  uae: { lat: 23.4241, lng: 53.8478 },
  "saudi arabia": { lat: 23.8859, lng: 45.0792 },
  israel: { lat: 31.0461, lng: 34.8516 },
  india: { lat: 20.5937, lng: 78.9629 },
  indonesia: { lat: -0.7893, lng: 113.9213 },
  thailand: { lat: 15.87, lng: 100.9925 },
  singapore: { lat: 1.3521, lng: 103.8198 },
  malaysia: { lat: 4.2105, lng: 101.9758 },
  china: { lat: 35.8617, lng: 104.1954 },
  japan: { lat: 36.2048, lng: 138.2529 },
  taiwan: { lat: 23.6978, lng: 120.9605 },
  "new zealand": { lat: -40.9006, lng: 174.886 },
};

function normalizeLookupKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function geocodePublicLocation(
  location: string,
  seed: string
): { lat: number; lng: number; label: string } | null {
  if (looksLikePreciseAddress(location)) return null;

  const label = sanitizePublicLocationLabel(location);
  if (!label) return null;

  const normalized = normalizeLookupKey(label);
  const parts = normalized.split(",").map((part) => part.trim()).filter(Boolean);

  let base: CoordinateLookup | null = CITY_COORDINATES[normalized] ?? null;

  if (!base && parts.length >= 2) {
    const cityCountry = `${parts[0]}, ${parts[parts.length - 1]}`;
    base = CITY_COORDINATES[cityCountry] ?? null;
  }

  if (!base && parts.length >= 1) {
    base = REGION_COORDINATES[parts[0]] ?? null;
  }

  if (!base && parts.length >= 2) {
    base = COUNTRY_COORDINATES[parts[parts.length - 1]] ?? null;
  }

  if (!base && parts.length === 1) {
    base =
      COUNTRY_COORDINATES[parts[0]] ??
      REGION_COORDINATES[parts[0]] ??
      null;
  }

  if (!base) return null;

  const privacy = applyPrivacyCoordinates(base.lat, base.lng, seed);

  return {
    lat: privacy.lat,
    lng: privacy.lng,
    label,
  };
}
