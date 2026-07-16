import { creationCenterImages, prepareCreatorStudioForEditing } from "../creationCenter";
import type {
  FeedDisplayItem,
  FeedStoryDisplay,
  FeedVideoResponseDisplay,
} from "./enrichFeedItems";

export const FIXTURE_VIEWER_USER_ID = "fixture-viewer-user";

const FIXTURE_MEDIA = {
  landscapePhoto: "/images/feed/freedom-feed-composer-wide-v2.webp",
  portraitPoster: "/images/journey/01-journey-hero-mobile.png",
  landscapePoster: "/images/feed/freedom-feed-hero-final.webp",
  praisePoster: "/images/journey/04-keep-going-mobile.png",
  praisePortraitPoster: "/images/journey/01-journey-hero-mobile.png",
  responsePoster: "/images/journey/03-reflection-room-mobile.png",
} as const;

const FIXTURE_VIDEO_SAMPLE =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

function storyFixture(
  overrides: Partial<FeedStoryDisplay> &
    Pick<FeedStoryDisplay, "id" | "dedupeKey" | "story_type" | "story_text" | "name">
): FeedStoryDisplay {
  return {
    kind: "story",
    user_id: "fixture-user-1",
    location: "Phoenix, Arizona",
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
    created_at: "2026-07-14T18:00:00.000Z",
    prayer_status: "active",
    answered_at: null,
    answered_text: null,
    creation_mode: "guided",
    ai_suggestions: null,
    signed_image_url: null,
    signed_video_url: null,
    signed_thumbnail_url: null,
    reaction_counts: {
      amen: 4,
      praise_god: 3,
      encouraged: 2,
      praying: 0,
    },
    user_reactions: [],
    ...overrides,
  };
}

function responseFixture(
  overrides: Partial<FeedVideoResponseDisplay> &
    Pick<
      FeedVideoResponseDisplay,
      "id" | "dedupeKey" | "parentStoryTitle" | "parentStoryAuthor"
    >
): FeedVideoResponseDisplay {
  return {
    kind: "prayer_video_response",
    user_id: "fixture-responder-1",
    name: "James R.",
    location: "Dallas, Texas",
    video_url: null,
    signed_video_url: FIXTURE_VIDEO_SAMPLE,
    signed_thumbnail_url: FIXTURE_MEDIA.responsePoster,
    created_at: "2026-07-14T10:30:00.000Z",
    parentStoryId: "fixture-prayer-parent",
    parentStoryUserId: "fixture-user-2",
    ...overrides,
  };
}

const creatorStudioDesign = prepareCreatorStudioForEditing({
  id: "fixture-creator-studio-1",
  studioPath: "create-design",
  sourceMode: "upload-photo",
  title: "He makes all things new",
  overlayText: "He makes all things new",
  caption: "Every detail reminded us that renewal is still possible.",
  category: "testimony",
  topic: "renewal",
  templateId: "none",
  styleMood: "hopeful",
  layoutType: "text-over-image-testimony",
  scriptureSuggestion: "",
  suggestedPostFormat: "photo",
});

