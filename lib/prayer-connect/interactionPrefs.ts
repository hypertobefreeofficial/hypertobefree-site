import {
  PRAYER_TYPE_TOPIC_PREFIX,
  partitionPrayerTopics,
} from "./topicPartition";

export type PrayerInteractionPrefs = {
  allowPublicWritten: boolean;
  allowPublicVideo: boolean;
  allowPrivateMessage: boolean;
  allowPrivateVideo: boolean;
  allowEncouragement: boolean;
  allowSharing: boolean;
  acceptsNewResponses: boolean;
};

export function getPrayerInteractionPrefs(
  topics: string[],
  prayerStatus: "active" | "answered" | "paused"
): PrayerInteractionPrefs {
  const { interactionKeys } = partitionPrayerTopics(topics);
  const hasInteractionKeys = interactionKeys.length > 0;
  const acceptsNewResponses = prayerStatus === "active";

  return {
    allowPublicWritten:
      acceptsNewResponses &&
      (!hasInteractionKeys || interactionKeys.includes("allow-public-prayers")),
    allowPublicVideo:
      acceptsNewResponses &&
      (!hasInteractionKeys ||
        interactionKeys.includes("allow-public-video-prayers")),
    allowPrivateMessage:
      acceptsNewResponses &&
      (!hasInteractionKeys || interactionKeys.includes("allow-private-messages")),
    allowPrivateVideo:
      acceptsNewResponses &&
      (!hasInteractionKeys ||
        interactionKeys.includes("allow-private-video-prayers")),
    allowEncouragement:
      acceptsNewResponses &&
      (!hasInteractionKeys || interactionKeys.includes("allow-encouragement")),
    allowSharing:
      !hasInteractionKeys || interactionKeys.includes("allow-sharing"),
    acceptsNewResponses,
  };
}

export function buildInteractionTopics(options: {
  allowEncouragement: boolean;
  allowPublicWritten?: boolean;
  allowPublicVideo: boolean;
  allowPrivateMessage: boolean;
  allowPrivateVideo: boolean;
  allowSharing: boolean;
  receiveUpdates: boolean;
  postAnonymous: boolean;
  isUrgent: boolean;
  category: string;
  prayerTypeLabel?: string;
}) {
  const topics = [options.category];
  const typeLabel = options.prayerTypeLabel?.trim();
  if (typeLabel) {
    topics.push(`${PRAYER_TYPE_TOPIC_PREFIX}${typeLabel}`);
  }
  if (options.isUrgent) topics.push("urgent");
  if (options.allowEncouragement) topics.push("allow-encouragement");
  if (options.allowPublicWritten) topics.push("allow-public-prayers");
  if (options.allowPublicVideo) topics.push("allow-public-video-prayers");
  if (options.allowPrivateMessage) topics.push("allow-private-messages");
  if (options.allowPrivateVideo) topics.push("allow-private-video-prayers");
  if (options.allowSharing) topics.push("allow-sharing");
  if (options.receiveUpdates) topics.push("receive-updates");
  if (options.postAnonymous) topics.push("anonymous");
  return topics;
}
