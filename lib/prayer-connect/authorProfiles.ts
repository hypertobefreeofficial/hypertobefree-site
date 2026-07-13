import { supabase } from "../supabaseClient";

export type PrayerAuthorProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  isAnonymous: boolean;
};

export async function loadPrayerAuthorProfiles(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, PrayerAuthorProfile>();
  if (uniqueIds.length === 0) return map;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, username, avatar_url")
    .in("id", uniqueIds);

  if (error) {
    console.error("Could not load prayer author profiles:", error);
    return map;
  }

  ((data as {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  }[]) ?? []).forEach((profile) => {
    map.set(profile.id, {
      id: profile.id,
      displayName:
        profile.display_name?.trim() ||
        profile.username?.trim() ||
        "HTBF community member",
      avatarUrl: profile.avatar_url,
      isAnonymous: false,
    });
  });

  return map;
}

export function getAnonymousAuthorProfile(): PrayerAuthorProfile {
  return {
    id: "anonymous",
    displayName: "A fellow believer",
    avatarUrl: null,
    isAnonymous: true,
  };
}

export function resolveAuthorPresentation(
  authorUserId: string,
  profiles: Map<string, PrayerAuthorProfile>,
  options?: { forceAnonymous?: boolean }
) {
  if (options?.forceAnonymous) return getAnonymousAuthorProfile();
  return profiles.get(authorUserId) ?? {
    id: authorUserId,
    displayName: "HTBF community member",
    avatarUrl: null,
    isAnonymous: false,
  };
}
