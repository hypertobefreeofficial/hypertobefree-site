export type JourneyUpload = {
  id: string;
  user_id: string | null;
  name: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  video_url: string | null;
  status: string | null;
  prayer_status: string | null;
  answered_text: string | null;
  created_at: string | null;
  edited_at?: string | null;
  removed_at?: string | null;
};

export type UploadTotals = {
  total: number;
  approved: number;
  pending: number;
  removed: number;
  videos: number;
};

export type EncouragementImpact = {
  total: number;
  amen: number;
  praiseGod: number;
  encouraged: number;
  praying: number;
};

export type ReactionRow = {
  story_id: string | null;
  user_id: string | null;
  reaction_type: string | null;
};

export type UploadStatusFilter =
  | "all"
  | "approved"
  | "pending"
  | "removed"
  | "videos";

export type UploadTypeFilter =
  | "all"
  | "testimony"
  | "prayer"
  | "praise"
  | "story"
  | "other"
  | "answered"
  | "edited"
  | "text";

export type UploadSort =
  | "newest"
  | "oldest"
  | "edited"
  | "responses"
  | "status"
  | "type";

export type UploadViewMode = "list" | "grid";

export type StoryReactionTotals = {
  total: number;
  amen: number;
  praiseGod: number;
  encouraged: number;
  praying: number;
};
