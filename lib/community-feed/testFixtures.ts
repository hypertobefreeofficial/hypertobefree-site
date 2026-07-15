import type {
  CommunityFeedStoryRecord,
  CommunityFeedVideoResponseRecord,
} from "./types";

export function buildStory(
  overrides: Partial<CommunityFeedStoryRecord> = {}
): CommunityFeedStoryRecord {
  return {
    id: "story-1",
    user_id: "author-1",
    name: "Author One",
    location: "Austin, TX",
    story_type: "Testimony",
    story_text: "God is faithful",
    overlay_text: null,
    overlay_x: null,
    overlay_y: null,
    caption_style: null,
    caption_font: null,
    caption_background: null,
    caption_template: null,
    caption_color: null,
    caption_size: null,
    caption_align: null,
    video_template: null,
    htbf_watermark_enabled: null,
    silhouette_watermark_enabled: null,
    shared_htbf_intro_enabled: null,
    image_url: null,
    video_url: null,
    thumbnail_url: null,
    status: "approved",
    created_at: "2026-07-14T12:00:00.000Z",
    prayer_status: "active",
    answered_at: null,
    answered_text: null,
    creation_mode: "guided",
    ai_suggestions: null,
    removed_at: null,
    ...overrides,
  };
}

export function buildVideoResponse(
  overrides: Partial<CommunityFeedVideoResponseRecord> = {}
): CommunityFeedVideoResponseRecord {
  return {
    id: "response-1",
    story_id: "story-parent-1",
    user_id: "responder-1",
    video_url: "story-videos/responder-1/prayer.webm",
    thumbnail_url: "story-thumbnails/responder-1/poster.webp",
    status: "approved",
    removed_at: null,
    created_at: "2026-07-14T11:00:00.000Z",
    ...overrides,
  };
}
