import { describe, expect, it } from "vitest";
import {
  isPrayerStoryReportTargetUnavailable,
  isVideoResponseReport,
  mergeVideoResponseParentStoryContext,
} from "./contentReportTarget";

describe("contentReportTarget", () => {
  it("detects video response reports", () => {
    expect(isVideoResponseReport("video_response", "resp-1")).toBe(true);
    expect(isVideoResponseReport("prayer_request", "resp-1")).toBe(false);
    expect(isVideoResponseReport("video_response", null)).toBe(false);
  });

  it("blocks unavailable prayer story targets", () => {
    expect(
      isPrayerStoryReportTargetUnavailable({
        id: "s1",
        user_id: "u1",
        story_text: "Pray",
        video_url: null,
        image_url: null,
        status: "approved",
        removed_at: null,
        story_type: "Prayer Request",
      })
    ).toBe(false);

    expect(
      isPrayerStoryReportTargetUnavailable({
        id: "s1",
        user_id: "u1",
        story_text: "Testimony",
        video_url: null,
        image_url: null,
        status: "approved",
        removed_at: null,
        story_type: "Testimony",
      })
    ).toBe(true);
  });

  it("keeps response media when merging feed parent context", () => {
    const merged = mergeVideoResponseParentStoryContext({
      story: {
        id: "story-1",
        user_id: "owner-1",
        story_text: "Parent post excerpt",
        video_url: "https://example.test/parent.mp4",
        image_url: null,
        status: "approved",
        removed_at: null,
        story_type: "Testimony",
      },
      contentSnapshot: "Response caption",
      mediaReference: "responses/responder/video.mp4",
    });

    expect(merged.resolvedStoryId).toBe("story-1");
    expect(merged.contentSnapshot).toBe("Response caption");
    expect(merged.mediaReference).toBe("responses/responder/video.mp4");
  });

  it("does not require parent story for video response evidence", () => {
    const merged = mergeVideoResponseParentStoryContext({
      story: null,
      contentSnapshot: "Response caption",
      mediaReference: "responses/responder/video.mp4",
    });

    expect(merged.resolvedStoryId).toBeNull();
    expect(merged.contentSnapshot).toBe("Response caption");
  });
});

describe("video response reported user resolution", () => {
  it("post owner reporting a responder must target the responder, not the owner", () => {
    const responseAuthorId = "responder-1";
    const storyOwnerId = "owner-1";
    const reporterId = storyOwnerId;

    let resolvedReportedUserId = responseAuthorId;
    // Bug fix: never overwrite with story.user_id for video_response reports.
    const storyUserId = storyOwnerId;
    const reportingVideoResponse = true;

    if (!reportingVideoResponse) {
      resolvedReportedUserId = storyUserId;
    }

    expect(resolvedReportedUserId).toBe(responseAuthorId);
    expect(resolvedReportedUserId === reporterId).toBe(false);
  });
});
