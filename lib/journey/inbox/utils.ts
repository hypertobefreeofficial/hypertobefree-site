import type {
  InboxFilter,
  InboxListItem,
  InboxMessage,
  InboxMessageKind,
  InboxThread,
  InboxTimeGroup,
  PrayerStorySummary,
} from "./types";

export function formatUnreadBadge(count: number) {
  return count > 99 ? "99+" : String(count);
}

export function formatMessageDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatMessageDateShort(value: string) {
  const date = new Date(value);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  if (isYesterday) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read video duration."));
    };
    video.src = url;
  });
}

export function isPrayerStorySummary(value: unknown): value is PrayerStorySummary {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string"
  );
}

export function buildInboxListItems(messages: InboxMessage[]): InboxListItem[] {
  const threadMap = new Map<string, InboxMessage[]>();
  const items: InboxListItem[] = [];

  messages.forEach((message) => {
    if (!isPrayerConversationMessage(message)) {
      items.push({ kind: "message", message });
      return;
    }

    const threadKey = getPrayerThreadKey(message);
    const threadMessages = threadMap.get(threadKey) ?? [];
    threadMessages.push(message);
    threadMap.set(threadKey, threadMessages);
  });

  threadMap.forEach((threadMessages) => {
    const thread = buildInboxThread(threadMessages);

    if (thread) {
      items.push({ kind: "thread", thread });
    }
  });

  return items.sort(
    (first, second) =>
      getInboxListItemTime(second) - getInboxListItemTime(first)
  );
}

export function buildInboxThread(messages: InboxMessage[]): InboxThread | null {
  if (messages.length === 0) return null;

  const sortedNewestFirst = [...messages].sort(
    (first, second) => getMessageTime(second) - getMessageTime(first)
  );
  const latestMessage = sortedNewestFirst[0];

  if (!latestMessage) return null;

  return {
    key: getPrayerThreadKey(latestMessage),
    messages: sortedNewestFirst,
    latestMessage,
    unreadCount: messages.filter((message) => !message.read).length,
    storyId:
      latestMessage.prayer_request_id?.trim() ||
      latestMessage.story_id?.trim() ||
      null,
  };
}

export function getInboxItemKey(item: InboxListItem) {
  return item.kind === "thread" ? item.thread.key : `message:${item.message.id}`;
}

export function getInboxListItemTime(item: InboxListItem) {
  return item.kind === "thread"
    ? getMessageTime(item.thread.latestMessage)
    : getMessageTime(item.message);
}

export function getThreadMessagesChronological(messages: InboxMessage[]) {
  return [...messages].sort(
    (first, second) => getMessageTime(first) - getMessageTime(second)
  );
}

export function getMessageTime(message: InboxMessage) {
  const time = new Date(message.created_at).getTime();

  return Number.isFinite(time) ? time : 0;
}

export function isLocalInboxMessageId(messageId: string) {
  return messageId.startsWith("local-");
}

export function getPrayerThreadKey(message: InboxMessage) {
  const cleanThreadId = message.thread_id?.trim();

  if (cleanThreadId) return `thread:${cleanThreadId}`;

  const linkedPrayerId =
    message.prayer_request_id?.trim() || message.story_id?.trim();

  if (linkedPrayerId) return `prayer:${linkedPrayerId}`;

  return `message:${message.id}`;
}

export function getPrayerThreadIdForInsert(message: InboxMessage) {
  const cleanThreadId = message.thread_id?.trim();

  if (cleanThreadId) return cleanThreadId;

  const linkedPrayerId =
    message.prayer_request_id?.trim() || message.story_id?.trim();

  if (linkedPrayerId) return `prayer:${linkedPrayerId}`;

  return `message:${message.id}`;
}

export function getThreadReplyTarget(thread: InboxThread, userId: string | null) {
  const chronologicalMessages = getThreadMessagesChronological(thread.messages);
  const latestFromOtherPerson = [...chronologicalMessages]
    .reverse()
    .find(
      (message) =>
        message.sender_user_id && (!userId || message.sender_user_id !== userId)
    );

  return latestFromOtherPerson ?? null;
}

export function isPrayerConversationMessage(message: InboxMessage) {
  const searchable = normalizeSearchable([
    message.message_type,
    message.type,
    message.category,
    message.title,
    message.body,
  ]);

  return Boolean(
    message.sender_user_id &&
      matchesAny(searchable, [
        "prayer video response",
        "prayer video reply",
        "prayer reply",
        "prayer video",
        "prayer_video_response",
        "prayer_video_reply",
        "prayer_reply",
      ])
  );
}

export function isPrayerReplyable(message: InboxMessage) {
  const searchable = normalizeSearchable([
    message.message_type,
    message.type,
    message.category,
    message.title,
    message.body,
  ]);

  return Boolean(
    message.sender_user_id &&
      matchesAny(searchable, [
        "prayer video response",
        "prayer video reply",
        "prayer reply",
        "prayer video",
        "prayer_video_response",
        "prayer_video_reply",
        "prayer_reply",
      ])
  );
}

export function getExplicitCategoryLabel(message: InboxMessage) {
  const rawCategory =
    message.category?.trim() ||
    message.message_type?.trim() ||
    message.type?.trim();

  if (!rawCategory) return "";

  return formatCategoryLabel(rawCategory);
}

