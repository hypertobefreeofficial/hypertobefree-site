import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("targets approximately 60% viewport visibility before playback", () => {
    const source = readFileSync(
      resolve(process.cwd(), "hooks/useViewportVideoAutoplay.ts"),
      "utf8"
    );

    expect(source).toContain("const PLAY_THRESHOLD = 0.6");
    expect(source).toContain("shouldLoad");
    expect(source).toContain("evaluatePlayback");
  });
});
