const GENERIC_FAILURE =
  "Could not mark this prayer answered. Please try again or refresh the feed.";

const MESSAGE_MAP: Record<string, string> = {
  "authentication required": "Please sign in to mark a prayer request answered.",
  "answered text must be between 1 and 2000 characters":
    "Please add a short answered prayer update (up to 2000 characters).",
  "could not mark this prayer answered":
    "Could not mark this prayer answered. It may no longer be eligible.",
  "prayer answered fields must be updated through mark_my_prayer_answered()":
    GENERIC_FAILURE,
};

export function mapMarkPrayerAnsweredClientError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return GENERIC_FAILURE;
  }

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";

  if (!message) {
    return GENERIC_FAILURE;
  }

  const normalized = message.toLowerCase();

  for (const [needle, friendly] of Object.entries(MESSAGE_MAP)) {
    if (normalized.includes(needle.toLowerCase())) {
      return friendly;
    }
  }

  if (
    /policy|rls|permission|42501|p0002|22023|sql|postgres|trigger|function/i.test(
      message
    )
  ) {
    return GENERIC_FAILURE;
  }

  return GENERIC_FAILURE;
}
