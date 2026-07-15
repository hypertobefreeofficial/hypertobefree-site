/**
 * Community Feed canonical item model.
 * Internal provenance fields are backend-only — never render on public cards.
 */

export type CommunityFeedOriginSurface =
  | "prayer_connect"
  | "share_your_story"
  | "profile_upload"
  | "praise"
  | "public_video_response"
  | "god_did_it_update"
  | "unknown";

export type CommunityFeedCanonicalType =
  | "story"
  | "prayer_video_response";

export type CommunityFeedItem = {
  /** Stable deduplication key — one canonical row, one feed appearance */
  dedupeKey: string;
  canonicalType: CommunityFeedCanonicalType;
  canonicalId: string;
  creatorUserId: string | null;
  /** Internal only — do not expose in UI */
  originSurface: CommunityFeedOriginSurface;
  parentCanonicalType: CommunityFeedCanonicalType | null;
  parentCanonicalId: string | null;
  publishedAt: string;
  /** Resolved presentation payload (story row or response row) */
  story?: CommunityFeedStoryRecord | null;
  videoResponse?: CommunityFeedVideoResponseRecord | null;
};

export type CommunityFeedStoryRecord = {
  id: string;
  user_id: string | null;
  name: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  overlay_text: string | null;
  overlay_x: number | null;
  overlay_y: number | null;
  caption_style: string | null;
  caption_font: string | null;
  caption_background: string | null;
  caption_template: string | null;
  caption_color: string | null;
  caption_size: string | null;
  caption_align: string | null;
  video_template: string | null;
  htbf_watermark_enabled: boolean | null;
  silhouette_watermark_enabled: boolean | null;
  shared_htbf_intro_enabled: boolean | null;
  image_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  status: string | null;
  created_at: string | null;
  prayer_status: string | null;
  answered_at: string | null;
  answered_text: string | null;
  creation_mode: string | null;
  ai_suggestions: unknown;
  removed_at?: string | null;
};

export type CommunityFeedVideoResponseRecord = {
  id: string;
  story_id: string;
  user_id: string;
  video_url: string | null;
  thumbnail_url: string | null;
  status: string | null;
  removed_at: string | null;
  created_at: string;
};

export type CommunityFeedFilter =
  | "all"
  | "videos"
  | "testimony"
  | "praise"
  | "prayer"
  | "answered";
