import fs from "fs";
import path from "path";
import { test, expect } from "@playwright/test";
import { authDir } from "../../playwright.config";
import { primePrayerPage } from "../prayer/auth-helpers";

const FIXTURE_FEED = "/feed?fixture=1";
const OWNER_AUTH = path.join(authDir, "owner.json");

function desktopNav(page: import("@playwright/test").Page) {
  return page.locator("nav.logged-in-desktop-nav");
}

function mobileBottomNav(page: import("@playwright/test").Page) {
  return page.locator("nav.logged-in-bottom-nav");
}

async function assertClearsDesktopNav(
  page: import("@playwright/test").Page,
  locator: import("@playwright/test").Locator
) {
  await expect(desktopNav(page)).toBeVisible();
  await expect(locator).toBeVisible();
  const navBox = await desktopNav(page).boundingBox();
  const targetBox = await locator.boundingBox();
  expect(navBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  if (navBox && targetBox) {
    expect(targetBox.y).toBeGreaterThanOrEqual(navBox.y + navBox.height - 4);
  }
}

async function openDesktopFeed(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(FIXTURE_FEED, { waitUntil: "domcontentloaded" });
  await page.locator("#stories").waitFor({ state: "visible" });
}

async function openDesktopPrayer(page: import("@playwright/test").Page) {
  await primePrayerPage(page, { useMock: true });
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/prayer", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(
    () => !document.querySelector("main [aria-busy='true']"),
    null,
    { timeout: 30000 }
  );
}

