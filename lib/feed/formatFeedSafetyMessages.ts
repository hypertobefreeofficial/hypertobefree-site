export function formatBlockedUserConfirmation(displayName: string | null | undefined) {
  const trimmed = displayName?.trim();
  if (!trimmed) {
    return "You blocked this user. Their content will no longer appear for you.";
  }

  const handle = trimmed.startsWith("@")
    ? trimmed
    : `@${trimmed.replace(/\s+/g, "")}`;

  return `You blocked ${handle}. Their content will no longer appear for you.`;
}

export const FEED_REPORT_SUCCESS_MESSAGE =
  "Your report was submitted. Thank you for helping keep HTBF safe.";

/** @deprecated Use FEED_REPORT_SUCCESS_MESSAGE for all Feed report confirmations. */
export const VIDEO_RESPONSE_REPORT_SUCCESS = FEED_REPORT_SUCCESS_MESSAGE;

export const VIDEO_RESPONSE_REPORT_REASONS = [
  { value: "harassment_bullying", label: "Harassment or bullying" },
  { value: "sexual_content", label: "Inappropriate sexual content" },
  { value: "hate_abusive", label: "Hate or abusive content" },
  { value: "threats_dangerous", label: "Threats or dangerous content" },
  { value: "spam_scam", label: "Spam or scam" },
  { value: "impersonation", label: "Impersonation" },
  { value: "privacy_concern", label: "Privacy or personal-information concern" },
  { value: "self_harm", label: "Self-harm concern" },
  { value: "other", label: "Other" },
] as const;
