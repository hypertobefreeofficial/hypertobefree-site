import type {
  PrayerConnectCategoryFilter,
  PrayerConnectMediaKind,
  PrayerConnectRadiusMiles,
  PrayerConnectRequest,
  PrayerConnectSearchCenter,
  PrayerConnectSort,
} from "./types";
import { partitionPrayerTopics } from "./topicPartition";

export const PRAYER_CONNECT_CATEGORIES: {
  id: PrayerConnectCategoryFilter;
  label: string;
}[] = [
  { id: "all", label: "All requests" },
  { id: "health", label: "Health" },
  { id: "family", label: "Family" },
  { id: "relationships", label: "Relationships" },
  { id: "finances", label: "Finances" },
  { id: "work", label: "Work" },
  { id: "faith", label: "Faith" },
  { id: "grief", label: "Grief" },
  { id: "addiction", label: "Addiction" },
  { id: "children", label: "Children" },
  { id: "community", label: "Community" },
  { id: "ministry", label: "Ministry" },
  { id: "emotional", label: "Emotional well-being" },
  { id: "other", label: "Other" },
];

export const MAX_CUSTOM_PRAYER_TYPE_LENGTH = 60;

// Extended, human-facing prayer-type picker used by the composer. Each option
// maps to an existing base category (so Discover filtering/sorting keeps
// working) while the specific label is stored separately and shown on cards.
export type PrayerTypeOption = {
  label: string;
  category: Exclude<PrayerConnectCategoryFilter, "all">;
};

export const PRAYER_TYPE_OPTIONS: PrayerTypeOption[] = [
  { label: "Addiction and Recovery", category: "addiction" },
  { label: "Anxiety and Fear", category: "emotional" },
  { label: "Caregiving", category: "family" },
  { label: "Children", category: "children" },
  { label: "Church and Ministry", category: "ministry" },
  { label: "Crisis or Emergency", category: "other" },
  { label: "Deliverance", category: "faith" },
  { label: "Depression and Mental Wellness", category: "emotional" },
  { label: "Education", category: "other" },
  { label: "Employment", category: "work" },
  { label: "Family", category: "family" },
  { label: "Finances", category: "finances" },
  { label: "Forgiveness", category: "faith" },
  { label: "Grief and Loss", category: "grief" },
  { label: "Guidance and Direction", category: "faith" },
  { label: "Healing", category: "health" },
  { label: "Housing", category: "other" },
  { label: "Legal Matters", category: "other" },
  { label: "Loneliness", category: "emotional" },
  { label: "Marriage", category: "relationships" },
  { label: "Military and Veterans", category: "community" },
  { label: "Parenting", category: "children" },
  { label: "Pregnancy and Fertility", category: "health" },
  { label: "Protection and Safety", category: "other" },
  { label: "Relationships", category: "relationships" },
  { label: "Salvation", category: "faith" },
  { label: "Spiritual Growth", category: "faith" },
  { label: "Temptation", category: "faith" },
  { label: "Travel", category: "other" },
  { label: "World Events", category: "community" },
  { label: "Praise and Thanksgiving", category: "faith" },
  { label: "Other", category: "other" },
];

