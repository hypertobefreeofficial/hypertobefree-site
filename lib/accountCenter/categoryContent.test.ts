import { readFileSync } from "node:fs";
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
    const unfinishedTitles = ["Two-Factor Authentication", "Active Sessions"];

    unfinishedTitles.forEach((title) => {
      const item = getAccountCenterCategoryItem("account-security", title);
      expect(item?.badge).toBe("Soon");
    });
  });

  it("does not show a stale Soon badge on Change Password", () => {
    const item = getAccountCenterCategoryItem(
      "account-security",
      "Change Password"
    );

    expect(item).toBeDefined();
    expect(item?.badge).toBeUndefined();
  });

  it("does not show a stale Soon badge on Change Email", () => {
    const item = getAccountCenterCategoryItem("account-security", "Change Email");

    expect(item).toBeDefined();
    expect(item?.badge).toBeUndefined();
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

  it("keeps unfinished Account & Security routes unchanged", () => {
    const sectionPageSource = readFileSync(
      "app/profile/[section]/page.tsx",
      "utf8"
    );

    expect(sectionPageSource).toContain('if (section === "account-info")');
    expect(sectionPageSource).toContain("<AccountInfoSection />");
    expect(sectionPageSource).toContain('if (section === "change-password")');
    expect(sectionPageSource).toContain("<ChangePasswordSection />");
    expect(sectionPageSource).toContain('if (section === "change-email")');
    expect(sectionPageSource).toContain("<ChangeEmailSection />");
  });

  it("no longer renders a placeholder for change-email", () => {
    const sectionPageSource = readFileSync(
      "app/profile/[section]/page.tsx",
      "utf8"
    );

    expect(sectionPageSource).not.toContain(
      "Email change tools will be added here"
    );
  });
});
