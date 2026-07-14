import { supabase } from "../supabaseClient";

async function countApprovedVideoResponses(storyIds: string[]) {
  const withRemovedFilter = await supabase
    .from("prayer_video_responses")
    .select("story_id")
    .in("story_id", storyIds)
    .eq("status", "approved")
    .is("removed_at", null);

  if (!withRemovedFilter.error) {
    return withRemovedFilter;
  }

  if (/removed_at/i.test(withRemovedFilter.error.message)) {
    return supabase
      .from("prayer_video_responses")
      .select("story_id")
      .in("story_id", storyIds)
      .eq("status", "approved");
  }

  return withRemovedFilter;
}

// Public prayer responses are video-only. Legacy written responses remain in
// the `prayer_written_responses` table but are intentionally NOT counted or
// rendered in the public Prayer experience.
export async function loadPublicResponseCounts(storyIds: string[]) {
  const counts = new Map<string, number>();
  if (storyIds.length === 0) return counts;

  storyIds.forEach((id) => counts.set(id, 0));

  const videoResult = await countApprovedVideoResponses(storyIds);

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
