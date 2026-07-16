import { describe, expect, it, vi } from "vitest";
import {
  COMMUNITY_FEED_VISUAL_VALIDATION_QUERY,
  isCommunityFeedVisualValidationEnabled,
} from "./visualValidationMode";

describe("isCommunityFeedVisualValidationEnabled", () => {
  it("returns false in production even when the query param is set", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(
      isCommunityFeedVisualValidationEnabled(
        new URLSearchParams(`${COMMUNITY_FEED_VISUAL_VALIDATION_QUERY}=1`)
      )
    ).toBe(false);
  });

  it("returns true in non-production when fixture=1 is present", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(
      isCommunityFeedVisualValidationEnabled(
        new URLSearchParams(`${COMMUNITY_FEED_VISUAL_VALIDATION_QUERY}=1`)
      )
    ).toBe(true);
  });

  it("returns false in non-production without the query param", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(
      isCommunityFeedVisualValidationEnabled(new URLSearchParams())
    ).toBe(false);
  });
});