/** First page — representative post variants for the real FreedomFeed render path. */
export function getCommunityFeedVisualValidationFixturesPage1(): FeedDisplayItem[] {
  return [
    storyFixture({
      id: "fixture-text-testimony",
      dedupeKey: "story:fixture-text-testimony",
      name: "Elena M.",
      story_type: "Testimony",
      story_text:
        "God met me in a season of waiting and proved faithful again.",
      created_at: "2026-07-14T18:00:00.000Z",
    }),
    storyFixture({
      id: "fixture-landscape-photo",
      dedupeKey: "story:fixture-landscape-photo",
      name: "Maria K.",
      story_type: "Testimony",
      story_text:
        "The trail reminded us that we are never walking alone.",
      signed_image_url: FIXTURE_MEDIA.landscapePhoto,
      created_at: "2026-07-14T17:45:00.000Z",
      ai_suggestions: { feedMediaAspect: "auto" },
    }),
    storyFixture({
      id: "fixture-portrait-video",
      dedupeKey: "story:fixture-portrait-video",
      name: "Daniel P.",
      story_type: "Testimony",
      story_text:
        "Sharing how peace arrived in the middle of the storm.",
      signed_video_url: FIXTURE_VIDEO_SAMPLE,
      signed_thumbnail_url: FIXTURE_MEDIA.portraitPoster,
      overlay_text: "Peace in the storm",
      caption_style: "bold-center",
      created_at: "2026-07-14T17:30:00.000Z",
      ai_suggestions: { feedMediaAspect: "portrait" },
    }),
    storyFixture({
      id: "fixture-prayer-request",
      dedupeKey: "story:fixture-prayer-request",
      name: "Hannah L.",
      story_type: "Prayer Request",
      story_text:
        "Please pray for my daughter's courage as she starts a new school.",
      prayer_status: "active",
      reaction_counts: {
        amen: 0,
        praise_god: 0,
        encouraged: 0,
        praying: 12,
      },
      created_at: "2026-07-14T17:15:00.000Z",
    }),
    storyFixture({
      id: "fixture-template-card",
      dedupeKey: "story:fixture-template-card",
      name: "Noah S.",
      story_type: "Testimony",
      story_text:
        "The Word anchored us when everything felt uncertain.",
      ai_suggestions: {
        selectedTemplate: {
          id: "scripture-woods",
          label: "Scripture Woods",
          imagePath: creationCenterImages.scriptureWoods,
        },
      },
      created_at: "2026-07-14T17:00:00.000Z",
    }),
    storyFixture({
      id: "fixture-creator-studio",
      dedupeKey: "story:fixture-creator-studio",
      name: "Avery T.",
      story_type: "Testimony",
      story_text: "He makes all things new in every season of our lives.",
      creation_mode: "creator-studio",
      signed_image_url: FIXTURE_MEDIA.landscapePhoto,
      ai_suggestions: {
        creation_mode: "creator-studio",
        creatorStudioDesign,
        feedMediaAspect: "auto",
      },
      created_at: "2026-07-14T16:45:00.000Z",
    }),
    storyFixture({
      id: "fixture-praise-video",
      dedupeKey: "story:fixture-praise-video",
      name: "Jordan C.",
      story_type: "Praise Report",
      story_text:
        "Praise God—the doctor gave us a report we had been praying for.",
      signed_video_url: FIXTURE_VIDEO_SAMPLE,
      signed_thumbnail_url: FIXTURE_MEDIA.landscapePoster,
      created_at: "2026-07-14T16:30:00.000Z",
      ai_suggestions: { feedMediaAspect: "landscape" },
      reaction_counts: {
        amen: 18,
        praise_god: 12,
        encouraged: 6,
        praying: 0,
      },
    }),
    storyFixture({
      id: "fixture-praise-portrait-video",
      dedupeKey: "story:fixture-praise-portrait-video",
      name: "Leah T.",
      story_type: "Praise Report",
      story_text:
        "Praise God for open doors we never expected this season.",
      signed_video_url: FIXTURE_VIDEO_SAMPLE,
      signed_thumbnail_url: FIXTURE_MEDIA.praisePortraitPoster,
      created_at: "2026-07-14T16:20:00.000Z",
      ai_suggestions: { feedMediaAspect: "portrait" },
      reaction_counts: {
        amen: 9,
        praise_god: 7,
        encouraged: 4,
        praying: 0,
      },
    }),
  ];
}

/** Second page — append-only items for Load-more validation. */
export function getCommunityFeedVisualValidationFixturesPage2(): FeedDisplayItem[] {
  return [
    storyFixture({
      id: "fixture-answered-prayer",
      dedupeKey: "story:fixture-answered-prayer",
      name: "Ruth A.",
      story_type: "Prayer Request",
      story_text:
        "Please pray for my daughter's procedure tomorrow morning.",
      prayer_status: "answered",
      answered_at: "2026-07-14T12:00:00.000Z",
      answered_text:
        "Praise God—the procedure went perfectly and she is resting peacefully.",
      reaction_counts: {
        amen: 0,
        praise_god: 0,
        encouraged: 0,
        praying: 18,
      },
      created_at: "2026-07-14T16:00:00.000Z",
    }),
    storyFixture({
      id: "fixture-prayer-owner",
      dedupeKey: "story:fixture-prayer-owner",
      name: "Sarah W.",
      user_id: FIXTURE_VIEWER_USER_ID,
      story_type: "Prayer Request",
      story_text:
        "Please pray for wisdom as we care for my aging parents.",
      prayer_status: "active",
      reaction_counts: {
        amen: 0,
        praise_god: 0,
        encouraged: 0,
        praying: 6,
      },
      created_at: "2026-07-14T15:45:00.000Z",
    }),
    responseFixture({
      id: "fixture-video-response",
      dedupeKey: "prayer_video_response:fixture-video-response",
      name: "James R.",
      parentStoryTitle: "healing for my mom",
      parentStoryAuthor: "Hannah L.",
    }),
  ];
}

export function getCommunityFeedVisualValidationFixtures(
  page: 1 | 2
): FeedDisplayItem[] {
  return page === 1
    ? getCommunityFeedVisualValidationFixturesPage1()
    : getCommunityFeedVisualValidationFixturesPage2();
}