test.describe("Desktop app shell alignment", () => {
  test("/feed content clears the desktop nav", async ({ page }) => {
    await openDesktopFeed(page);
    await assertClearsDesktopNav(page, page.locator("#stories"));
  });

  test("/prayer title clears the desktop nav", async ({ page }) => {
    await openDesktopPrayer(page);
    await assertClearsDesktopNav(
      page,
      page.locator("#prayer-page-title")
    );
  });

  test("/prayer action buttons clear the desktop nav", async ({ page }) => {
    await openDesktopPrayer(page);
    await assertClearsDesktopNav(
      page,
      page.getByRole("button", { name: /How It Works/i })
    );
    await assertClearsDesktopNav(
      page,
      page.getByRole("button", { name: /Post a Prayer Request/i })
    );
  });

  test("/search controls clear the desktop nav when authenticated", async ({
    browser,
  }) => {
    test.skip(!fs.existsSync(OWNER_AUTH), "Owner auth storage unavailable.");
    const context = await browser.newContext({
      storageState: OWNER_AUTH,
      viewport: { width: 1024, height: 900 },
    });
    const page = await context.newPage();
    await page.goto("/search", { waitUntil: "domcontentloaded" });
    await assertClearsDesktopNav(
      page,
      page.getByRole("heading", { name: /Find videos and testimonies/i })
    );
    await assertClearsDesktopNav(
      page,
      page.getByPlaceholder(/Search videos, testimonies/i)
    );
    await context.close();
  });

  test("/journey controls clear the desktop nav when authenticated", async ({
    browser,
  }) => {
    test.skip(!fs.existsSync(OWNER_AUTH), "Owner auth storage unavailable.");
    const context = await browser.newContext({
      storageState: OWNER_AUTH,
      viewport: { width: 1024, height: 900 },
    });
    const page = await context.newPage();
    await page.goto("/journey", { waitUntil: "domcontentloaded" });
    await assertClearsDesktopNav(
      page,
      page.getByRole("link", { name: /HTBF/i }).first()
    );
    await context.close();
  });

  test("/profile header clears the desktop nav when authenticated", async ({
    browser,
  }) => {
    test.skip(!fs.existsSync(OWNER_AUTH), "Owner auth storage unavailable.");
    const context = await browser.newContext({
      storageState: OWNER_AUTH,
      viewport: { width: 1024, height: 900 },
    });
    const page = await context.newPage();
    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    await assertClearsDesktopNav(page, page.getByRole("link", { name: "HTBF" }));
    await context.close();
  });

  test("/profile Upload New Video clears the desktop nav when authenticated", async ({
    browser,
  }) => {
    test.skip(!fs.existsSync(OWNER_AUTH), "Owner auth storage unavailable.");
    const context = await browser.newContext({
      storageState: OWNER_AUTH,
      viewport: { width: 1024, height: 900 },
    });
    const page = await context.newPage();
    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => !document.body.textContent?.includes("Loading your profile"),
      null,
      { timeout: 30000 }
    );
    const upload = page.getByRole("link", { name: /Upload New Video/i });
    await expect(upload).toBeVisible({ timeout: 15000 });
    await assertClearsDesktopNav(page, upload);
    await context.close();
  });

  test("sticky Journey header sits beneath global nav when authenticated", async ({
    browser,
  }) => {
    test.skip(!fs.existsSync(OWNER_AUTH), "Owner auth storage unavailable.");
    const context = await browser.newContext({
      storageState: OWNER_AUTH,
      viewport: { width: 1024, height: 900 },
    });
    const page = await context.newPage();
    await page.goto("/journey", { waitUntil: "domcontentloaded" });

    const header = page.locator("header").first();
    await header.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(300);

    const navBox = await desktopNav(page).boundingBox();
    const headerBox = await header.boundingBox();
    expect(navBox).not.toBeNull();
    expect(headerBox).not.toBeNull();
    if (navBox && headerBox) {
      expect(headerBox.y).toBeGreaterThanOrEqual(navBox.y + navBox.height - 4);
    }
    await context.close();
  });

  test("mobile feed header is hidden on desktop", async ({ page }) => {
    await openDesktopFeed(page);
    await expect(page.getByText("FEED", { exact: true })).toBeHidden();
  });

  test("only one desktop nav is visible at 1024px", async ({ page }) => {
    await openDesktopFeed(page);
    await expect(desktopNav(page)).toHaveCount(1);
  });

  for (const width of [1024, 1440]) {
    test(`mobile bottom nav is absent at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(FIXTURE_FEED, { waitUntil: "domcontentloaded" });
      await expect(mobileBottomNav(page)).toBeHidden();
    });
  }

  for (const width of [390, 430]) {
    test(`mobile bottom nav remains at ${width}px`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        isMobile: true,
      });
      const page = await context.newPage();
      await page.goto(FIXTURE_FEED, { waitUntil: "domcontentloaded" });
      await expect(mobileBottomNav(page)).toBeVisible();
      await context.close();
    });
  }

  test("feed column is wider than 760px but within 820px at 1440px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(FIXTURE_FEED, { waitUntil: "domcontentloaded" });
    await page.locator("#stories").waitFor({ state: "visible" });

    const feedColumnWidth = await page.evaluate(() => {
      const stories = document.getElementById("stories");
      const column = stories?.querySelector(":scope > div > div");
      return column?.getBoundingClientRect().width ?? 0;
    });

    expect(feedColumnWidth).toBeGreaterThan(760);
    expect(feedColumnWidth).toBeLessThanOrEqual(820);
  });

  test("prayer workspace remains wider than the feed column at 1440px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(FIXTURE_FEED, { waitUntil: "domcontentloaded" });
    await page.locator("#stories").waitFor({ state: "visible" });
    const feedWidth = await page.evaluate(() => {
      const stories = document.getElementById("stories");
      const column = stories?.querySelector(":scope > div > div");
      return column?.getBoundingClientRect().width ?? 0;
    });

    await openDesktopPrayer(page);
    const prayerWidth = await page.evaluate(() => {
      const canvas = document.querySelector("main");
      return canvas?.getBoundingClientRect().width ?? 0;
    });

    expect(feedWidth).toBeGreaterThan(760);
    expect(prayerWidth).toBeGreaterThan(feedWidth);
  });

  test("shared desktop shell alignment uses one nav inner width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(FIXTURE_FEED, { waitUntil: "domcontentloaded" });
    await page.locator("#stories").waitFor({ state: "visible" });

    const shellMax = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--app-desktop-shell-max")
        .trim()
    );
    expect(shellMax).toBe("80rem");

    const navInnerWidth = await page.evaluate(() => {
      const inner = document.querySelector(
        "nav.logged-in-desktop-nav .app-desktop-shell-inner"
      );
      return inner?.getBoundingClientRect().width ?? 0;
    });
    expect(navInnerWidth).toBeGreaterThan(1180);
    expect(navInnerWidth).toBeLessThanOrEqual(1280);
  });

  test("logged-in app shell applies desktop top padding", async ({ page }) => {
    await openDesktopFeed(page);
    const paddingTop = await page.evaluate(() => {
      const shell = document.querySelector(".logged-in-app-shell");
      return shell ? parseFloat(getComputedStyle(shell).paddingTop) : 0;
    });
    expect(paddingTop).toBeGreaterThanOrEqual(50);
  });

  for (const width of [1024, 1280, 1440]) {
    test(`no horizontal overflow at ${width}px on feed`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(FIXTURE_FEED, { waitUntil: "domcontentloaded" });
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1
      );
      expect(overflow).toBe(true);
    });
  }

  test("no written-comment composer exists on fixture feed", async ({
    page,
  }) => {
    await openDesktopFeed(page);
    await expect(page.getByPlaceholder(/write a comment/i)).toHaveCount(0);
  });

  test("backend provenance remains absent on fixture feed", async ({ page }) => {
    await openDesktopFeed(page);
    await expect(page.getByText(/originSurface|dedupeKey|fixture-user/i)).toHaveCount(
      0
    );
  });
});
