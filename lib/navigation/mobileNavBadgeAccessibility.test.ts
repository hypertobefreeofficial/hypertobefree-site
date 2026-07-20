import { describe, expect, it } from "vitest";
import { buildMobileNavItemAriaLabel } from "./mobileNavBadgeAccessibility";

describe("mobileNavBadgeAccessibility", () => {
  it("includes unread counts in Prayer and Journey labels", () => {
    expect(
      buildMobileNavItemAriaLabel("/prayer", "Prayer", 3, true)
    ).toBe("Prayer, 3 unread");
    expect(
      buildMobileNavItemAriaLabel("/journey", "Journey", 1, true)
    ).toBe("Journey, 1 unread conversation");
    expect(
      buildMobileNavItemAriaLabel("/journey", "Journey", 4, true)
    ).toBe("Journey, 4 unread conversations");
  });

  it("uses 99+ in accessible labels", () => {
    expect(
      buildMobileNavItemAriaLabel("/prayer", "Prayer", 120, true)
    ).toBe("Prayer, 99+ unread");
  });

  it("falls back to plain labels when badges are hidden", () => {
    expect(
      buildMobileNavItemAriaLabel("/prayer", "Prayer", 5, false)
    ).toBe("Prayer");
    expect(buildMobileNavItemAriaLabel("/feed", "Feed", 0, true)).toBe("Feed");
  });
});
