import type { SupabaseClient } from "@supabase/supabase-js";
import { mapMarkPrayerAnsweredClientError } from "../community-feed/mapMarkPrayerAnsweredClientError";
import {
  validateMarkPrayerAnsweredRequest,
  type MarkPrayerAnsweredStoryRow,
} from "../community-feed/markPrayerAnsweredAuthorization";

export type MarkedAnsweredStory = {
  id: string;
  user_id: string | null;
  story_type: string | null;
  status: string | null;
  prayer_status: string | null;
  answered_at: string | null;
  answered_text: string | null;
};

export type MarkMyPrayerAnsweredInput = {
  supabase: SupabaseClient;
  storyId: string;
  answeredText: string;
  authUserId: string | null;
  storyForValidation?: MarkPrayerAnsweredStoryRow | null;
};

export type MarkMyPrayerAnsweredResult =
  | { ok: true; story: MarkedAnsweredStory }
  | { ok: false; message: string };

function parseMarkedAnsweredStory(value: unknown): MarkedAnsweredStory | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;

  const record = row as Record<string, unknown>;
  if (typeof record.id !== "string") return null;

  return {
    id: record.id,
    user_id: typeof record.user_id === "string" ? record.user_id : null,
    story_type:
      typeof record.story_type === "string" ? record.story_type : null,
    status: typeof record.status === "string" ? record.status : null,
    prayer_status:
      typeof record.prayer_status === "string" ? record.prayer_status : null,
    answered_at:
      typeof record.answered_at === "string" ? record.answered_at : null,
    answered_text:
      typeof record.answered_text === "string" ? record.answered_text : null,
  };
}

export async function markMyPrayerAnswered({
  supabase,
  storyId,
  answeredText,
  authUserId,
  storyForValidation,
}: MarkMyPrayerAnsweredInput): Promise<MarkMyPrayerAnsweredResult> {
  const validation = validateMarkPrayerAnsweredRequest(
    authUserId,
    answeredText,
    storyForValidation ?? null
  );

  if (validation.ok === false) {
    return { ok: false, message: validation.message };
  }

  const { data, error } = await supabase.rpc("mark_my_prayer_answered", {
    p_story_id: storyId,
    p_answered_text: validation.cleanAnsweredText,
  });

  if (error) {
    return { ok: false, message: mapMarkPrayerAnsweredClientError(error) };
  }

  const story = parseMarkedAnsweredStory(data);
  if (
    !story ||
    story.prayer_status !== "answered" ||
    !story.answered_at ||
    !story.answered_text
  ) {
    return {
      ok: false,
      message:
        "Could not mark this prayer answered. Please try again or refresh.",
    };
  }

  return { ok: true, story };
}
