import { isPrayerStory } from "./eligibility";

export const MARK_PRAYER_ANSWERED_TEXT_MAX_LENGTH = 2000;

export type MarkPrayerAnsweredStoryRow = {
  id: string;
  user_id: string | null;
  story_type: string | null;
  status: string | null;
  prayer_status: string | null;
  removed_at: string | null;
};

export type MarkPrayerAnsweredErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_text"
  | "not_prayer"
  | "not_eligible"
  | "already_answered";

export type MarkPrayerAnsweredValidationResult =
  | { ok: true; cleanAnsweredText: string }
  | {
      ok: false;
      code: MarkPrayerAnsweredErrorCode;
      message: string;
    };

export function validateMarkPrayerAnsweredRequest(
  authUserId: string | null | undefined,
  answeredText: string,
  story: MarkPrayerAnsweredStoryRow | null | undefined
): MarkPrayerAnsweredValidationResult {
  if (!authUserId) {
    return {
      ok: false,
      code: "unauthorized",
      message: "Please sign in to mark a prayer request answered.",
    };
  }

  if (!story) {
    return {
      ok: false,
      code: "not_found",
      message: "Could not find this prayer request.",
    };
  }

  if (story.user_id !== authUserId) {
    return {
      ok: false,
      code: "forbidden",
      message:
        "Only the person who shared this prayer request can mark it answered.",
    };
  }

  if (!isPrayerStory(story)) {
    return {
      ok: false,
      code: "not_prayer",
      message: "Only prayer requests can be marked answered.",
    };
  }

  if ((story.status || "").toLowerCase() !== "approved") {
    return {
      ok: false,
      code: "not_eligible",
      message: "This prayer request is not eligible to be marked answered.",
    };
  }

  if (story.removed_at) {
    return {
      ok: false,
      code: "not_eligible",
      message: "Removed prayer requests cannot be marked answered.",
    };
  }

  if (story.prayer_status === "answered") {
    return {
      ok: false,
      code: "already_answered",
      message: "This prayer request is already marked answered.",
    };
  }

  if ((story.prayer_status || "active") !== "active") {
    return {
      ok: false,
      code: "not_eligible",
      message: "This prayer request is not eligible to be marked answered.",
    };
  }

  const cleanAnsweredText = answeredText.trim();

  if (!cleanAnsweredText) {
    return {
      ok: false,
      code: "invalid_text",
      message:
        "Please add a short answered prayer update before marking this answered.",
    };
  }

  if (cleanAnsweredText.length > MARK_PRAYER_ANSWERED_TEXT_MAX_LENGTH) {
    return {
      ok: false,
      code: "invalid_text",
      message: `Answered prayer updates must be ${MARK_PRAYER_ANSWERED_TEXT_MAX_LENGTH} characters or fewer.`,
    };
  }

  return { ok: true, cleanAnsweredText };
}
