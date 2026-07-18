import { describe, expect, it } from "vitest";
import { canManageOtherUserContent } from "./feedOverflowPermissions";

describe("canManageOtherUserContent", () => {
  it("allows report/block for another user's content", () => {
    expect(canManageOtherUserContent("viewer-1", "author-2")).toBe(true);
  });

  it("blocks self-targeting", () => {
    expect(canManageOtherUserContent("viewer-1", "viewer-1")).toBe(false);
  });

  it("allows menu actions for signed-out viewers when an author exists", () => {
    expect(canManageOtherUserContent(null, "author-2")).toBe(true);
  });
});
