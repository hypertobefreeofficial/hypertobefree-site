import { supabase } from "../supabaseClient";
import {
  STORY_IMAGE_BUCKET,
  STORY_THUMBNAIL_BUCKET,
  STORY_VIDEO_BUCKET,
  resolveStoryMediaUrl,
} from "../journey/uploads/media";
import { isBlockedAuthor } from "./blockedUsers";
import { isStoryFeedEligible } from "./eligibility";
import { getCommunityFeedSchemaCapabilities } from "./schemaCapabilities";
import {
  getPhotoStoragePath,
  getThumbnailStoragePath,
  getVideoStoragePath,
} from "./mediaPaths";
import type {
  CommunityFeedItem,
  CommunityFeedStoryRecord,
} from "./types";

export type FeedReactionType = "amen" | "praise_god" | "encouraged" | "praying";

export type FeedStoryDisplay = {
  kind: "story";
  dedupeKey: string;
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
  signed_image_url: string | null;
  video_url: string | null;
  signed_video_url: string | null;
  thumbnail_url: string | null;
  signed_thumbnail_url: string | null;
  status: string | null;
  created_at: string | null;
  prayer_status: string | null;
  answered_at: string | null;
  answered_text: string | null;
  creation_mode: string | null;
  ai_suggestions: unknown;
  reaction_counts: {
    amen: number;
    praise_god: number;
    encouraged: number;
    praying: number;
  };
  user_reactions: FeedReactionType[];
};

export type FeedVideoResponseDisplay = {
  kind: "prayer_video_response";
  dedupeKey: string;
  id: string;
  user_id: string;
  name: string | null;
  location: string | null;
  video_url: string | null;
  signed_video_url: string | null;
  signed_thumbnail_url: string | null;
  created_at: string;
  parentStoryId: string;
  parentStoryUserId: string | null;
  parentStoryTitle: string;
  parentStoryAuthor: string | null;
};

export type FeedDisplayItem = FeedStoryDisplay | FeedVideoResponseDisplay;

type ReactionRow = {
  story_id: string | null;
  user_id: string | null;
  reaction_type: string | null;
};

const STORY_PARENT_SELECT_BASE =
  "id, user_id, name, location, story_type, story_text, status, created_at, prayer_status, answered_at, answered_text, removed_at";

function buildParentStorySelect(includeThumbnailUrl: boolean) {
  return includeThumbnailUrl
    ? `${STORY_PARENT_SELECT_BASE.replace(", removed_at", "")}, thumbnail_url, removed_at`
    : STORY_PARENT_SELECT_BASE;
}

async function loadParentStories(
  parentIds: string[],
  blockedUserIds: Set<string>
) {
  const map = new Map<string, CommunityFeedStoryRecord>();
  if (parentIds.length === 0) return map;

  const capabilities = await getCommunityFeedSchemaCapabilities();
  if (!capabilities.stories.hasRemovedAt) {
    return map;
  }

  const storySelect = buildParentStorySelect(
    capabilities.stories.hasThumbnailUrl
  );

  const { data, error } = await supabase
    .from("stories")
    .select(storySelect)
    .in("id", parentIds)
    .eq("status", "approved")
    .is("removed_at", null);

  if (error) {
    console.error("Could not load parent stories for feed responses:", error);
    return map;
  }

  for (const story of ((data as unknown as CommunityFeedStoryRecord[]) ?? [])) {
    if (
      isStoryFeedEligible(story, {
        blockedUserIds,
        removedAtFilterAvailable: true,
      })
    ) {
      map.set(story.id, story);
    }
  }

  return map;
}

function prayerTitleFromBody(storyText: string | null | undefined) {
  const line = (storyText || "").trim().split("\n")[0]?.trim();
  return line || "Prayer request";
}

async function signImageUrl(imageUrl: string | null) {
  if (!imageUrl) return null;
  const storagePath = getPhotoStoragePath(imageUrl);
  if (storagePath) {
    const { data, error } = await supabase.storage
      .from(STORY_IMAGE_BUCKET)
      .createSignedUrl(storagePath, 60 * 60);
    if (error) console.error("Could not create signed photo URL:", error);
    return data?.signedUrl ?? null;
  }
  if (imageUrl.startsWith("http")) return imageUrl;
  return null;
}

async function signVideoUrl(videoUrl: string | null) {
  if (!videoUrl) return null;
  const storagePath = getVideoStoragePath(videoUrl);
  if (storagePath) {
    const { data, error } = await supabase.storage
      .from(STORY_VIDEO_BUCKET)
      .createSignedUrl(storagePath, 60 * 60);
    if (error) console.error("Could not create signed video URL:", error);
    return data?.signedUrl ?? null;
  }
  if (videoUrl.startsWith("http")) return videoUrl;
  return null;
}

