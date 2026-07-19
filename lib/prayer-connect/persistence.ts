import { supabase } from "../supabaseClient";
import {
  applyGenuinePublicDemoFilter,
  filterGenuinePublicDemoRows,
  getDemoContentSchemaCapabilities,
} from "../demo-content/eligibility";

export async function loadSavedStoryIds(userId: string) {
  const demoCapabilities = await getDemoContentSchemaCapabilities();
  let query = supabase
    .from("saved_content")
    .select("story_id, is_demo")
    .eq("user_id", userId);

  query = applyGenuinePublicDemoFilter(query, "saved_content", demoCapabilities);

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return filterGenuinePublicDemoRows(
    ((data as { story_id: string | null; is_demo?: boolean | null }[]) ?? []) as Array<{
      story_id: string | null;
      is_demo?: boolean | null;
    }>
  )
    .map((row) => row.story_id)
    .filter((id): id is string => Boolean(id));
}

export async function toggleSavedStory(userId: string, storyId: string, currentlySaved: boolean) {
  if (currentlySaved) {
    const { error } = await supabase
      .from("saved_content")
      .delete()
      .eq("user_id", userId)
      .eq("story_id", storyId);
    if (error) throw new Error(error.message);
    return false;
  }

  const demoCapabilities = await getDemoContentSchemaCapabilities();
  if (demoCapabilities.genuinePublicIsolationActive) {
    const { data: storyData, error: storyError } = await applyGenuinePublicDemoFilter(
      supabase.from("stories").select("id, is_demo").eq("id", storyId),
      "stories",
      demoCapabilities
    ).maybeSingle();

    if (storyError) {
      throw new Error(storyError.message);
    }

    if (!storyData) {
      throw new Error("This story is not available to save.");
    }
  }

  const { error } = await supabase.from("saved_content").insert({
    user_id: userId,
    story_id: storyId,
  });
  if (error) throw new Error(error.message);
  return true;
}

export async function loadFollowedPrayerIds(userId: string) {
  const demoCapabilities = await getDemoContentSchemaCapabilities();
  let query = supabase
    .from("prayer_follows")
    .select("story_id, is_demo")
    .eq("user_id", userId);

  query = applyGenuinePublicDemoFilter(query, "prayer_follows", demoCapabilities);

  const { data, error } = await query;

  if (error) {
    if (/relation|does not exist|could not find/i.test(error.message)) {
      return { ids: [] as string[], available: false as const };
    }
    throw new Error(error.message);
  }

  return {
    ids: filterGenuinePublicDemoRows(
      ((data as { story_id: string | null; is_demo?: boolean | null }[]) ?? []) as Array<{
        story_id: string | null;
        is_demo?: boolean | null;
      }>
    )
      .map((row) => row.story_id)
      .filter((id): id is string => Boolean(id)),
    available: true as const,
  };
}

export async function toggleFollowedPrayer(
  userId: string,
  storyId: string,
  currentlyFollowing: boolean
) {
  if (currentlyFollowing) {
    const { error } = await supabase
      .from("prayer_follows")
      .delete()
      .eq("user_id", userId)
      .eq("story_id", storyId);
    if (error) throw new Error(error.message);
    return false;
  }

  const demoCapabilities = await getDemoContentSchemaCapabilities();
  if (demoCapabilities.genuinePublicIsolationActive) {
    const { data: storyData, error: storyError } = await applyGenuinePublicDemoFilter(
      supabase.from("stories").select("id, is_demo").eq("id", storyId),
      "stories",
      demoCapabilities
    ).maybeSingle();

    if (storyError) {
      throw new Error(storyError.message);
    }

    if (!storyData) {
      throw new Error("This prayer is not available to follow.");
    }
  }

  const { error } = await supabase.from("prayer_follows").insert({
    user_id: userId,
    story_id: storyId,
  });
  if (error) throw new Error(error.message);
  return true;
}

export async function loadUserPrayerReactions(userId: string, storyIds: string[]) {
  if (storyIds.length === 0) {
    return new Map<string, Set<string>>();
  }

  const demoCapabilities = await getDemoContentSchemaCapabilities();
  let query = supabase
    .from("story_reactions")
    .select("story_id, reaction_type, is_demo")
    .eq("user_id", userId)
    .in("story_id", storyIds);

  query = applyGenuinePublicDemoFilter(query, "story_reactions", demoCapabilities);

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  const map = new Map<string, Set<string>>();
  filterGenuinePublicDemoRows(
    ((data as {
      story_id: string | null;
      reaction_type: string | null;
      is_demo?: boolean | null;
    }[]) ?? []) as Array<{
      story_id: string | null;
      reaction_type: string | null;
      is_demo?: boolean | null;
    }>
  ).forEach((row) => {
    if (!row.story_id || !row.reaction_type) return;
    const set = map.get(row.story_id) ?? new Set<string>();
    set.add(row.reaction_type);
    map.set(row.story_id, set);
  });

  return map;
}

export async function submitWrittenPrayer(options: {
  userId: string;
  storyId: string;
  body: string;
}) {
  const clean = options.body.trim().slice(0, 2000);
  if (!clean) throw new Error("Please write a short prayer.");

  const { error } = await supabase.from("prayer_written_responses").insert({
    story_id: options.storyId,
    author_user_id: options.userId,
    body: clean,
  });

  if (error) {
    if (/relation|does not exist|could not find/i.test(error.message)) {
      throw new Error(
        "Written prayers are not available yet. Please apply the Prayer migration, or use Encourage for now."
      );
    }
    throw new Error(error.message);
  }
}

export async function loadWrittenPrayers(storyId: string) {
  const demoCapabilities = await getDemoContentSchemaCapabilities();
  let query = supabase
    .from("prayer_written_responses")
    .select("id, body, author_user_id, created_at, status, is_demo")
    .eq("story_id", storyId)
    .eq("status", "visible")
    .order("created_at", { ascending: false })
    .limit(20);

  query = applyGenuinePublicDemoFilter(
    query,
    "prayer_written_responses",
    demoCapabilities
  );

  const { data, error } = await query;

  if (error) {
    if (/relation|does not exist|could not find/i.test(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }

  return filterGenuinePublicDemoRows(
    ((data as {
      id: string;
      body: string;
      author_user_id: string;
      created_at: string;
      status: string;
      is_demo?: boolean | null;
    }[]) ?? []) as Array<{
      id: string;
      body: string;
      author_user_id: string;
      created_at: string;
      status: string;
      is_demo?: boolean | null;
    }>
  );
}
