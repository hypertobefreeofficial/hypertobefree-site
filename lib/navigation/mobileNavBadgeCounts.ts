import {
  getPrayerThreadKey,
  isPrayerConversationMessage,
} from "../journey/inbox/utils";
import type { InboxMessage } from "../journey/inbox/types";

export const PRAYER_NOTIFICATION_MESSAGE_TYPES = [
  "prayer_update",
  "answered_prayer",
  "prayer_circle",
  "prayer_video_response",
] as const;

export type MobileNavInboxRow = {
  id: string;
  sender_user_id?: string | null;
  thread_id?: string | null;
  story_id?: string | null;
  prayer_request_id?: string | null;
  message_type?: string | null;
  category?: string | null;
  title?: string | null;
  read: boolean;
  hidden_at?: string | null;
};

export type MobileNavPrivateReplyRow = {
  id: string;
  story_id: string | null;
  user_id: string | null;
  recipient_user_id: string | null;
  read_at: string | null;
  deleted_by_recipient?: boolean | null;
};

export type MobileNavBadgeCounts = {
  prayerCount: number;
  inboxCount: number;
};

export function formatMobileNavBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function asInboxMessage(row: MobileNavInboxRow): InboxMessage {
  return {
    id: row.id,
    sender_user_id: row.sender_user_id,
    thread_id: row.thread_id,
    story_id: row.story_id,
    prayer_request_id: row.prayer_request_id,
    message_type: row.message_type,
    category: row.category,
    title: row.title ?? "",
    body: row.title ?? "",
    read: row.read,
    hidden_at: row.hidden_at,
    created_at: "",
  };
}

export function isUnreadMobileNavInboxRow(row: MobileNavInboxRow): boolean {
  return row.read !== true && !row.hidden_at;
}

export function isPrayerNotificationCandidate(row: MobileNavInboxRow): boolean {
  const category = row.category?.trim().toLowerCase();
  if (category === "prayer") return true;

  const messageType = row.message_type?.trim();
  if (!messageType) return false;

  return (PRAYER_NOTIFICATION_MESSAGE_TYPES as readonly string[]).includes(
    messageType
  );
}

/** Unread broadcast prayer activity — not private inbox conversations. */
export function isPrayerBadgeInboxRow(row: MobileNavInboxRow): boolean {
  if (!isUnreadMobileNavInboxRow(row)) return false;
  if (isPrayerConversationMessage(asInboxMessage(row))) return false;
  return isPrayerNotificationCandidate(row);
}

/** Unread private inbox conversation rows from inbox_messages. */
export function isInboxBadgeInboxRow(row: MobileNavInboxRow): boolean {
  if (!isUnreadMobileNavInboxRow(row)) return false;
  return isPrayerConversationMessage(asInboxMessage(row));
}

export function getPrivateReplyConversationKey(
  row: MobileNavPrivateReplyRow,
  currentUserId: string
): string {
  const storyId = row.story_id?.trim() || "unknown-story";
  const otherUserId =
    row.user_id === currentUserId
      ? row.recipient_user_id?.trim()
      : row.user_id?.trim();

  return `reply:${storyId}:${otherUserId || "unknown-user"}`;
}

export function isUnreadReceivedPrivateReply(
  row: MobileNavPrivateReplyRow,
  currentUserId: string
): boolean {
  if (row.recipient_user_id !== currentUserId) return false;
  if (row.read_at) return false;
  if (row.deleted_by_recipient === true) return false;
  return true;
}

export function getMobileNavBadgeCountForHref(
  href: string,
  counts: MobileNavBadgeCounts
): number {
  if (href === "/prayer") return counts.prayerCount;
  if (href === "/journey") return counts.inboxCount;
  return 0;
}

export function computeMobileNavBadgeCounts(
  inboxRows: MobileNavInboxRow[],
  privateReplyRows: MobileNavPrivateReplyRow[],
  currentUserId: string
): MobileNavBadgeCounts {
  const prayerIds = new Set<string>();
  const inboxConversationKeys = new Set<string>();

  for (const row of inboxRows) {
    if (isPrayerBadgeInboxRow(row)) {
      prayerIds.add(row.id);
      continue;
    }

    if (isInboxBadgeInboxRow(row)) {
      inboxConversationKeys.add(getPrayerThreadKey(asInboxMessage(row)));
    }
  }

  for (const row of privateReplyRows) {
    if (!isUnreadReceivedPrivateReply(row, currentUserId)) continue;
    inboxConversationKeys.add(getPrivateReplyConversationKey(row, currentUserId));
  }

  return {
    prayerCount: prayerIds.size,
    inboxCount: inboxConversationKeys.size,
  };
}
