import { prepareCreatorStudioForEditing, type CreatorStudioDesign } from "./creationCenter";

export type CreatorStudioRenderVariant =
  | "editor"
  | "preview"
  | "publish"
  | "feed"
  | "detail"
  | "shared";

/** Single entry point for preparing a design before any canvas/story render. */
export function resolveCreatorStudioDesignForRender(
  design: CreatorStudioDesign
): CreatorStudioDesign {
  if (design.layerStyles && Object.keys(design.layerStyles).length > 0) {
    return design;
  }

  return prepareCreatorStudioForEditing(design);
}

export function getCreatorStudioRenderSurfaceOptions(
  variant: CreatorStudioRenderVariant = "preview",
  compact = false
) {
  const isFeed = variant === "feed";
  const isPublishedView =
    isFeed || variant === "detail" || variant === "shared";
  const useCompactTypography = isFeed || compact || variant === "shared";
  const hideCallToAction = isPublishedView;

  let frameHeight = "min-h-[24rem] sm:min-h-[30rem] lg:min-h-[34rem]";
  if (compact) {
    frameHeight = "min-h-[13.5rem]";
  } else if (variant === "feed") {
    frameHeight = "min-h-[22rem] sm:min-h-[26rem]";
  } else if (
    variant === "detail" ||
    variant === "publish" ||
    variant === "shared"
  ) {
    frameHeight = "min-h-[min(68dvh,42rem)]";
  }

  return {
    variant,
    isFeed,
    isPublishedView,
    useCompactTypography,
    hideCallToAction,
    frameHeight,
  };
}
