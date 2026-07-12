function hashSeed(seed: string) {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

export function applyPrivacyCoordinates(
  lat: number,
  lng: number,
  seed: string
): { lat: number; lng: number } {
  const hash = hashSeed(seed);
  const offsetLat = ((hash % 80) - 40) / 400;
  const offsetLng = (((hash >> 8) % 80) - 40) / 400;

  return {
    lat: Math.round((lat + offsetLat) * 10) / 10,
    lng: Math.round((lng + offsetLng) * 10) / 10,
  };
}

export function looksLikePreciseAddress(location: string) {
  const normalized = location.trim().toLowerCase();

  if (!normalized) return true;
  if (/^\d{1,5}\s/.test(normalized)) return true;
  if (/\b(street|st\.|avenue|ave\.|road|rd\.|drive|dr\.|lane|ln\.|boulevard|blvd\.|suite|apt|apartment|unit)\b/.test(normalized)) {
    return true;
  }
  if (/\b\d{5}(-\d{4})?\b/.test(normalized)) return true;

  return false;
}

export function sanitizePublicLocationLabel(location: string) {
  const trimmed = location.trim();

  if (!trimmed || looksLikePreciseAddress(trimmed)) return null;

  const parts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]}, ${parts[parts.length - 1]}`;
  }

  return trimmed;
}
