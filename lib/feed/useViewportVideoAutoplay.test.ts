import { describe, expect, it } from "vitest";
import {
  pauseAllFeedPreviewVideos,
  resumeFeedVideoAutoplay,
  suspendFeedVideoAutoplay,
} from "../../hooks/useViewportVideoAutoplay";

describe("feed viewport video autoplay coordinator", () => {
  it("exports suspend and resume controls for modal focus", () => {
    expect(typeof suspendFeedVideoAutoplay).toBe("function");
    expect(typeof resumeFeedVideoAutoplay).toBe("function");
    expect(typeof pauseAllFeedPreviewVideos).toBe("function");
  });
});
