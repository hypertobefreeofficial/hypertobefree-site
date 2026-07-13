import type { PrayerConnectCategoryFilter } from "./types";

export const PRAYER_PERMISSION_TOPIC_KEYS = new Set([
  "allow-public-prayers",
  "allow-public-video-prayers",
  "allow-private-messages",
  "allow-private-video-prayers",
  "allow-encouragement",
  "allow-sharing",
  "receive-updates",
]);

export const PRAYER_META_TOPIC_KEYS = new Set([
  "urgent",
  "anonymous",
]);

const PRAYER_CATEGORY_IDS = new Set<PrayerConnectCategoryFilter>([
  "health",
  "family",
  "relationships",
  "finances",
  "work",
  "faith",
  "grief",
  "addiction",
  "children",
  "community",
  "ministry",
  "emotional",
  "other",
]);

export const PRAYER_TYPE_TOPIC_PREFIX = "ptype:";

export type PartitionedPrayerTopics = {
  category: PrayerConnectCategoryFilter | null;
  prayerTypeLabel: string | null;
  interactionKeys: string[];
  metaKeys: string[];
  publicTopics: string[];
};

export function partitionPrayerTopics(
  topics: string[] | null | undefined
): PartitionedPrayerTopics {
  const values = topics ?? [];
  const category =
    values.find((topic): topic is PrayerConnectCategoryFilter =>
      PRAYER_CATEGORY_IDS.has(topic as PrayerConnectCategoryFilter)
    ) ?? null;

  const prayerTypeTopic = values.find((topic) =>
    topic.startsWith(PRAYER_TYPE_TOPIC_PREFIX)
  );
  const prayerTypeLabel = prayerTypeTopic
    ? prayerTypeTopic.slice(PRAYER_TYPE_TOPIC_PREFIX.length).trim() || null
    : null;

  const interactionKeys = values.filter((topic) =>
    PRAYER_PERMISSION_TOPIC_KEYS.has(topic)
  );
  const metaKeys = values.filter((topic) => PRAYER_META_TOPIC_KEYS.has(topic));
  const publicTopics = values.filter(
    (topic) =>
      topic !== category &&
      !topic.startsWith(PRAYER_TYPE_TOPIC_PREFIX) &&
      !PRAYER_PERMISSION_TOPIC_KEYS.has(topic) &&
      !PRAYER_META_TOPIC_KEYS.has(topic)
  );

  return { category, prayerTypeLabel, interactionKeys, metaKeys, publicTopics };
}

export function isPrayerPermissionTopic(topic: string) {
  return PRAYER_PERMISSION_TOPIC_KEYS.has(topic);
}

export function isPrayerInternalTopic(topic: string) {
  return (
    PRAYER_PERMISSION_TOPIC_KEYS.has(topic) ||
    PRAYER_META_TOPIC_KEYS.has(topic) ||
    topic.startsWith(PRAYER_TYPE_TOPIC_PREFIX)
  );
}
