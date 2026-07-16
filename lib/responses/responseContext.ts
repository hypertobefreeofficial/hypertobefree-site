import type { PrayerInteractionPrefs } from "../prayer-connect/interactionPrefs";
import { getPrayerInteractionPrefs } from "../prayer-connect/interactionPrefs";
import { getPublicVideoEligibility } from "../prayer-connect/eligibility";

export type ResponseSourceType = "prayer" | "feed";

export type ResponseChoice =
  | "public-video"
  | "private-message"
  | "private-video";

export type ResponseContextLabels = {
  sheetEyebrow: string;
  sheetTitle: string;
  publicVideoTitle: string;
  publicVideoDetail: string;
  privateMessageTitle: string;
  privateMessageDetail: string;
  privateVideoTitle: string;
  privateVideoDetail: string;
  publicGroupHint: string;
  privateGroupHint: string;
  modalPublicVideoTitle: string;
  modalPrivateMessageTitle: string;
  modalPrivateVideoTitle: string;
  modalPublicVideoMeta: string;
  modalPrivateMessageMeta: string;
  modalPrivateVideoMeta: string;
  submitPublicVideo: string;
  submitPrivateVideo: string;
  messagePreviewPrefix: string;
  privateVideoTitleRecipient: string;
  privateVideoTitleSender: string;
  privateVideoBodyFallback: string;
  signInRequired: string;
  notAcceptingResponses: string;
};

export type ResponseSourceContext = {
  sourceType: ResponseSourceType;
  storyId: string;
  authorUserId: string | null;
  storyTitle: string;
  topics?: string[];
  prayerStatus?: "active" | "answered" | "paused";
  requestApproved?: boolean;
  labels: ResponseContextLabels;
  prefs: PrayerInteractionPrefs;
  canRespond: boolean;
  canPublicVideo: boolean;
  publicVideoBlockReason: string | null;
};

const PRAYER_LABELS: ResponseContextLabels = {
  sheetEyebrow: "Respond with Prayer",
  sheetTitle: "Choose how you want to respond",
  publicVideoTitle: "Post a public video prayer",
  publicVideoDetail: "Recorded or uploaded video attached to this request.",
  privateMessageTitle: "Send a private prayer message",
  privateMessageDetail: "Only the requester can read this in HTBF Messages.",
  privateVideoTitle: "Record a private video prayer",
  privateVideoDetail: "A personal video delivered privately through Journey Inbox.",
  publicGroupHint:
    "Public video prayers can be seen by other believers after approval.",
  privateGroupHint: "Only you and the requester can see these responses.",
  modalPublicVideoTitle: "Send a Public Video Prayer",
  modalPrivateMessageTitle: "Send a Private Message",
  modalPrivateVideoTitle: "Send a Private Video Prayer",
  modalPublicVideoMeta:
    "Public video prayers can be seen by other believers after approval.",
  modalPrivateMessageMeta: "Only the requester will see this in HTBF Messages.",
  modalPrivateVideoMeta:
    "This video is delivered privately through Journey Inbox.",
  submitPublicVideo: "Submit Video Prayer",
  submitPrivateVideo: "Send Private Video",
  messagePreviewPrefix: "Prayer request",
  privateVideoTitleRecipient: "Someone sent you a private video prayer",
  privateVideoTitleSender: "You sent a private video prayer",
  privateVideoBodyFallback: "A private video prayer for",
  signInRequired: "Please sign in to respond to this prayer request.",
  notAcceptingResponses: "This request is no longer accepting new responses.",
};

const FEED_LABELS: ResponseContextLabels = {
  sheetEyebrow: "Respond to this post",
  sheetTitle: "Choose how you want to respond",
  publicVideoTitle: "Post a public video response",
  publicVideoDetail: "Recorded or uploaded video attached to this post.",
  privateMessageTitle: "Send a private message",
  privateMessageDetail: "Only the author can read this in HTBF Messages.",
  privateVideoTitle: "Record a private video response",
  privateVideoDetail: "A personal video delivered privately through Journey Inbox.",
  publicGroupHint:
    "Public video responses can be seen by the community after approval.",
  privateGroupHint: "Only you and the author can see these responses.",
  modalPublicVideoTitle: "Post a Public Video Response",
  modalPrivateMessageTitle: "Send a Private Message",
  modalPrivateVideoTitle: "Send a Private Video Response",
  modalPublicVideoMeta:
    "Public video responses can be seen by the community after approval.",
  modalPrivateMessageMeta: "Only the author will see this in HTBF Messages.",
  modalPrivateVideoMeta:
    "This video is delivered privately through Journey Inbox.",
  submitPublicVideo: "Submit Video Response",
  submitPrivateVideo: "Send Private Video",
  messagePreviewPrefix: "Post",
  privateVideoTitleRecipient: "Someone sent you a private video response",
  privateVideoTitleSender: "You sent a private video response",
  privateVideoBodyFallback: "A private video response for",
  signInRequired: "Please sign in to respond to this post.",
  notAcceptingResponses: "This post is no longer accepting new responses.",
};

export function getResponseContextLabels(
  sourceType: ResponseSourceType
): ResponseContextLabels {
  return sourceType === "prayer" ? PRAYER_LABELS : FEED_LABELS;
}

export function buildResponseSourceContext(input: {
  sourceType: ResponseSourceType;
  storyId: string;
  authorUserId: string | null;
  storyTitle: string;
  topics?: string[];
  prayerStatus?: "active" | "answered" | "paused";
  requestApproved?: boolean;
}): ResponseSourceContext {
  const labels = getResponseContextLabels(input.sourceType);
  const requestApproved = input.requestApproved ?? true;

  if (input.sourceType === "feed") {
    const acceptsNewResponses = requestApproved;
    const prefs: PrayerInteractionPrefs = {
      allowPublicWritten: false,
      allowPublicVideo: acceptsNewResponses,
      allowPrivateMessage: acceptsNewResponses,
      allowPrivateVideo: acceptsNewResponses,
      allowEncouragement: acceptsNewResponses,
      allowSharing: true,
      acceptsNewResponses,
    };

    return {
      ...input,
      labels,
      prefs,
      canRespond:
        acceptsNewResponses &&
        Boolean(input.authorUserId) &&
        (prefs.allowPublicVideo ||
          prefs.allowPrivateMessage ||
          prefs.allowPrivateVideo),
      canPublicVideo: acceptsNewResponses,
      publicVideoBlockReason: acceptsNewResponses
        ? null
        : labels.notAcceptingResponses,
    };
  }

  const prayerStatus = input.prayerStatus ?? "active";
  const prefs = getPrayerInteractionPrefs(input.topics ?? [], prayerStatus);
  const eligibility = getPublicVideoEligibility({
    topics: input.topics ?? [],
    prayerStatus,
    requestApproved,
  });

  return {
    ...input,
    prayerStatus,
    labels,
    prefs,
    canRespond: eligibility.canRespond,
    canPublicVideo: eligibility.canPublicVideo,
    publicVideoBlockReason: eligibility.reason,
  };
}
