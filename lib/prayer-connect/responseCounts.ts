import { supabase } from "../supabaseClient";
import {
  applyGenuinePublicDemoFilter,
  filterGenuinePublicDemoRows,
  getDemoContentSchemaCapabilities,
  type DemoContentSchemaCapabilities,
} from "../demo-content/eligibility";

async function countApprovedVideoResponses(
  storyIds: string[],
  demoCapabilities: DemoContentSchemaCapabilities
) {
  let query = supabase
    .from("prayer_video_responses")
    .select("story_id, is_demo")
    .in("story_id", storyIds)
    .eq("status", "approved")
    .is("removed_at", null);

  query = applyGenuinePublicDemoFilter(
    query,
    "prayer_video_responses",
    demoCapabilities
  );

  const withRemovedFilter = await query;

  if (!withRemovedFilter.error) {
    return withRemovedFilter;
  }

  if (/removed_at/i.test(withRemovedFilter.error.message)) {
    let fallbackQuery = supabase
      .from("prayer_video_responses")
      .select("story_id, is_demo")
      .in("story_id", storyIds)
      .eq("status", "approved");

    fallbackQuery = applyGenuinePublicDemoFilter(
      fallbackQuery,
      "prayer_video_responses",
      demoCapabilities
    );

    return fallbackQuery;
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

  const demoCapabilities = await getDemoContentSchemaCapabilities();
  const videoResult = await countApprovedVideoResponses(
    storyIds,
    demoCapabilities
  );

  if (videoResult.error) {
    console.error("Could not load video response counts:", videoResult.error);
  } else {
    filterGenuinePublicDemoRows(
      ((videoResult.data as { story_id: string | null; is_demo?: boolean | null }[]) ??
        []) as Array<{ story_id: string | null; is_demo?: boolean | null }>
    ).forEach((row) => {
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
