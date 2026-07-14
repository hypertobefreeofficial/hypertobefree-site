import { getPrayerInteractionPrefs } from "./interactionPrefs";

export type PublicVideoEligibility = {
  /** The requester currently accepts at least one response method. */
  canRespond: boolean;
  /** Public video prayers are specifically permitted right now. */
  canPublicVideo: boolean;
  /** Human-readable reason used when a public response is not allowed. */
  reason: string | null;
};

const NOT_ACCEPTING_MESSAGE =
  "This prayer request is no longer accepting public responses.";

/**
 * Single authoritative eligibility calculation for public video prayers.
 *
 * This is the same calculation used by the response chooser, the upload modal,
 * and the submit API so the UI can never offer an option the server will
 * reject. It is a pure function of the request's interaction topics and prayer
 * lifecycle status.
 */
export function getPublicVideoEligibility(input: {
  topics: string[];
  prayerStatus: "active" | "answered" | "paused";
  /** Set to false when the parent story is removed / not approved. */
  requestApproved?: boolean;
}): PublicVideoEligibility {
  const prefs = getPrayerInteractionPrefs(input.topics, input.prayerStatus);
  const requestApproved = input.requestApproved ?? true;

  const canRespond =
    requestApproved &&
    prefs.acceptsNewResponses &&
    (prefs.allowPublicVideo ||
      prefs.allowPrivateMessage ||
      prefs.allowPrivateVideo);

  const canPublicVideo =
    requestApproved && prefs.acceptsNewResponses && prefs.allowPublicVideo;

  return {
    canRespond,
    canPublicVideo,
    reason: canPublicVideo ? null : NOT_ACCEPTING_MESSAGE,
  };
}

export { NOT_ACCEPTING_MESSAGE };
