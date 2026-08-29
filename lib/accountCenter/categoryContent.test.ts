import { describe, expect, it } from "vitest";
import {
  accountCenterCategoryContent,
  getAccountCenterCategoryItem,
} from "./categoryContent";

describe("accountCenterCategoryContent badges", () => {
  it("does not show a stale Soon badge on Saved Content", () => {
    const item = getAccountCenterCategoryItem(
      "content-management",
      "Saved Content"
    );

    expect(item).toBeDefined();
    expect(item?.badge).toBeUndefined();
  });

  it("does not show a stale Soon badge on Blocked Users", () => {
    const item = getAccountCenterCategoryItem("privacy-safety", "Blocked Users");

    expect(item).toBeDefined();
    expect(item?.badge).toBeUndefined();
  });

  it("keeps Soon badges on unfinished Account & Security items", () => {
    const unfinishedTitles = [
      "Change Email",
      "Change Password",
      "Two-Factor Authentication",
      "Active Sessions",
    ];

    unfinishedTitles.forEach((title) => {
      const item = getAccountCenterCategoryItem("account-security", title);
      expect(item?.badge).toBe("Soon");
    });
  });

  it("keeps Soon badges on other genuinely unfinished categories", () => {
    expect(
      getAccountCenterCategoryItem("privacy-safety", "Muted Users")?.badge
    ).toBe("Soon");
    expect(
      getAccountCenterCategoryItem("content-management", "Archived / Hidden Content")
        ?.badge
    ).toBe("Soon");
    expect(
      getAccountCenterCategoryItem("notifications", "Email Notifications")?.badge
    ).toBe("Soon");
  });

  it("exposes category hubs for Account Center navigation", () => {
    expect(Object.keys(accountCenterCategoryContent)).toEqual([
      "account-security",
      "privacy-safety",
      "notifications",
      "content-management",
      "support",
    ]);
  });
});
