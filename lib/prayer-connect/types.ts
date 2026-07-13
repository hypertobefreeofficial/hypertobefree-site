export type PrayerConnectRadiusMiles = 5 | 10 | 25 | 50 | 100 | "anywhere";

export type PrayerConnectSearchMode =
  | "near-me"
  | "place"
  | "map"
  | "anywhere";

export type PrayerConnectCategoryFilter =
  | "all"
  | "health"
  | "family"
  | "relationships"
  | "finances"
  | "work"
  | "faith"
  | "grief"
  | "addiction"
  | "children"
  | "community"
  | "ministry"
  | "emotional"
  | "other";

export type PrayerConnectSort =
  | "recent"
  | "nearest"
  | "needs-prayer"
  | "urgent"
  | "most-prayed"
  | "video"
  | "photo"
  | "text"
  | "active"
  | "answered";

export type PrayerConnectMediaKind = "video" | "photo" | "text";

export type PrayerConnectRequest = {
  id: string;
  userId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  title: string;
  body: string;
  locationLabel: string | null;
  category: PrayerConnectCategoryFilter;
  categoryLabel: string;
  mediaKind: PrayerConnectMediaKind;
  imageUrl: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  prayerStatus: "active" | "answered" | "paused";
  createdAt: string | null;
  lat: number | null;
  lng: number | null;
  distanceMiles: number | null;
  prayingCount: number;
  encouragementCount: number;
  responseCount: number;
  isAnonymous: boolean;
  isUrgent: boolean;
  topics: string[];
};

export type PrayerConnectSearchCenter = {
  lat: number;
  lng: number;
  label: string;
};
