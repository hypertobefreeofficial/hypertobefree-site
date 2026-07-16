import { createClient } from "@supabase/supabase-js";
import { FIXTURE_MARKER, getPrayerAuthEnv } from "../prayer/env";
import {
  getUserIdFromToken,
  ownerStatePath,
  readAccessTokenFromStorageState,
} from "../prayer/auth-helpers";

export const FEED_FIXTURE_MARKER = `${FIXTURE_MARKER}-FEED`;

export type FeedFixture = {
  storyId: string;
  ownerUserId: string;
  title: string;
};

export async function ensureOwnerFeedFixture(): Promise<FeedFixture | null> {
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
    .like("story_text", `%${FEED_FIXTURE_MARKER}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return {
      storyId: existing.id,
      ownerUserId,
      title: existing.story_text?.slice(0, 80) ?? FEED_FIXTURE_MARKER,
    };
  }

  const storyText = `${FEED_FIXTURE_MARKER} Automated feed fixture for authenticated response verification.`;

  const payload: Record<string, unknown> = {
    user_id: ownerUserId,
    name: "Playwright Owner",
    location: "Phoenix, Arizona",
    story_type: "Testimony",
    story_text: storyText,
    status: "approved",
  };

  const { data, error } = await client
    .from("stories")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data?.id) return null;

  return {
    storyId: data.id,
    ownerUserId,
    title: storyText.slice(0, 80),
  };
}

export async function cleanupFeedPublicVideoResponses(options: {
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

export async function cleanupFeedPrivateMessages(options: {
  storyId: string;
  senderUserId: string;
  recipientUserId: string;
}) {
  const env = getPrayerAuthEnv();
  if (!env.serviceRoleKey || !env.supabaseUrl) return;

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await admin
    .from("story_video_replies")
    .delete()
    .eq("story_id", options.storyId)
    .eq("user_id", options.senderUserId)
    .eq("recipient_user_id", options.recipientUserId);
}

export async function cleanupFeedPrivateInbox(options: {
  storyId: string;
  ownerUserId: string;
  responderUserId: string;
}) {
  const env = getPrayerAuthEnv();
  if (!env.serviceRoleKey || !env.supabaseUrl) return;

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await admin
    .from("inbox_messages")
    .delete()
    .eq("story_id", options.storyId)
    .in("user_id", [options.ownerUserId, options.responderUserId]);
}

export async function resetFeedFixtureState(options: {
  fixture: FeedFixture;
  responderUserId: string;
}) {
  const env = getPrayerAuthEnv();
  if (!env.serviceRoleKey || !env.supabaseUrl) return;

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await admin
    .from("blocked_users")
    .delete()
    .or(
      `and(blocker_user_id.eq.${options.fixture.ownerUserId},blocked_user_id.eq.${options.responderUserId}),and(blocker_user_id.eq.${options.responderUserId},blocked_user_id.eq.${options.fixture.ownerUserId})`
    );

  await cleanupFeedPublicVideoResponses({
    storyId: options.fixture.storyId,
    responderUserId: options.responderUserId,
  });
  await cleanupFeedPrivateMessages({
    storyId: options.fixture.storyId,
    senderUserId: options.responderUserId,
    recipientUserId: options.fixture.ownerUserId,
  });
  await cleanupFeedPrivateInbox({
    storyId: options.fixture.storyId,
    ownerUserId: options.fixture.ownerUserId,
    responderUserId: options.responderUserId,
  });
}
