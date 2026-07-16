export const COMMUNITY_FEED_VISUAL_VALIDATION_QUERY = "fixture";

export const VISUAL_VALIDATION_PAGE_2_CURSOR =
  "visual-validation-fixture-page-2";

/**
 * Dev-only visual validation mode. In production builds Next inlines
 * NODE_ENV === "production", so ?fixture=1 has no effect for end users.
 */
export function isCommunityFeedVisualValidationEnabled(
  searchParams: Pick<URLSearchParams, "get"> | null | undefined
): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return (
    searchParams?.get(COMMUNITY_FEED_VISUAL_VALIDATION_QUERY) === "1"
  );
}
