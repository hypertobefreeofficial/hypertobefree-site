import { PRAYER_MEDIA_LIMITS } from "../server/prayerMediaValidation";

export type DurationVerificationStatus =
  | "pending"
  | "verified"
  | "failed"
  | "unavailable";

export const DURATION_PROBE_DOCUMENTATION = `
Trusted video duration validation requires a post-upload worker that probes
storage objects with ffprobe (or equivalent) without proxying full files through
Vercel. Recommended architecture:

1. Client uploads directly to Supabase Storage (story-videos bucket).
2. Storage webhook or queue triggers an Edge Function / Cloudflare Worker.
3. Worker streams object headers, runs ffprobe, writes duration_seconds and
   duration_verification_status ('verified' | 'failed') on prayer_video_responses.
4. Only rows with duration_verification_status = 'verified' may auto-publish.
5. Rows with 'unavailable' remain submitted for manual moderator review.
6. Rows with 'failed' must never become publicly approved.
`.trim();

export const MANUAL_DURATION_ACK_COPY =
  "Trusted duration has not been verified. Confirm that you reviewed this video before approving it.";

export function canPublishPublicVideoResponse(
  response: {
    duration_verification_status?: string | null;
    duration_seconds?: number | null;
  },
  options?: { acknowledgeUnverifiedDuration?: boolean }
): { allowed: boolean; reason: string | null; code: string; requiresManualAck?: boolean } {
  const status = response.duration_verification_status ?? "unavailable";
  const durationSeconds =
    typeof response.duration_seconds === "number" ? response.duration_seconds : null;

  if (status === "failed") {
    return {
      allowed: false,
      reason:
        "Duration verification failed. This response exceeds the allowed limit and cannot be published.",
      code: "duration_verification_failed",
    };
  }

  if (
    status === "verified" &&
    durationSeconds !== null &&
    durationSeconds > PRAYER_MEDIA_LIMITS.publicResponseVideoSeconds
  ) {
    return {
      allowed: false,
      reason:
        "Verified duration exceeds the allowed limit. This response cannot be published.",
      code: "duration_verification_failed",
    };
  }

  if (status === "unavailable" && options?.acknowledgeUnverifiedDuration !== true) {
    return {
      allowed: false,
      reason: MANUAL_DURATION_ACK_COPY,
      code: "duration_ack_required",
      requiresManualAck: true,
    };
  }

  return { allowed: true, reason: null, code: "ok" };
}

/** @deprecated Use canPublishPublicVideoResponse */
export function canPublishPrayerVideoResponse(response: {
  duration_verification_status?: string | null;
  duration_seconds?: number | null;
}): { allowed: boolean; reason: string | null; code: string } {
  return canPublishPublicVideoResponse(response, {
    acknowledgeUnverifiedDuration: true,
  });
}

export function moderatorDurationNotice(
  status: string | null | undefined
): string | null {
  switch (status ?? "unavailable") {
    case "unavailable":
      return "Trusted duration has not been verified by the media probe. Review the video manually before approving.";
    case "pending":
      return "Duration verification is still pending. Wait for the probe or review manually.";
    case "failed":
      return "Duration verification failed — this response must not be approved.";
    case "verified":
      return null;
    default:
      return "Duration verification state is unknown. Review manually before approving.";
  }
}