export function getInboxMessageKind(message: InboxMessage): InboxMessageKind {
  const searchable = normalizeSearchable([
    message.message_type,
    message.type,
    message.category,
    message.title,
    message.body,
  ]);

  if (
    matchesAny(searchable, [
      "prayer_video_response",
      "prayer video response",
      "prayer_video_reply",
      "prayer video reply",
      "prayer_reply",
      "prayer reply",
      "video prayer",
    ])
  ) {
    return "prayer_video_reply";
  }

  if (matchesAny(searchable, ["scripture_share", "scripture share", "verse"])) {
    return "scripture_share";
  }

  if (
    matchesAny(searchable, [
      "testimony_response",
      "testimony response",
      "story response",
    ])
  ) {
    return "testimony_response";
  }

  if (
    matchesAny(searchable, [
      "encouragement",
      "encourage",
      "encouraged",
      "encouraging",
    ])
  ) {
    return "encouragement";
  }

  if (
    matchesAny(searchable, [
      "approval",
      "approved",
      "approve",
      "pending",
      "submitted",
      "removed",
    ])
  ) {
    return "approval";
  }

  if (
    matchesAny(searchable, [
      "milestone",
      "achievement",
      "badge",
      "streak",
      "journey",
      "progress",
    ])
  ) {
    return "milestone";
  }

  return "team";
}

export function getMessageCategoryKey(
  message: InboxMessage
): Exclude<InboxFilter, "all" | "unread" | "video"> {
  const messageKind = getInboxMessageKind(message);
  const searchable = normalizeSearchable([
    message.category,
    message.message_type,
    message.type,
    message.title,
    message.body,
  ]);

  if (
    messageKind === "prayer_video_reply" ||
    message.prayer_request_id ||
    matchesAny(searchable, ["prayer", "pray", "praying", "answered"])
  ) {
    return "prayer";
  }

  if (
    messageKind === "approval" ||
    matchesAny(searchable, [
      "approval",
      "approved",
      "approve",
      "pending",
      "submitted",
      "removed",
    ])
  ) {
    return "approvals";
  }

  if (
    messageKind === "milestone" ||
    matchesAny(searchable, [
      "milestone",
      "achievement",
      "badge",
      "streak",
      "journey",
      "progress",
    ])
  ) {
    return "milestones";
  }

  return "team";
}

export function filterInboxMessages(
  messages: InboxMessage[],
  activeFilter: InboxFilter
) {
  return messages.filter((message) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "unread") return !message.read;
    if (activeFilter === "video") return Boolean(message.video_url?.trim());

    const category = getMessageCategoryKey(message);
    return category === activeFilter;
  });
}

export function searchInboxItems(items: InboxListItem[], query: string) {
  const cleanQuery = query.trim().toLowerCase();

  if (!cleanQuery) return items;

  return items.filter((item) => {
    if (item.kind === "thread") {
      const haystack = [
        item.thread.latestMessage.title,
        item.thread.latestMessage.body,
        "prayer conversation",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(cleanQuery);
    }

    const haystack = [
      item.message.title,
      item.message.body,
      item.message.category,
      item.message.message_type,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(cleanQuery);
  });
}

export function groupInboxItemsByTime(items: InboxListItem[]): InboxTimeGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(todayStart.getDate() - 1);

  const groups: InboxTimeGroup[] = [
    { id: "today", label: "Today", items: [] },
    { id: "yesterday", label: "Yesterday", items: [] },
    { id: "earlier", label: "Earlier", items: [] },
  ];

  items.forEach((item) => {
    const createdAt = new Date(getInboxListItemTime(item));
    const group =
      createdAt >= todayStart
        ? groups[0]
        : createdAt >= yesterdayStart
          ? groups[1]
          : groups[2];

    group.items.push(item);
  });

  return groups.filter((group) => group.items.length > 0);
}

export function getInboxRowPreview(item: InboxListItem) {
  if (item.kind === "thread") {
    return {
      title: "Prayer Conversation",
      body: item.thread.latestMessage.body?.trim() || "Private prayer thread",
      timestamp: item.thread.latestMessage.created_at,
      unreadCount: item.thread.unreadCount,
      hasVideo: item.thread.messages.some((message) =>
        Boolean(message.video_url?.trim())
      ),
      videoUrl: item.thread.latestMessage.video_url?.trim() || null,
      kind: "prayer_video_reply" as InboxMessageKind,
      senderLabel: "Prayer thread",
    };
  }

  const messageKind = getInboxMessageKind(item.message);

  return {
    title: item.message.title,
    body: item.message.body?.trim() || "",
    timestamp: item.message.created_at,
    unreadCount: item.message.read ? 0 : 1,
    hasVideo: Boolean(item.message.video_url?.trim()),
    videoUrl: item.message.video_url?.trim() || null,
    kind: messageKind,
    senderLabel: getExplicitCategoryLabel(item.message) || INBOX_KIND_LABEL(messageKind),
  };
}

function INBOX_KIND_LABEL(kind: InboxMessageKind) {
  const labels: Record<InboxMessageKind, string> = {
    encouragement: "Encouragement",
    prayer_video_reply: "Prayer Response",
    scripture_share: "Scripture",
    testimony_response: "Testimony",
    team: "HTBF Team",
    milestone: "Milestone",
    approval: "Approval",
  };

  return labels[kind];
}

function matchesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function normalizeSearchable(values: Array<string | null | undefined>) {
  return values
    .filter(Boolean)
    .join(" ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function formatCategoryLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
