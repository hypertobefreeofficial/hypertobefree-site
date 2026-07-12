export type InboxMessage = {
  id: string;
  user_id?: string | null;
  sender_user_id?: string | null;
  parent_message_id?: string | null;
  thread_id?: string | null;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  category?: string | null;
  message_type?: string | null;
  type?: string | null;
  story_id?: string | null;
  prayer_request_id?: string | null;
  video_url?: string | null;
  image_url?: string | null;
  action_url?: string | null;
  hidden_at?: string | null;
};

export type InboxMessageKind =
  | "encouragement"
  | "prayer_video_reply"
  | "scripture_share"
  | "testimony_response"
  | "team"
  | "milestone"
  | "approval";

export type InboxFilter =
  | "all"
  | "unread"
  | "prayer"
  | "approvals"
  | "milestones"
  | "team"
  | "video";

export type ReplyMode = "text" | "video";

export type ClearMessageRequest =
  | { mode: "single"; messages: InboxMessage[] }
  | { mode: "all"; messages: InboxMessage[] };

export type PrayerStorySummary = {
  id: string;
  name: string | null;
  location: string | null;
  story_text: string | null;
  story_type: string | null;
  created_at: string | null;
};

export type InboxThread = {
  key: string;
  messages: InboxMessage[];
  latestMessage: InboxMessage;
  unreadCount: number;
  storyId: string | null;
};

export type InboxListItem =
  | { kind: "message"; message: InboxMessage }
  | { kind: "thread"; thread: InboxThread };

export type InboxTimeGroup = {
  id: "today" | "yesterday" | "earlier";
  label: string;
  items: InboxListItem[];
};