async function signThumbnailUrl(thumbnailUrl: string | null) {
  if (!thumbnailUrl) return null;
  return (
    (await resolveStoryMediaUrl(thumbnailUrl, STORY_THUMBNAIL_BUCKET)) ??
    (await resolveStoryMediaUrl(thumbnailUrl, STORY_IMAGE_BUCKET)) ??
    (thumbnailUrl.startsWith("http") ? thumbnailUrl : null)
  );
}

async function loadAuthorNames(userIds: string[]) {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, username")
    .in("id", userIds);

  for (const profile of (profiles as {
    id: string;
    display_name: string | null;
    username: string | null;
  }[]) ?? []) {
    const label =
      profile.display_name?.trim() || profile.username?.trim() || null;
    if (label) map.set(profile.id, label);
  }

  return map;
}

function buildReactionCounts(
  reactions: ReactionRow[],
  storyId: string,
  viewerUserId: string | null
) {
  const storyReactions = reactions.filter(
    (reaction) => reaction.story_id === storyId
  );

  const userReactions = storyReactions
    .filter((reaction) => reaction.user_id === viewerUserId)
    .map((reaction) => reaction.reaction_type)
    .filter(
      (reaction): reaction is FeedReactionType =>
        reaction === "amen" ||
        reaction === "praise_god" ||
        reaction === "encouraged" ||
        reaction === "praying"
    );

  return {
    reaction_counts: {
      amen: storyReactions.filter((r) => r.reaction_type === "amen").length,
      praise_god: storyReactions.filter((r) => r.reaction_type === "praise_god")
        .length,
      encouraged: storyReactions.filter((r) => r.reaction_type === "encouraged")
        .length,
      praying: storyReactions.filter((r) => r.reaction_type === "praying")
        .length,
    },
    user_reactions: userReactions,
  };
}

async function enrichStoryItem(
  item: CommunityFeedItem,
  reactions: ReactionRow[],
  viewerUserId: string | null,
  existing?: FeedStoryDisplay | null
): Promise<FeedStoryDisplay | null> {
  const story = item.story;
  if (!story) return null;

  const reuseSignedMedia =
    existing?.kind === "story" && existing.id === story.id;

  const signedImageUrl = reuseSignedMedia
    ? existing.signed_image_url ?? (await signImageUrl(story.image_url))
    : await signImageUrl(story.image_url);
  const signedVideoUrl = reuseSignedMedia
    ? existing.signed_video_url ?? (await signVideoUrl(story.video_url))
    : await signVideoUrl(story.video_url);
  const signedThumbnailUrl = reuseSignedMedia
    ? existing.signed_thumbnail_url ??
      (await signThumbnailUrl(story.thumbnail_url))
    : await signThumbnailUrl(story.thumbnail_url);

  const { reaction_counts, user_reactions } = buildReactionCounts(
    reactions,
    story.id,
    viewerUserId
  );

  return {
    kind: "story",
    dedupeKey: item.dedupeKey,
    id: story.id,
    user_id: story.user_id,
    name: story.name,
    location: story.location,
    story_type: story.story_type,
    story_text: story.story_text,
    overlay_text: story.overlay_text ?? null,
    overlay_x: story.overlay_x,
    overlay_y: story.overlay_y,
    caption_style: story.caption_style,
    caption_font: story.caption_font,
    caption_background: story.caption_background,
    caption_template: story.caption_template,
    caption_color: story.caption_color,
    caption_size: story.caption_size,
    caption_align: story.caption_align,
    video_template: story.video_template,
    htbf_watermark_enabled: story.htbf_watermark_enabled,
    silhouette_watermark_enabled: story.silhouette_watermark_enabled,
    shared_htbf_intro_enabled: story.shared_htbf_intro_enabled,
    image_url: story.image_url,
    signed_image_url: signedImageUrl,
    video_url: story.video_url,
    signed_video_url: signedVideoUrl,
    thumbnail_url: story.thumbnail_url,
    signed_thumbnail_url: signedThumbnailUrl,
    status: story.status,
    created_at: story.created_at,
    prayer_status: story.prayer_status ?? "active",
    answered_at: story.answered_at,
    answered_text: story.answered_text,
    creation_mode:
      typeof story.creation_mode === "string" ? story.creation_mode : null,
    ai_suggestions: story.ai_suggestions ?? null,
    reaction_counts,
    user_reactions,
  };
}

