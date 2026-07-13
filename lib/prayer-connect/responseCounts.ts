import { supabase } from "../supabaseClient";

// Public prayer responses are video-only. Legacy written responses remain in
// the `prayer_written_responses` table but are intentionally NOT counted or
// rendered in the public Prayer experience.
export async function loadPublicResponseCounts(storyIds: string[]) {
  const counts = new Map<string, number>();
  if (storyIds.length === 0) return counts;

  storyIds.forEach((id) => counts.set(id, 0));

  const videoResult = await supabase
    .from("prayer_video_responses")
    .select("story_id")
    .in("story_id", storyIds)
    .eq("status", "approved");

  if (videoResult.error) {
    console.error("Could not load video response counts:", videoResult.error);
  } else {
    ((videoResult.data as { story_id: string | null }[]) ?? []).forEach((row) => {
      if (!row.story_id) return;
      counts.set(row.story_id, (counts.get(row.story_id) ?? 0) + 1);
    });
  }

  return counts;
}

export function formatResponseCount(count: number | null | undefined) {
  const value = count ?? 0;
  return `${value} video prayer${value === 1 ? "" : "s"}`;
}

export function formatVideoPrayerCount(count: number | null | undefined) {
  return formatResponseCount(count);
}
