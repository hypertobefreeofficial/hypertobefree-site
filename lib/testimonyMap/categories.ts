import type { MapStoryCategory } from "./types";

export const MAP_FILTER_OPTIONS: Array<{
  id: MapStoryCategory;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "testimony", label: "Testimonies" },
  { id: "praise", label: "Praise" },
  { id: "prayer", label: "Prayer" },
  { id: "healing", label: "Healing" },
  { id: "freedom", label: "Freedom" },
  { id: "restoration", label: "Restoration" },
  { id: "answered", label: "Answered Prayer" },
];

export function resolveMapStoryCategory(
  storyType: string | null | undefined,
  prayerStatus: string | null | undefined
): MapStoryCategory {
  if (prayerStatus === "answered") return "answered";

  const normalized = (storyType ?? "").toLowerCase();

  if (normalized.includes("prayer")) return "prayer";
  if (normalized.includes("praise")) return "praise";
  if (normalized.includes("healing")) return "healing";
  if (normalized.includes("freedom")) return "freedom";
  if (normalized.includes("restoration")) return "restoration";
  if (normalized.includes("testimony") || normalized.includes("video testimony")) {
    return "testimony";
  }

  return "testimony";
}

export function getCategoryLabel(category: MapStoryCategory): string {
  return (
    MAP_FILTER_OPTIONS.find((option) => option.id === category)?.label ??
    "Story"
  );
}

export function getCategoryMarkerClass(category: MapStoryCategory): string {
  switch (category) {
    case "praise":
      return "htbf-map-marker--praise";
    case "prayer":
      return "htbf-map-marker--prayer";
    case "healing":
      return "htbf-map-marker--healing";
    case "freedom":
      return "htbf-map-marker--freedom";
    case "restoration":
      return "htbf-map-marker--restoration";
    case "answered":
      return "htbf-map-marker--answered";
    case "testimony":
    default:
      return "htbf-map-marker--testimony";
  }
}
