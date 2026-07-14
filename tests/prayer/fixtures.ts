import { createClient } from "@supabase/supabase-js";
import { buildInteractionTopics } from "../../lib/prayer-connect/interactionPrefs";
import { FIXTURE_MARKER, getPrayerAuthEnv } from "./env";
import { getUserIdFromToken, ownerStatePath, readAccessTokenFromStorageState } from "./auth-helpers";

export type PrayerFixture = {
  storyId: string;
  ownerUserId: string;
  title: string;
};

export async function ensureOwnerPrayerFixture(): Promise<PrayerFixture | null> {
  const env = getPrayerAuthEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;

  const token = readAccessTokenFromStorageState(ownerStatePath());
  if (!token) return null;

  const ownerUserId = await getUserIdFromToken(token);
  if (!ownerUserId) return null;

  const client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing } = await client
    .from("stories")
    .select("id, story_text, user_id")
    .eq("user_id", ownerUserId)
    .eq("status", "approved")
    .like("story_text", `%${FIXTURE_MARKER}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return {
      storyId: existing.id,
      ownerUserId,
      title: existing.story_text?.slice(0, 80) ?? FIXTURE_MARKER,
    };
  }

  const topics = buildInteractionTopics({
    category: "general",
    prayerTypeLabel: "General",
    isUrgent: false,
    allowEncouragement: true,
    allowPublicWritten: true,
    allowPublicVideo: true,
    allowPrivateMessage: true,
    allowPrivateVideo: true,
    allowSharing: true,
    receiveUpdates: true,
    postAnonymous: false,
  });

  const storyText = `${FIXTURE_MARKER} Automated prayer fixture — safe to hide or report in dev. Please pray for reliable test coverage.`;

  const payload: Record<string, unknown> = {
    user_id: ownerUserId,
    name: "Playwright Owner",
    location: "Phoenix, Arizona",
    story_type: "Prayer Request",
    story_text: storyText,
    status: "approved",
    prayer_status: "active",
    topics,
  };

  let insertedId: string | null = null;
  const { data, error } = await client.from("stories").insert(payload).select("id").single();

  if (!error && data?.id) {
    insertedId = data.id;
  } else if (error && /public_lat|topics/i.test(error.message)) {
    const fallback = { ...payload };
    delete fallback.public_lat;
    delete fallback.public_lng;
    delete fallback.public_location_label;
    delete fallback.location_visibility;
    const { data: retryData, error: retryError } = await client
      .from("stories")
      .insert(fallback)
      .select("id")
      .single();
    if (!retryError && retryData?.id) insertedId = retryData.id;
  }

  if (!insertedId) return null;

  return {
    storyId: insertedId,
    ownerUserId,
    title: storyText.slice(0, 80),
  };
}

export async function cleanupFixtureResponses(options: {
  storyId: string;
  responderUserId: string;
}) {
  const env = getPrayerAuthEnv();
  if (!env.serviceRoleKey || !env.supabaseUrl) return;

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await admin
    .from("prayer_video_responses")
    .delete()
    .eq("story_id", options.storyId)
    .eq("user_id", options.responderUserId);
}

export async function setResponseDurationStatus(options: {
  responseId: string;
  status: "verified" | "failed" | "unavailable" | "pending";
  durationSeconds?: number;
}) {
  const env = getPrayerAuthEnv();
  if (!env.serviceRoleKey || !env.supabaseUrl) return false;

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await admin
    .from("prayer_video_responses")
    .update({
      duration_verification_status: options.status,
      duration_seconds: options.durationSeconds ?? null,
    })
    .eq("id", options.responseId);

  return !error;
}

export async function countApprovedVideoResponses(storyId: string): Promise<number | null> {
  const env = getPrayerAuthEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;

  const client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { count, error } = await client
    .from("prayer_video_responses")
    .select("id", { count: "exact", head: true })
    .eq("story_id", storyId)
    .eq("status", "approved")
    .is("removed_at", null);

  if (error) return null;
  return count ?? 0;
}
