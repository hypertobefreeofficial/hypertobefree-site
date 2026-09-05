import { describe, expect, it } from "vitest";
import {
  getAnonymousAuthorProfile,
  getDeletedUserAuthorProfile,
  resolveAuthorPresentation,
} from "./authorProfiles";

describe("resolveAuthorPresentation", () => {
  it("returns Deleted User presentation for null author ids", () => {
    const presentation = resolveAuthorPresentation(null, new Map());
    expect(presentation.displayName).toBe("Deleted User");
    expect(presentation.isAnonymous).toBe(true);
    expect(presentation.avatarUrl).toBeNull();
  });

  it("returns Deleted User presentation for undefined author ids", () => {
    const presentation = resolveAuthorPresentation(undefined, new Map());
    expect(presentation).toEqual(getDeletedUserAuthorProfile());
  });

  it("preserves anonymous author profile when forceAnonymous is set", () => {
    const presentation = resolveAuthorPresentation("user-1", new Map(), {
      forceAnonymous: true,
    });
    expect(presentation).toEqual(getDeletedUserAuthorProfile());
    expect(presentation).not.toEqual(getAnonymousAuthorProfile());
  });
});
