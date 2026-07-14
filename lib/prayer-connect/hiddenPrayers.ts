import { supabase } from "../supabaseClient";

/** Temporary read-through cache only — never authoritative. */
const CACHE_PREFIX = "htbf-prayer-hidden-cache-";
/** Legacy localStorage key from the pre-server hide implementation. */
const LEGACY_PREFIX = "htbf-prayer-hidden-";

function cacheKey(userId: string) {
  return `${CACHE_PREFIX}${userId}`;
}

function readCache(userId: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(cacheKey(userId), JSON.stringify(ids));
  } catch {
    // Quota / privacy-mode — cache is optional.
  }
}

function readLegacyLocal(userId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`${LEGACY_PREFIX}${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function clearLegacyLocal(userId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${LEGACY_PREFIX}${userId}`);
    window.localStorage.removeItem(`${LEGACY_PREFIX}guest`);
  } catch {
    // ignore
  }
}

export type HiddenPrayersLoadResult = {
  ids: string[];
  /** False when the table has not been migrated yet. */
  available: boolean;
};

/** Load hidden prayer IDs for the signed-in user (server is source of truth). */
export async function loadHiddenPrayerIds(
  userId: string
): Promise<HiddenPrayersLoadResult> {
  const { data, error } = await supabase
    .from("prayer_hidden_stories")
    .select("story_id")
    .eq("user_id", userId);

  if (error) {
    if (/relation|does not exist|could not find/i.test(error.message)) {
      const legacy = readLegacyLocal(userId);
      return { ids: legacy, available: false };
    }
    throw new Error(error.message);
  }

  const ids = ((data as { story_id: string | null }[]) ?? [])
    .map((row) => row.story_id)
    .filter((id): id is string => Boolean(id));

  writeCache(userId, ids);
  return { ids, available: true };
}

/**
 * One-time migration of legacy localStorage hides into the server table.
 * Safe to call on every sign-in; no-ops when nothing to migrate.
 */
export async function migrateLegacyHiddenPrayers(userId: string): Promise<void> {
  const legacy = readLegacyLocal(userId);
  if (legacy.length === 0) return;

  const rows = legacy.map((storyId) => ({
    user_id: userId,
    story_id: storyId,
  }));

  const { error } = await supabase
    .from("prayer_hidden_stories")
    .upsert(rows, { onConflict: "user_id,story_id", ignoreDuplicates: true });

  if (error) {
    if (/relation|does not exist|could not find/i.test(error.message)) return;
    throw new Error(error.message);
  }

  clearLegacyLocal(userId);
}

/** Instant cache read while the server fetch is in flight. */
export function readHiddenPrayerCache(userId: string): string[] {
  return readCache(userId) ?? [];
}

export async function hidePrayer(
  userId: string,
  storyId: string
): Promise<string[]> {
  const { error } = await supabase.from("prayer_hidden_stories").insert({
    user_id: userId,
    story_id: storyId,
  });

  if (error) {
    // Duplicate hide is idempotent.
    if (error.code === "23505") {
      const current = await loadHiddenPrayerIds(userId);
      return current.ids;
    }
    throw new Error(error.message);
  }

  const cached = readCache(userId) ?? [];
  const next = cached.includes(storyId) ? cached : [...cached, storyId];
  writeCache(userId, next);
  return next;
}

export async function unhidePrayer(
  userId: string,
  storyId: string
): Promise<string[]> {
  const { error } = await supabase
    .from("prayer_hidden_stories")
    .delete()
    .eq("user_id", userId)
    .eq("story_id", storyId);

  if (error) throw new Error(error.message);

  const next = (readCache(userId) ?? []).filter((id) => id !== storyId);
  writeCache(userId, next);
  return next;
}
