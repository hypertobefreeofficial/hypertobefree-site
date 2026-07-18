"use client";

import { Fragment, type ReactNode } from "react";
import CreatorStudioStoryRenderer from "../creation-center/CreatorStudioStoryRenderer";
import {
  isCreatorStudioFeedPost,
  readStoredCreatorStudioDesignFromStory,
} from "../../lib/creatorStudioMetadata";
import {
  feedMediaAspectClassName,
  getStoryFeedMediaAspect,
} from "../../lib/community-feed/feedMediaAspect";
import type { CreationCenterTemplateId } from "../../lib/creationCenter";
import type {
  FeedDisplayItem,
  FeedStoryDisplay,
} from "../../lib/community-feed/enrichFeedItems";
import FeedScrollVideoPreview from "./FeedScrollVideoPreview";
import CommunityFeedStoryItem from "./CommunityFeedStoryItem";
import VideoResponseFeedPost from "./VideoResponseFeedPost";
import {
  buildFaithResponsesHref,
} from "../../lib/responses/faithResponsesNavigation";
import { parentHrefForResponseContext } from "../../lib/responses/publicVideoResponseContext";
import type { CommunityFeedPostCallbacks } from "./types";
import styles from "../FreedomFeed.module.css";

type CaptionStyle =
  | "classic-caption"
  | "bold-center"
  | "bottom-banner"
  | "highlight-box"
  | "scripture-card"
  | "praise-glow"
  | "testimony-quote"
  | "minimal-white"
  | "black-outline"
  | "soft-gradient"
  | "elegant-script";

type CreationTemplateMetadata = {
  id: CreationCenterTemplateId | "generated-creator-studio";
  label: string;
  imagePath: string;
};

type FeedListItemProps = {
  feedItem: FeedDisplayItem;
  index: number;
  totalItems: number;
  callbacks: CommunityFeedPostCallbacks;
  postSeparator: ReactNode;
  shouldShowMiniReels: boolean;
  miniReelAnchorId: string;
  miniReelsSlot: ReactNode;
  isPrayerStory: (story: FeedStoryDisplay) => boolean;
  getCaptionStyle: (value: string | null) => CaptionStyle;
  getCreationTemplateMetadata: (value: unknown) => CreationTemplateMetadata | null;
  getCaptionAlign: (value: string | null) => "left" | "center" | "right" | undefined;
  getCaptionBackground: (
    value: string | null,
    style: CaptionStyle
  ) => "none" | "soft-pill" | "glass-blur" | "dark-banner" | "glow-box" | "scripture-card" | undefined;
  getCaptionColor: (value: string | null) => string | undefined;
  getCaptionFont: (value: string | null, style: CaptionStyle) => string | undefined;
  getCaptionSize: (value: string | null) => "small" | "medium" | "large" | "extra-large" | undefined;
  renderComposedFeedPostVisual: (props: {
    captionStyle: CaptionStyle;
    story: FeedStoryDisplay;
    template?: CreationTemplateMetadata | null;
  }) => ReactNode;
  renderComposedFeedPostButton: (props: {
    captionStyle: CaptionStyle;
    story: FeedStoryDisplay;
    template: CreationTemplateMetadata;
    onOpen: () => void;
  }) => ReactNode;
  renderCaptionOverlay: (props: {
    alignment?: "left" | "center" | "right";
    background?: string;
    color?: string;
    font?: string;
    overlayX?: number | null;
    overlayY?: number | null;
    size?: "small" | "medium" | "large" | "extra-large";
    style: CaptionStyle;
    text: string;
  }) => ReactNode;
};

