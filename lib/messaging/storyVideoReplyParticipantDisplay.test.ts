import { describe, expect, it } from "vitest";
import { getDeletedUserAuthorProfile } from "../prayer-connect/authorProfiles";

describe("story_video_replies detached participant display", () => {
  it("shows Deleted User for NULL participant without profile lookup", () => {
    const presentation = getDeletedUserAuthorProfile();
    expect(presentation.displayName).toBe("Deleted User");
    expect(presentation.avatarUrl).toBeNull();
    expect(presentation.isAnonymous).toBe(true);
  });
});
