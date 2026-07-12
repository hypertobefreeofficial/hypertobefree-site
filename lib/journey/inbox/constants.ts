import type { InboxFilter, InboxMessageKind } from "./types";

export const BASE_SELECT = "id, title, body, read, created_at, category";
export const MESSAGE_SELECT = `${BASE_SELECT}, sender_user_id, parent_message_id, thread_id, message_type, story_id, prayer_request_id, video_url, image_url, action_url, hidden_at`;

// Private Inbox videos currently use the existing public-url workflow and must be
// migrated to private storage with signed URLs before public launch.
export const PRAYER_VIDEO_BUCKET = "story-videos";
export const MAX_PRAYER_VIDEO_SECONDS = 30;

export const INBOX_CARD_STYLES: Record<
  InboxMessageKind,
  {
    label: string;
    eyebrow: string;
    accent: string;
  }
> = {
  encouragement: {
    label: "Encouragement",
    eyebrow: "Someone encouraged you",
    accent: "emerald",
  },
  prayer_video_reply: {
    label: "Prayer Response",
    eyebrow: "Private prayer response",
    accent: "blue",
  },
  scripture_share: {
    label: "Scripture Share",
    eyebrow: "Scripture for your journey",
    accent: "indigo",
  },
  testimony_response: {
    label: "Testimony Response",
    eyebrow: "Response to your story",
    accent: "sky",
  },
  team: {
    label: "HTBF Team",
    eyebrow: "HTBF update",
    accent: "slate",
  },
  milestone: {
    label: "Milestone",
    eyebrow: "Journey milestone",
    accent: "amber",
  },
  approval: {
    label: "Approval",
    eyebrow: "Story review update",
    accent: "cyan",
  },
};

export const FILTERS: { id: InboxFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "prayer", label: "Prayer Updates" },
  { id: "video", label: "Video" },
  { id: "approvals", label: "Approvals" },
  { id: "milestones", label: "Milestones" },
  { id: "team", label: "HTBF Team" },
];
