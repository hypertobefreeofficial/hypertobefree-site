import {
  shouldSuppressInboxNotification,
  type CommunityEmailPayload,
  sendCommunityEmailIfAllowed,
} from "./externalServiceIsolation";
import type { DemoContentFieldSnapshot } from "./types";

export { shouldSuppressInboxNotification, sendCommunityEmailIfAllowed };
export type { CommunityEmailPayload };

export type InboxNotificationContext = {
  story?: DemoContentFieldSnapshot | null;
  actor?: DemoContentFieldSnapshot | null;
  recipient?: DemoContentFieldSnapshot | null;
};

/** Suppress notification insertion before inbox_messages writes. */
export function shouldDeliverInboxNotification(
  context: InboxNotificationContext
): boolean {
  return !shouldSuppressInboxNotification(context);
}

/** Hide inbox rows tied to demo parent stories once story metadata is known. */
export function filterInboxMessagesForGenuineStories<
  T extends { story_id?: string | null; prayer_request_id?: string | null },
>(messages: T[], demoStoryIds: Set<string>): T[] {
  if (demoStoryIds.size === 0) return messages;

  return messages.filter((message) => {
    const storyId = message.story_id ?? message.prayer_request_id;
    if (!storyId) return true;
    return !demoStoryIds.has(storyId);
  });
}