async function enrichVideoResponseItem(
  item: CommunityFeedItem,
  parentStories: Map<string, CommunityFeedStoryRecord>,
  authorNames: Map<string, string>,
  blockedUserIds: Set<string>,
  existing?: FeedVideoResponseDisplay | null
): Promise<FeedVideoResponseDisplay | null> {
  const response = item.videoResponse;
  if (!response || !item.parentCanonicalId) return null;

  if (isBlockedAuthor(response.user_id, blockedUserIds)) return null;

  const parent = parentStories.get(item.parentCanonicalId);
  if (!parent) return null;

  if (
    !isStoryFeedEligible(parent, {
      blockedUserIds,
      removedAtFilterAvailable: true,
    })
  ) {
    return null;
  }

  const reuseSignedMedia =
    existing?.kind === "prayer_video_response" && existing.id === response.id;

  const signedVideoUrl = reuseSignedMedia
    ? existing.signed_video_url ?? (await signVideoUrl(response.video_url))
    : await signVideoUrl(response.video_url);
  const signedThumbnailUrl = reuseSignedMedia
    ? existing.signed_thumbnail_url ??
      (await signThumbnailUrl(response.thumbnail_url))
    : await signThumbnailUrl(response.thumbnail_url);

  if (!signedVideoUrl && !response.video_url) return null;

  return {
    kind: "prayer_video_response",
    dedupeKey: item.dedupeKey,
    id: response.id,
    user_id: response.user_id,
    name: authorNames.get(response.user_id) ?? null,
    location: parent.location,
    video_url: response.video_url,
    signed_video_url: signedVideoUrl,
    signed_thumbnail_url: signedThumbnailUrl,
    created_at: response.created_at,
    parentStoryId: parent.id,
    parentStoryUserId: parent.user_id,
    parentStoryTitle: prayerTitleFromBody(parent.story_text),
    parentStoryAuthor: parent.name,
  };
}

export async function enrichFeedItems(
  items: CommunityFeedItem[],
  options?: {
    viewerUserId?: string | null;
    blockedUserIds?: string[];
    existingItemsByKey?: Map<string, FeedDisplayItem>;
  }
): Promise<FeedDisplayItem[]> {
  const blockedSet = new Set(options?.blockedUserIds ?? []);
  const viewerUserId = options?.viewerUserId ?? null;
  const existingItemsByKey = options?.existingItemsByKey;

  const storyIds = items
    .filter((item) => item.canonicalType === "story")
    .map((item) => item.canonicalId);

  const responseParentIds = items
    .filter((item) => item.canonicalType === "prayer_video_response")
    .map((item) => item.parentCanonicalId)
    .filter((id): id is string => Boolean(id));

  const missingParentIds = responseParentIds.filter(
    (id) => !items.some((item) => item.canonicalId === id && item.story)
  );

  const parentStories = await loadParentStories(missingParentIds, blockedSet);

  for (const item of items) {
    if (item.story) {
      parentStories.set(item.story.id, item.story);
    }
  }

  const responseAuthorIds = items
    .filter((item) => item.canonicalType === "prayer_video_response")
    .map((item) => item.creatorUserId)
    .filter((id): id is string => Boolean(id));

  const authorNames = await loadAuthorNames(responseAuthorIds);

  let reactions: ReactionRow[] = [];
  const reactionStoryIds = [...new Set([...storyIds, ...responseParentIds])];
  if (reactionStoryIds.length > 0) {
    const { data: reactionData } = await supabase
      .from("story_reactions")
      .select("story_id, user_id, reaction_type")
      .in("story_id", reactionStoryIds);
    reactions = (reactionData as ReactionRow[]) ?? [];
  }

  const enriched: FeedDisplayItem[] = [];

  for (const item of items) {
    if (item.canonicalType === "story") {
      const cached = existingItemsByKey?.get(item.dedupeKey);
      const storyDisplay = await enrichStoryItem(
        item,
        reactions,
        viewerUserId,
        cached?.kind === "story" ? cached : null
      );
      if (storyDisplay) enriched.push(storyDisplay);
      continue;
    }

    if (item.canonicalType === "prayer_video_response") {
      const cached = existingItemsByKey?.get(item.dedupeKey);
      const responseDisplay = await enrichVideoResponseItem(
        item,
        parentStories,
        authorNames,
        blockedSet,
        cached?.kind === "prayer_video_response" ? cached : null
      );
      if (responseDisplay) enriched.push(responseDisplay);
    }
  }

  return enriched;
}
