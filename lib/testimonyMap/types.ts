export type MapStoryCategory =
  | "all"
  | "testimony"
  | "praise"
  | "prayer"
  | "healing"
  | "freedom"
  | "restoration"
  | "answered";

export type MapStoryRecord = {
  id: string;
  userId: string | null;
  name: string | null;
  locationLabel: string;
  storyType: string | null;
  storyText: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  prayerStatus: string | null;
  createdAt: string | null;
  category: MapStoryCategory;
  lat: number;
  lng: number;
  reactionSummary?: {
    amen: number;
    praiseGod: number;
    encouraged: number;
    praying: number;
  };
};

export type MapLoadState =
  | "loading"
  | "ready"
  | "empty"
  | "error"
  | "offline";

export type MapFilterId = MapStoryCategory;
