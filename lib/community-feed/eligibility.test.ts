import { describe, expect, it } from "vitest";
import {
  isStoryFeedEligible,
  isVideoResponseFeedEligible,
} from "./eligibility";
import { buildStory, buildVideoResponse } from "./testFixtures";

describe("community feed eligibility", () => {
  it("includes approved public stories", () => {
    expect(
      isStoryFeedEligible(buildStory(), { removedAtFilterAvailable: true })
    ).toBe(true);
  });

  it("excludes pending stories", () => {
    expect(
      isStoryFeedEligible(buildStory({ status: "pending" }), {
        removedAtFilterAvailable: true,
      })
    ).toBe(false);
  });

  it("excludes rejected stories", () => {
    expect(
      isStoryFeedEligible(buildStory({ status: "rejected" }), {
        removedAtFilterAvailable: true,
      })
    ).toBe(false);
  });

  it("excludes removed stories via removed_at", () => {
    expect(
      isStoryFeedEligible(
        buildStory({ removed_at: "2026-07-14T10:00:00.000Z" }),
        { removedAtFilterAvailable: true }
      )
    ).toBe(false);
  });

  it("excludes stories when removed_at cannot be verified (fail closed)", () => {
    expect(
      isStoryFeedEligible(buildStory(), { removedAtFilterAvailable: false })
    ).toBe(false);
  });

  it("excludes non-approved statuses used as private/restricted stand-ins", () => {
    for (const status of ["submitted", "removed", "needs_review"]) {
      expect(
        isStoryFeedEligible(buildStory({ status }), {
          removedAtFilterAvailable: true,
        })
      ).toBe(false);
    }
  });

  it("includes approved public video responses", () => {
    expect(
      isVideoResponseFeedEligible(buildVideoResponse(), {
        removedAtFilterAvailable: true,
      })
    ).toBe(true);
  });

  it("excludes non-approved or removed responses", () => {
    expect(
      isVideoResponseFeedEligible(buildVideoResponse({ status: "pending" }), {
        removedAtFilterAvailable: true,
      })
    ).toBe(false);
    expect(
      isVideoResponseFeedEligible(buildVideoResponse({ status: "rejected" }), {
        removedAtFilterAvailable: true,
      })
    ).toBe(false);
    expect(
      isVideoResponseFeedEligible(buildVideoResponse({ status: "removed" }), {
        removedAtFilterAvailable: true,
      })
    ).toBe(false);
    expect(
      isVideoResponseFeedEligible(
        buildVideoResponse({ removed_at: "2026-07-14T10:00:00.000Z" }),
        { removedAtFilterAvailable: true }
      )
    ).toBe(false);
  });

  it("excludes blocked story authors and responders", () => {
    const blocked = new Set(["author-1"]);
    expect(
      isStoryFeedEligible(buildStory({ user_id: "author-1" }), {
        blockedUserIds: blocked,
        removedAtFilterAvailable: true,
      })
    ).toBe(false);

    expect(
      isVideoResponseFeedEligible(buildVideoResponse({ user_id: "author-1" }), {
        blockedUserIds: blocked,
        removedAtFilterAvailable: true,
      })
    ).toBe(false);
  });

  it("excludes demo stories when demo isolation is active", () => {
    expect(
      isStoryFeedEligible(buildStory({ is_demo: true }), {
        removedAtFilterAvailable: true,
        demoIsolationActive: true,
      })
    ).toBe(false);
    expect(
      isStoryFeedEligible(buildStory({ is_demo: false }), {
        removedAtFilterAvailable: true,
        demoIsolationActive: true,
      })
    ).toBe(true);
  });
});
