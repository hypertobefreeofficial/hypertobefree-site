import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import { getPrayerAuthEnv } from "../prayer/env";
import { ensureMediaFixtures } from "../prayer/media-fixtures";

export async function uploadValidTestVideoForUser(
  userId: string,
  accessToken: string
) {
  const env = getPrayerAuthEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;

  const media = ensureMediaFixtures();
  if (!media.validVideo) return null;

  const client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const storagePath = `${userId}/playwright-feed-valid-${Date.now()}.mp4`;
  const fileBuffer = fs.readFileSync(media.validVideo);

  const { error } = await client.storage
    .from("story-videos")
    .upload(storagePath, fileBuffer, {
      contentType: "video/mp4",
      upsert: false,
    });

  if (error) return null;

  const { data } = client.storage.from("story-videos").getPublicUrl(storagePath);

  return {
    storagePath,
    publicUrl: data.publicUrl,
  };
}

export async function countPublicVideoResponses(storyId: string) {
  const env = getPrayerAuthEnv();
  if (!env.supabaseUrl || !env.serviceRoleKey) return null;

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { count } = await admin
    .from("prayer_video_responses")
    .select("id", { count: "exact", head: true })
    .eq("story_id", storyId)
    .neq("status", "removed")
    .is("removed_at", null);

  return count ?? 0;
}

export async function countInboxMessagesForStory(storyId: string) {
  const env = getPrayerAuthEnv();
  if (!env.supabaseUrl || !env.serviceRoleKey) return null;

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { count } = await admin
    .from("inbox_messages")
    .select("id", { count: "exact", head: true })
    .eq("story_id", storyId);

  return count ?? 0;
}