export default function FeedListItem({
  feedItem,
  callbacks,
  postSeparator,
  shouldShowMiniReels,
  miniReelsSlot,
  isPrayerStory,
  getCaptionStyle,
  getCreationTemplateMetadata,
  getCaptionAlign,
  getCaptionBackground,
  getCaptionColor,
  getCaptionFont,
  getCaptionSize,
  renderComposedFeedPostVisual,
  renderComposedFeedPostButton,
  renderCaptionOverlay,
}: FeedListItemProps) {
  if (feedItem.kind === "prayer_video_response") {
    const responseMedia =
      feedItem.signed_video_url || feedItem.signed_thumbnail_url ? (
        <FeedScrollVideoPreview
          videoUrl={feedItem.signed_video_url}
          posterUrl={feedItem.signed_thumbnail_url}
          fallbackLabel="Video prayer"
          frameClassName={`${styles.mediaFrame} ${styles.mediaFramePortrait}`}
          ariaLabel={`Video response for ${feedItem.parentStoryTitle}`}
          onClick={() => {
            if (feedItem.parentStoryId) {
              window.location.href = buildFaithResponsesHref({
                parentStoryId: feedItem.parentStoryId,
                responseId: feedItem.id,
              });
            }
          }}
        />
      ) : (
        <div className={styles.mediaUnavailable}>Video unavailable right now.</div>
      );

    return (
      <Fragment key={feedItem.dedupeKey}>
        {postSeparator}
        <VideoResponseFeedPost
          item={feedItem}
          callbacks={callbacks}
          media={responseMedia}
          parentHref={
            feedItem.parentStoryId
              ? parentHrefForResponseContext(
                  feedItem.parentStoryId,
                  feedItem.parentResponseContext
                )
              : undefined
          }
        />
        {shouldShowMiniReels ? miniReelsSlot : null}
      </Fragment>
    );
  }

  const story = feedItem;
  const prayerStory = isPrayerStory(story);
  const captionStyle = getCaptionStyle(story.caption_style);
  const hasVideoMedia = Boolean(story.signed_video_url || story.video_url);
  const hasImageMedia = Boolean(story.signed_image_url);
  const overlayText = story.overlay_text?.trim() ?? "";
  const creationTemplate = getCreationTemplateMetadata(story.ai_suggestions);
  const creatorStudioDesign = readStoredCreatorStudioDesignFromStory(story);
  const showCreatorStudioDesignCard = isCreatorStudioFeedPost({
    aiSuggestions: story.ai_suggestions,
    creationMode: story.creation_mode,
    hasVideoMedia,
    hasImageMedia,
  });
  const showCreationTemplateCard = Boolean(
    creationTemplate &&
      story.story_text &&
      !hasVideoMedia &&
      !hasImageMedia &&
      !showCreatorStudioDesignCard
  );
  const showCreatorStudioCard = Boolean(
    showCreatorStudioDesignCard && creatorStudioDesign
  );
  const storyMediaAspect = getStoryFeedMediaAspect(story);
  const storyVideoFrameClass = feedMediaAspectClassName(storyMediaAspect, {
    auto: styles.mediaFrameAuto,
    portrait: `${styles.mediaFrame} ${styles.mediaFramePortrait}`,
    landscape: `${styles.mediaFrame} ${styles.mediaFrameLandscape}`,
  });

  const textOnly =
    Boolean(story.story_text) &&
    !showCreationTemplateCard &&
    !showCreatorStudioCard &&
    !hasVideoMedia &&
    !hasImageMedia;

  const showCaptionAfterMedia =
    Boolean(story.story_text) && hasVideoMedia && !showCreatorStudioCard;

  let media: ReactNode;

  if (story.signed_image_url && !showCreatorStudioCard) {
    media = (
      <button
        type="button"
        onClick={() => callbacks.onOpenStory(story)}
        className={`${styles.mediaOpenButton} ${styles.mediaBleed}`}
        aria-label="Open post"
      >
        <div className={styles.mediaFrameAuto}>
          {renderComposedFeedPostVisual({ captionStyle, story })}
        </div>
      </button>
    );
  } else if (showCreatorStudioCard && creatorStudioDesign) {
    media = (
      <button
        type="button"
        onClick={() => callbacks.onOpenStory(story)}
        className={`${styles.mediaOpenButton} ${styles.mediaBleed}`}
        aria-label="Open Creator Studio post"
      >
        <div className={styles.mediaFrameAuto}>
          <CreatorStudioStoryRenderer
            design={creatorStudioDesign}
            photoPreviewUrl={story.signed_image_url}
            videoPreviewUrl={story.signed_video_url ?? story.video_url}
            variant="feed"
          />
        </div>
      </button>
    );
  } else if (showCreationTemplateCard && creationTemplate) {
    media = (
      <div className={styles.mediaBleed}>
        {renderComposedFeedPostButton({
          captionStyle,
          story,
          template: creationTemplate,
          onOpen: () => callbacks.onOpenStory(story),
        })}
      </div>
    );
  } else if (story.signed_video_url && !showCreatorStudioCard) {
    media = (
      <FeedScrollVideoPreview
        videoUrl={story.signed_video_url}
        posterUrl={story.signed_thumbnail_url}
        fallbackLabel={prayerStory ? "Video prayer" : "Video testimony"}
        frameClassName={storyVideoFrameClass}
        ariaLabel="Open video in Video Feed"
        onClick={() => callbacks.onOpenStory(story)}
        overlay={
          overlayText
            ? renderCaptionOverlay({
                alignment: getCaptionAlign(story.caption_align),
                background: getCaptionBackground(
                  story.caption_background,
                  captionStyle
                ),
                color: getCaptionColor(story.caption_color),
                font: getCaptionFont(story.caption_font, captionStyle),
                overlayX: story.overlay_x,
                overlayY: story.overlay_y,
                size: getCaptionSize(story.caption_size),
                style: captionStyle,
                text: overlayText,
              })
            : undefined
        }
      />
    );
  } else if (!story.signed_video_url && story.video_url) {
    media = (
      <button
        type="button"
        onClick={() => callbacks.onOpenStory(story)}
        className={`${styles.mediaOpenButton} w-full`}
      >
        <div className={styles.mediaUnavailable}>
          Video found, but the secure video link could not be created. Tap to
          open in Video Feed.
        </div>
      </button>
    );
  }

  return (
    <Fragment key={story.dedupeKey}>
      {postSeparator}
      <CommunityFeedStoryItem
        story={story}
        callbacks={callbacks}
        media={media}
        showCaptionAfterMedia={showCaptionAfterMedia}
        textOnly={textOnly}
      />
      {shouldShowMiniReels ? miniReelsSlot : null}
    </Fragment>
  );
}
