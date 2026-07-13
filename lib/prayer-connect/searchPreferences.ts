import { supabase } from "../supabaseClient";
import type {
  PrayerConnectCategoryFilter,
  PrayerConnectRadiusMiles,
  PrayerConnectSearchCenter,
  PrayerConnectSearchMode,
  PrayerConnectSort,
} from "./types";

export type PrayerMobileView = "requests" | "map";

export type PrayerSearchPreferences = {
  version: 1;
  configured: boolean;
  searchMode: PrayerConnectSearchMode;
  center: PrayerConnectSearchCenter | null;
  radius: PrayerConnectRadiusMiles;
  category: PrayerConnectCategoryFilter;
  sort: PrayerConnectSort;
  mediaFilter: "all" | "video" | "photo" | "text";
  mobileView: PrayerMobileView;
  placeQuery: string;
};

const STORAGE_KEY = "htbf-prayer-search-v1";

export const DEFAULT_PRAYER_SEARCH: PrayerSearchPreferences = {
  version: 1,
  configured: false,
  searchMode: "near-me",
  center: null,
  radius: 25,
  category: "all",
  sort: "needs-prayer",
  mediaFilter: "all",
  mobileView: "requests",
  placeQuery: "",
};

function isValidPrefs(value: unknown): value is PrayerSearchPreferences {
  if (!value || typeof value !== "object") return false;
  const record = value as PrayerSearchPreferences;
  return record.version === 1 && typeof record.configured === "boolean";
}

export function readLocalPrayerSearch(): PrayerSearchPreferences {
  if (typeof window === "undefined") return DEFAULT_PRAYER_SEARCH;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PRAYER_SEARCH;
    const parsed = JSON.parse(raw) as unknown;
    return isValidPrefs(parsed) ? parsed : DEFAULT_PRAYER_SEARCH;
  } catch {
    return DEFAULT_PRAYER_SEARCH;
  }
}

export function writeLocalPrayerSearch(prefs: PrayerSearchPreferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function clearLocalPrayerSearch() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export async function loadPrayerSearchPreferences(userId: string | null) {
  if (!userId) {
    return { prefs: readLocalPrayerSearch(), source: "local" as const };
  }

  const { data, error } = await supabase
    .from("prayer_search_preferences")
    .select("preferences")
    .eq("user_id", userId)
    .maybeSingle();

  if (
    !error &&
    data?.preferences &&
    isValidPrefs(data.preferences as PrayerSearchPreferences)
  ) {
    return {
      prefs: data.preferences as PrayerSearchPreferences,
      source: "server" as const,
    };
  }

  if (error && !/relation|does not exist|could not find/i.test(error.message)) {
    console.error("Could not load prayer search preferences:", error);
  }

  const local = readLocalPrayerSearch();
  if (local.configured) {
    return { prefs: local, source: "local" as const };
  }

  return { prefs: DEFAULT_PRAYER_SEARCH, source: "default" as const };
}

export async function savePrayerSearchPreferences(
  userId: string | null,
  prefs: PrayerSearchPreferences
) {
  writeLocalPrayerSearch(prefs);
  if (!userId) return { ok: true as const, persisted: "local" as const };

  const { error } = await supabase.from("prayer_search_preferences").upsert(
    {
      user_id: userId,
      preferences: prefs,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    if (/relation|does not exist|could not find/i.test(error.message)) {
      return { ok: true as const, persisted: "local" as const };
    }
    console.error("Could not save prayer search preferences:", error);
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const, persisted: "server" as const };
}

export function buildSearchSummary(prefs: PrayerSearchPreferences) {
  const location =
    prefs.searchMode === "anywhere"
      ? "Anywhere in the world"
      : prefs.center?.label || "Choose a location";

  const radius =
    prefs.radius === "anywhere" ? "Any distance" : `Within ${prefs.radius} miles`;

  return { location, radius };
}