export function sanitizeCustomPrayerType(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[<>{}[\]\\|`]/g, "")
    .slice(0, MAX_CUSTOM_PRAYER_TYPE_LENGTH);
}

export const PRAYER_CONNECT_SORTS: { id: PrayerConnectSort; label: string }[] = [
  { id: "needs-prayer", label: "Needs Prayer" },
  { id: "recent", label: "Most recent" },
  { id: "nearest", label: "Nearest" },
  { id: "urgent", label: "Urgent" },
  { id: "most-prayed", label: "Most prayed for" },
  { id: "video", label: "Video only" },
  { id: "photo", label: "Photo only" },
  { id: "text", label: "Text only" },
  { id: "active", label: "Active requests" },
  { id: "answered", label: "Answered prayers" },
];

export const RADIUS_OPTIONS: { id: PrayerConnectRadiusMiles; label: string }[] =
  [
    { id: 5, label: "5 miles" },
    { id: 10, label: "10 miles" },
    { id: 25, label: "25 miles" },
    { id: 50, label: "50 miles" },
    { id: 100, label: "100 miles" },
    { id: "anywhere", label: "Anywhere" },
  ];

export function milesBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthMiles = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthMiles * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatApproximateDistance(miles: number | null) {
  if (miles == null || !Number.isFinite(miles)) return null;
  if (miles < 1) return "Less than 1 mile away";
  const rounded = Math.round(miles);
  return `approximately ${rounded} mile${rounded === 1 ? "" : "s"} away`;
}

export function formatRelativeTime(value: string | null) {
  if (!value) return "Recently";
  const stamp = new Date(value).getTime();
  if (!Number.isFinite(stamp)) return "Recently";

  const diffMs = Date.now() - stamp;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(stamp));
}

export function getPrayerTitle(text: string | null) {
  const clean = text?.trim() || "";
  if (!clean) return "Prayer request";
  const firstLine = clean.split(/\n/)[0]?.trim() || clean;
  return firstLine.length > 72 ? `${firstLine.slice(0, 72)}…` : firstLine;
}

export function inferPrayerCategory(
  storyType: string | null,
  storyText: string | null,
  topics: string[] | null | undefined
): { id: PrayerConnectCategoryFilter; label: string } {
  const partitioned = partitionPrayerTopics(topics);

  // Prefer the explicit prayer-type label captured at post time so custom and
  // extended types always show their real wording (never just "Other").
  if (partitioned.prayerTypeLabel) {
    return {
      id: partitioned.category ?? "other",
      label: partitioned.prayerTypeLabel,
    };
  }

  if (partitioned.category) {
    const match = PRAYER_CONNECT_CATEGORIES.find(
      (item) => item.id === partitioned.category
    );
    if (match && match.id !== "all") {
      if (match.id === "other" && partitioned.publicTopics.length > 0) {
        return { id: "other", label: partitioned.publicTopics[0] };
      }
      return { id: match.id, label: match.label };
    }
  }

  const haystack = [
    storyType || "",
    storyText || "",
    ...partitioned.publicTopics,
  ]
    .join(" ")
    .toLowerCase();

  const match = (
    id: PrayerConnectCategoryFilter,
    label: string,
    keys: string[]
  ) => (keys.some((key) => haystack.includes(key)) ? { id, label } : null);

  return (
    match("health", "Health", ["health", "healing", "hospital", "cancer", "surgery"]) ||
    match("family", "Family", ["family", "marriage", "parent", "spouse"]) ||
    match("children", "Children", ["child", "children", "daughter", "son", "kids"]) ||
    match("relationships", "Relationships", ["relationship", "friendship", "dating"]) ||
    match("finances", "Finances", ["finance", "money", "debt", "bills", "provision"]) ||
    match("work", "Work", ["work", "job", "career", "business"]) ||
    match("grief", "Grief", ["grief", "loss", "mourning", "passed"]) ||
    match("addiction", "Addiction", ["addiction", "recovery", "sobriety"]) ||
    match("community", "Community", ["community", "neighborhood", "city"]) ||
    match("ministry", "Ministry", ["ministry", "church", "mission"]) ||
    match("emotional", "Emotional well-being", [
      "anxiety",
      "depression",
      "emotional",
      "peace",
      "mental",
    ]) ||
    match("faith", "Faith", ["faith", "spiritual", "believe", "discipleship"]) ||
    { id: "other", label: "Other" }
  );
}

export function inferMediaKind(
  videoUrl: string | null,
  imageUrl: string | null,
  thumbnailUrl: string | null
): PrayerConnectMediaKind {
  if (videoUrl) return "video";
  if (imageUrl || thumbnailUrl) return "photo";
  return "text";
}

export function detectSensitivePersonalInfo(text: string) {
  const value = text.trim();
  if (!value) return [] as string[];

  const findings: string[] = [];
  if (/\b\d{1,5}\s+\w+\s+(street|st\.|avenue|ave\.|road|rd\.|drive|dr\.|lane|ln\.)\b/i.test(value)) {
    findings.push("address");
  }
  if (/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(value)) {
    findings.push("phone number");
  }
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value)) {
    findings.push("email address");
  }
  if (/\b(room|rm\.?)\s*\d{1,4}\b/i.test(value)) {
    findings.push("room number");
  }

  return findings;
}

export function filterPrayerRequestsByContent(
  requests: PrayerConnectRequest[],
  query: string
) {
  const needle = query.trim().toLowerCase();
  if (!needle) return requests;

  return requests.filter((request) => {
    const haystack = [
      request.title,
      request.body,
      request.categoryLabel,
      request.locationLabel || "",
      ...request.topics,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function filterAndSortPrayerRequests(
  requests: PrayerConnectRequest[],
  options: {
    center: PrayerConnectSearchCenter | null;
    radius: PrayerConnectRadiusMiles;
    category: PrayerConnectCategoryFilter;
    sort: PrayerConnectSort;
    searchMode: "near-me" | "place" | "map" | "anywhere";
  }
) {
  const withDistance = requests.map((request) => {
    if (
      !options.center ||
      options.searchMode === "anywhere" ||
      options.radius === "anywhere" ||
      request.lat == null ||
      request.lng == null
    ) {
      return { ...request, distanceMiles: null as number | null };
    }

    return {
      ...request,
      distanceMiles: milesBetween(options.center, {
        lat: request.lat,
        lng: request.lng,
      }),
    };
  });

  let filtered = withDistance.filter((request) => {
    if (options.category !== "all" && request.category !== options.category) {
      return false;
    }

    if (options.sort === "video" && request.mediaKind !== "video") return false;
    if (options.sort === "photo" && request.mediaKind !== "photo") return false;
    if (options.sort === "text" && request.mediaKind !== "text") return false;
    if (options.sort === "active" && request.prayerStatus !== "active") {
      return false;
    }
    if (options.sort === "answered" && request.prayerStatus !== "answered") {
      return false;
    }
    if (options.sort === "urgent" && !request.isUrgent) return false;

    if (
      options.searchMode !== "anywhere" &&
      options.radius !== "anywhere" &&
      options.center
    ) {
      if (request.lat == null || request.lng == null) return false;
      if (
        request.distanceMiles != null &&
        request.distanceMiles > options.radius
      ) {
        return false;
      }
    }

    return true;
  });

  filtered = [...filtered].sort((a, b) => {
    switch (options.sort) {
      case "nearest":
        return (a.distanceMiles ?? Number.POSITIVE_INFINITY) -
          (b.distanceMiles ?? Number.POSITIVE_INFINITY);
      case "most-prayed":
        return b.prayingCount - a.prayingCount;
      case "needs-prayer":
        return a.prayingCount - b.prayingCount ||
          new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime();
      case "urgent":
        return Number(b.isUrgent) - Number(a.isUrgent);
      case "recent":
      default:
        return (
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
        );
    }
  });

  return filtered;
}
