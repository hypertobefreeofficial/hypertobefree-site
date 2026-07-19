import { isSupabaseConfigured, supabase } from "../supabaseClient";
import {
  applyGenuinePublicDemoFilter,
  filterGenuinePublicDemoRows,
  getDemoContentSchemaCapabilities,
} from "../demo-content/eligibility";
import { resolveMapStoryCategory } from "./categories";
import { geocodePublicLocation } from "./geocodeLocation";
import type { MapStoryRecord } from "./types";

type RawStoryRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  image_url: string | null;
  video_url: string | null;
  status: string | null;
  prayer_status: string | null;
  created_at: string | null;
  is_demo?: boolean | null;
};

type ProfileRow = {
  id: string;
  show_location: boolean | null;
};

type ReactionRow = {
  story_id: string | null;
  reaction_type: string | null;
  is_demo?: boolean | null;
};

export type LoadMapStoriesResult =
  | { ok: true; stories: MapStoryRecord[] }
  | { ok: false; reason: "not-configured" | "offline" | "error"; message: string };

export async function loadMapStories(): Promise<LoadMapStoriesResult> {
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      reason: "not-configured",
      message:
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.",
    };
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return {
      ok: false,
      reason: "offline",
      message: "You appear to be offline. Reconnect to load the testimony map.",
    };
  }

  try {
    const demoCapabilities = await getDemoContentSchemaCapabilities();

    let storyQuery = supabase
      .from("stories")
      .select(
        "id, user_id, name, location, story_type, story_text, image_url, video_url, status, prayer_status, created_at, is_demo"
      )
      .eq("status", "approved")
      .not("location", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);

    storyQuery = applyGenuinePublicDemoFilter(
      storyQuery,
      "stories",
      demoCapabilities
    );

    const { data, error } = await storyQuery;

    if (error || !data) {
      return {
        ok: false,
        reason: "error",
        message: error?.message ?? "Could not load testimony map stories.",
      };
    }

    const rawStories = filterGenuinePublicDemoRows(
      (data as RawStoryRow[]) ?? []
    );
    const userIds = [
      ...new Set(
        rawStories
          .map((story) => story.user_id)
          .filter((value): value is string => Boolean(value))
      ),
    ];

    const profileVisibility = new Map<string, boolean>();

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, show_location")
        .in("id", userIds);

      ((profiles as ProfileRow[]) ?? []).forEach((profile) => {
        profileVisibility.set(profile.id, profile.show_location !== false);
      });
    }

    const storyIds = rawStories.map((story) => story.id);
    const reactionMap = new Map<
      string,
      { amen: number; praiseGod: number; encouraged: number; praying: number }
    >();

    if (storyIds.length > 0) {
      let reactionQuery = supabase
        .from("story_reactions")
        .select("story_id, reaction_type, is_demo")
        .in("story_id", storyIds);

      reactionQuery = applyGenuinePublicDemoFilter(
        reactionQuery,
        "story_reactions",
        demoCapabilities
      );

      const { data: reactions } = await reactionQuery;

      filterGenuinePublicDemoRows(
        ((reactions as ReactionRow[]) ?? []) as ReactionRow[]
      ).forEach((reaction) => {
        if (!reaction.story_id) return;

        const current = reactionMap.get(reaction.story_id) ?? {
          amen: 0,
          praiseGod: 0,
          encouraged: 0,
          praying: 0,
        };

        if (reaction.reaction_type === "amen") current.amen += 1;
        if (reaction.reaction_type === "praise_god") current.praiseGod += 1;
        if (reaction.reaction_type === "encouraged") current.encouraged += 1;
        if (reaction.reaction_type === "praying") current.praying += 1;

        reactionMap.set(reaction.story_id, current);
      });
    }

    const stories: MapStoryRecord[] = [];

    rawStories.forEach((story) => {
      if (!story.location?.trim()) return;

      if (story.user_id && profileVisibility.get(story.user_id) === false) {
        return;
      }

      const geocoded = geocodePublicLocation(story.location, story.id);
      if (!geocoded) return;

      stories.push({
        id: story.id,
        userId: story.user_id,
        name: story.name,
        locationLabel: geocoded.label,
        storyType: story.story_type,
        storyText: story.story_text,
        imageUrl: story.image_url,
        videoUrl: story.video_url,
        prayerStatus: story.prayer_status,
        createdAt: story.created_at,
        category: resolveMapStoryCategory(
          story.story_type,
          story.prayer_status
        ),
        lat: geocoded.lat,
        lng: geocoded.lng,
        reactionSummary: reactionMap.get(story.id),
      });
    });

    return { ok: true, stories };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load testimony map stories.";

    return {
      ok: false,
      reason: "error",
      message,
    };
  }
}
