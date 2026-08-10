export type CreatorStudioStoryRendererVariant =
  | "preview"
  | "feed"
  | "detail"
  | "publish";

export function shouldUseCreatorStudioFeedVideoAutoplay(
  variant: CreatorStudioStoryRendererVariant
) {
  return variant === "feed" || variant === "detail";
}

export function shouldAutoplayCreatorStudioStoryVideo(
  variant: CreatorStudioStoryRendererVariant
) {
  return (
    shouldUseCreatorStudioFeedVideoAutoplay(variant) || variant === "publish"
  );
}

export function getCreatorStudioStoryVideoElementProps(
  variant: CreatorStudioStoryRendererVariant
) {
  const autoplay = shouldAutoplayCreatorStudioStoryVideo(variant);

  return {
    autoPlay: autoplay,
    muted: true,
    loop: true,
    playsInline: true,
    controls: false,
    preload: "metadata" as const,
    useFeedPreviewAutoplay: shouldUseCreatorStudioFeedVideoAutoplay(variant),
  };
}

export function shouldShowCreatorStudioVideoPoster(options: {
  videoPosterUrl?: string | null;
  videoReady: boolean;
  isPlaying: boolean;
}) {
  return Boolean(options.videoPosterUrl) && !options.videoReady && !options.isPlaying;
}
