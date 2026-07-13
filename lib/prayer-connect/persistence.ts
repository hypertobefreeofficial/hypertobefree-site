import { supabase } from "../supabaseClient";

export async function loadSavedStoryIds(userId: string) {
  const { data, error } = await supabase
    .from("saved_content")
    .select("story_id")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  return ((data as { story_id: string | null }[]) ?? [])
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

  const { error } = await supabase.from("saved_content").insert({
    user_id: userId,
    story_id: storyId,
  });
  if (error) throw new Error(error.message);
  return true;
}

export async function loadFollowedPrayerIds(userId: string) {
  const { data, error } = await supabase
    .from("prayer_follows")
    .select("story_id")
    .eq("user_id", userId);

  if (error) {
    // Table may not exist until migration is applied.
    if (/relation|does not exist|could not find/i.test(error.message)) {
      return { ids: [] as string[], available: false as const };
    }
    throw new Error(error.message);
  }

  return {
    ids: ((data as { story_id: string | null }[]) ?? [])
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

  const { data, error } = await supabase
    .from("story_reactions")
    .select("story_id, reaction_type")
    .eq("user_id", userId)
    .in("story_id", storyIds);

  if (error) throw new Error(error.message);

  const map = new Map<string, Set<string>>();
  ((data as { story_id: string | null; reaction_type: string | null }[]) ?? []).forEach(
    (row) => {
      if (!row.story_id || !row.reaction_type) return;
      const set = map.get(row.story_id) ?? new Set<string>();
      set.add(row.reaction_type);
      map.set(row.story_id, set);
    }
  );
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
  const { data, error } = await supabase
    .from("prayer_written_responses")
    .select("id, body, author_user_id, created_at, status")
    .eq("story_id", storyId)
    .eq("status", "visible")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    if (/relation|does not exist|could not find/i.test(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data as {
    id: string;
    body: string;
    author_user_id: string;
    created_at: string;
    status: string;
  }[]) ?? [];
}
