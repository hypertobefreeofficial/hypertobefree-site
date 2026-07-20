import fs from "fs";
import path from "path";
import { mkdir } from "fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { authDir } from "../../playwright.config";

const FIXTURE_FEED = "/feed?fixture=1";
const VIDEO_FIXTURE = "/video-feed?fixture=1";
const VIDEOS_FIXTURE = "/videos?fixture=1";
const OWNER_AUTH = path.join(authDir, "owner.json");
const SCREENSHOT_DIR = path.resolve(".screenshots/mobile-nav-badges-final");

const NAV_DESTINATIONS = [
  "Feed",
  "Videos",
  "Prayer",
  "Journey",
  "Search",
  "Profile",
] as const;

type BadgeOverride = {
  prayerCount?: number;
  inboxCount?: number;
  isLoading?: boolean;
  static?: boolean;
};

async function installBadgeOverride(page: Page, override: BadgeOverride) {
  await page.addInitScript((value) => {
    window.sessionStorage.setItem("htbf-mobile-splash-shown", "true");
    window.__HTBF_MOBILE_NAV_BADGE_TEST__ = value;
  }, { static: true, ...override });
}

async function installDiagnostics(page: Page) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("htbf-mobile-splash-shown", "true");
    window.__HTBF_MOBILE_NAV_BADGE_DIAG__ = {
      authLookups: 0,
      channelCreates: 0,
      channelRemoves: 0,
      fetchCalls: 0,
      activeChannelName: null,
      providerMounts: 0,
    };
  });
}

function mobileBottomNav(page: Page) {
  return page.locator("nav.logged-in-bottom-nav");
}

function primaryBottomNav(page: Page) {
  return page.locator('nav[aria-label="Primary"]');
}

function desktopNav(page: Page) {
  return page.locator("nav.logged-in-desktop-nav");
}

function navScope(page: Page) {
  return page.locator(
    'nav.logged-in-bottom-nav, nav[aria-label="Primary"]:not(.logged-in-desktop-nav)'
  );
}

function navLink(page: Page, label: string) {
  return navScope(page).getByRole("link", {
    name: new RegExp(`^${label}`),
  });
}

function badgeInLink(link: ReturnType<Page["getByRole"]>) {
  return link.locator('[data-testid="mobile-nav-unread-badge"]');
}

async function openMobileFeed(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(FIXTURE_FEED, { waitUntil: "domcontentloaded" });
  await page.locator("#stories").first().waitFor({ state: "visible" });
  await expect(mobileBottomNav(page)).toBeVisible();
}

async function captureScreenshot(page: Page, filename: string) {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, filename),
    fullPage: false,
  });
}

test.describe("Mobile bottom nav badges", () => {
  test.beforeAll(async () => {
    await mkdir(SCREENSHOT_DIR, { recursive: true });
  });

  for (const width of [390, 430]) {
    test(`shows Prayer and Journey badges at ${width}px`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        isMobile: true,
      });
      const page = await context.newPage();
      await installBadgeOverride(page, {
        prayerCount: 3,
        inboxCount: 2,
        isLoading: false,
      });
      await openMobileFeed(page, width);

      const prayerLink = navLink(page, "Prayer");
      const journeyLink = navLink(page, "Journey");

      await expect(badgeInLink(prayerLink)).toHaveText("3");
      await expect(badgeInLink(journeyLink)).toHaveText("2");
      await expect(prayerLink).toHaveAttribute("aria-label", "Prayer, 3 unread");
      await expect(journeyLink).toHaveAttribute(
        "aria-label",
        "Journey, 2 unread conversations"
      );

      for (const label of NAV_DESTINATIONS) {
        await expect(navLink(page, label)).toBeVisible();
      }

      await context.close();
    });
  }

  test("hides badges while loading and when counts are zero", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await installBadgeOverride(page, {
      prayerCount: 4,
      inboxCount: 1,
      isLoading: true,
    });
    await openMobileFeed(page, 390);
    await expect(page.locator('[data-testid="mobile-nav-unread-badge"]')).toHaveCount(
      0
    );

    await page.addInitScript(() => {
      window.sessionStorage.setItem("htbf-mobile-splash-shown", "true");
      window.__HTBF_MOBILE_NAV_BADGE_TEST__ = {
        static: true,
        prayerCount: 0,
        inboxCount: 0,
        isLoading: false,
      };
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(mobileBottomNav(page)).toBeVisible();
    await expect(page.locator('[data-testid="mobile-nav-unread-badge"]')).toHaveCount(
      0
    );

    await context.close();
  });

  test("renders counts from 1 through 99 and 99+ label", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();

    for (const count of [1, 50, 99]) {
      await installBadgeOverride(page, {
        prayerCount: count,
        inboxCount: 0,
        isLoading: false,
      });
      await page.goto(FIXTURE_FEED, { waitUntil: "domcontentloaded" });
      await expect(badgeInLink(navLink(page, "Prayer"))).toHaveText(String(count));
    }

    await installBadgeOverride(page, {
      prayerCount: 140,
      inboxCount: 0,
      isLoading: false,
    });
    await page.goto(FIXTURE_FEED, { waitUntil: "domcontentloaded" });
    await expect(badgeInLink(navLink(page, "Prayer"))).toHaveText("99+");
    await expect(navLink(page, "Prayer")).toHaveAttribute(
      "aria-label",
      "Prayer, 99+ unread"
    );

    await context.close();
  });

  test("badge stays attached without shifting nav item layout", async ({
    browser,
  }) => {
    const baselineContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const baselinePage = await baselineContext.newPage();
    await installBadgeOverride(baselinePage, {
      prayerCount: 0,
      inboxCount: 0,
      isLoading: false,
    });
    await openMobileFeed(baselinePage, 390);
    const baselineBox = await navLink(baselinePage, "Prayer").boundingBox();
    expect(baselineBox).not.toBeNull();
    await baselineContext.close();

    const badgeContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const badgePage = await badgeContext.newPage();
    await installBadgeOverride(badgePage, {
      prayerCount: 7,
      inboxCount: 0,
      isLoading: false,
    });
    await openMobileFeed(badgePage, 390);

    const withBadgeBox = await navLink(badgePage, "Prayer").boundingBox();
    expect(withBadgeBox).not.toBeNull();

    if (baselineBox && withBadgeBox) {
      expect(Math.abs(withBadgeBox.width - baselineBox.width)).toBeLessThan(2);
      expect(Math.abs(withBadgeBox.height - baselineBox.height)).toBeLessThan(2);
      expect(Math.abs(withBadgeBox.x - baselineBox.x)).toBeLessThan(2);
      expect(Math.abs(withBadgeBox.y - baselineBox.y)).toBeLessThan(2);
    }

    const badgeBox = await badgeInLink(navLink(badgePage, "Prayer")).boundingBox();
    expect(badgeBox).not.toBeNull();
    if (badgeBox && withBadgeBox) {
      expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(
        withBadgeBox.x + withBadgeBox.width + 1
      );
    }

    await badgeContext.close();
  });

  test("active-state styling remains functional with badges present", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await installBadgeOverride(page, {
      prayerCount: 2,
      inboxCount: 1,
      isLoading: false,
    });
    await openMobileFeed(page, 390);

    const feedLink = navLink(page, "Feed");
    await expect(feedLink).toHaveAttribute("aria-current", "page");
    await expect(badgeInLink(navLink(page, "Feed"))).toHaveCount(0);

    await context.close();
  });

  test("tapping Prayer and Journey does not clear badge counts", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await installBadgeOverride(page, {
      prayerCount: 5,
      inboxCount: 3,
      isLoading: false,
    });
    await openMobileFeed(page, 390);

    await navLink(page, "Prayer").click();
    await page.waitForURL(/\/prayer/, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await expect(mobileBottomNav(page)).toBeVisible();
    await expect(badgeInLink(navLink(page, "Prayer"))).toHaveText("5");

    await navLink(page, "Journey").click();
    await page.waitForURL(/\/(journey|login)/, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.goto(FIXTURE_FEED, { waitUntil: "domcontentloaded" });
    await page.locator("#stories").first().waitFor({ state: "visible" });
    await expect(mobileBottomNav(page)).toBeVisible();
    await expect(badgeInLink(navLink(page, "Prayer"))).toHaveText("5");
    await expect(badgeInLink(navLink(page, "Journey"))).toHaveText("3");

    await context.close();
  });

  for (const width of [1024, 1440]) {
    test(`mobile badges are absent at ${width}px desktop boundary`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
      });
      const page = await context.newPage();
      await installBadgeOverride(page, {
        prayerCount: 8,
        inboxCount: 4,
        isLoading: false,
      });
      await page.goto(FIXTURE_FEED, { waitUntil: "domcontentloaded" });
      await expect(mobileBottomNav(page)).toBeHidden();
      await expect(desktopNav(page)).toBeVisible();
      await expect(page.locator('[data-testid="mobile-nav-unread-badge"]')).toHaveCount(
        0
      );

      await context.close();
    });
  }

  test("global bottom nav hide rules remain unchanged on video routes", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await installBadgeOverride(page, {
      prayerCount: 2,
      inboxCount: 1,
      isLoading: false,
    });
    await page.goto(VIDEO_FIXTURE, { waitUntil: "domcontentloaded" });
    await expect(mobileBottomNav(page)).toHaveCount(0);
    await expect(primaryBottomNav(page)).toBeVisible();

    await context.close();
  });

  test("VideoFeedBottomNav shows the same Prayer and Journey badge values", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await installBadgeOverride(page, {
      prayerCount: 6,
      inboxCount: 2,
      isLoading: false,
    });
    await page.goto(VIDEO_FIXTURE, { waitUntil: "domcontentloaded" });

    await expect(badgeInLink(navLink(page, "Prayer"))).toHaveText("6");
    await expect(badgeInLink(navLink(page, "Journey"))).toHaveText("2");

    await context.close();
  });

  test("/videos page-local nav shows the same badge values", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await installBadgeOverride(page, {
      prayerCount: 4,
      inboxCount: 3,
      isLoading: false,
    });
    await page.goto(VIDEOS_FIXTURE, { waitUntil: "domcontentloaded" });

    await expect(badgeInLink(navLink(page, "Prayer"))).toHaveText("4");
    await expect(badgeInLink(navLink(page, "Journey"))).toHaveText("3");

    await context.close();
  });

  test("badges remain stable across route changes without flashing to zero", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await installBadgeOverride(page, {
      prayerCount: 8,
      inboxCount: 5,
      isLoading: false,
    });
    await installDiagnostics(page);

    const routes = [
      FIXTURE_FEED,
      "/prayer",
      VIDEOS_FIXTURE,
      VIDEO_FIXTURE,
      FIXTURE_FEED,
    ];

    let mountCountAfterFirstRoute: number | undefined;

    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      if (route.includes("video")) {
        await expect(badgeInLink(navLink(page, "Prayer"))).toHaveText("8");
        await expect(badgeInLink(navLink(page, "Journey"))).toHaveText("5");
      } else if (await navScope(page).count()) {
        await expect(badgeInLink(navLink(page, "Prayer"))).toHaveText("8");
        await expect(badgeInLink(navLink(page, "Journey"))).toHaveText("5");
      }

      if (route === FIXTURE_FEED && mountCountAfterFirstRoute === undefined) {
        await page.waitForTimeout(300);
        mountCountAfterFirstRoute = (
          await page.evaluate(() => window.__HTBF_MOBILE_NAV_BADGE_DIAG__)
        )?.providerMounts;
      }
    }

    const diagnostics = await page.evaluate(
      () => window.__HTBF_MOBILE_NAV_BADGE_DIAG__
    );
    expect(diagnostics?.channelCreates ?? 0).toBe(0);
    expect(diagnostics?.fetchCalls ?? 0).toBe(0);
    expect(diagnostics?.providerMounts).toBe(mountCountAfterFirstRoute);

    await context.close();
  });

  test("static override does not activate fetch or subscriptions", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await installDiagnostics(page);
    await installBadgeOverride(page, {
      prayerCount: 2,
      inboxCount: 1,
      isLoading: false,
    });

    await openMobileFeed(page, 390);

    const diagnostics = await page.evaluate(
      () => window.__HTBF_MOBILE_NAV_BADGE_DIAG__
    );
    expect(diagnostics?.fetchCalls ?? 0).toBe(0);
    expect(diagnostics?.channelCreates ?? 0).toBe(0);

    await context.close();
  });

  test("authenticated mobile lifecycle creates one provider-owned channel", async ({
    browser,
  }) => {
    test.skip(!fs.existsSync(OWNER_AUTH), "Owner auth storage unavailable.");

    const context = await browser.newContext({
      storageState: OWNER_AUTH,
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await installDiagnostics(page);

    await page.route("**/rest/v1/inbox_messages**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
        headers: {
          "content-range": "0-0/0",
        },
      });
    });

    await page.route("**/rest/v1/story_video_replies**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    });

    await page.goto(FIXTURE_FEED, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);

    const afterFeed = await page.evaluate(
      () => window.__HTBF_MOBILE_NAV_BADGE_DIAG__
    );

    await page.goto("/prayer", { waitUntil: "domcontentloaded" });
    await page.goto("/journey", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);

    const afterRoutes = await page.evaluate(
      () => window.__HTBF_MOBILE_NAV_BADGE_DIAG__
    );

    expect(afterFeed?.authLookups).toBeGreaterThanOrEqual(1);
    expect(afterFeed?.channelCreates).toBe(1);
    expect(afterRoutes?.channelCreates).toBe(1);
    expect(afterRoutes?.providerMounts).toBe(afterFeed?.providerMounts);

    await context.close();
  });

  test("desktop width removes active mobile badge channel", async ({ browser }) => {
    test.skip(!fs.existsSync(OWNER_AUTH), "Owner auth storage unavailable.");

    const context = await browser.newContext({
      storageState: OWNER_AUTH,
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await installDiagnostics(page);

    await page.route("**/rest/v1/inbox_messages**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
        headers: { "content-range": "0-0/0" },
      });
    });
    await page.route("**/rest/v1/story_video_replies**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    });

    await page.goto(FIXTURE_FEED, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    await page.setViewportSize({ width: 1024, height: 900 });
    await page.waitForTimeout(600);

    const diagnostics = await page.evaluate(
      () => window.__HTBF_MOBILE_NAV_BADGE_DIAG__
    );

    expect(diagnostics?.channelCreates).toBe(1);
    expect(diagnostics?.channelRemoves).toBeGreaterThanOrEqual(1);
    expect(diagnostics?.activeChannelName).toBeNull();

    await context.close();
  });

  test("visual capture at 390px with low counts", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await installBadgeOverride(page, {
      prayerCount: 3,
      inboxCount: 7,
      isLoading: false,
    });
    await openMobileFeed(page, 390);
    await expect(badgeInLink(navLink(page, "Prayer"))).toHaveText("3");
    await expect(badgeInLink(navLink(page, "Journey"))).toHaveText("7");
    await captureScreenshot(page, "mobile-390-low-counts.png");
    await context.close();
  });

  test("visual capture at 430px with 99+ badge", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 430, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await installBadgeOverride(page, {
      prayerCount: 140,
      inboxCount: 0,
      isLoading: false,
    });
    await openMobileFeed(page, 430);
    await expect(badgeInLink(navLink(page, "Prayer"))).toHaveText("99+");
    await captureScreenshot(page, "mobile-430-prayer-99plus.png");
    await context.close();
  });

  test("visual capture at 1024px without mobile badges", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 900 },
    });
    const page = await context.newPage();
    await installBadgeOverride(page, {
      prayerCount: 9,
      inboxCount: 9,
      isLoading: false,
    });
    await page.goto(FIXTURE_FEED, { waitUntil: "domcontentloaded" });
    await captureScreenshot(page, "desktop-1024-no-mobile-badges.png");
    await context.close();
  });

  test("visual capture for video-feed nav parity at 390px", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await installBadgeOverride(page, {
      prayerCount: 2,
      inboxCount: 5,
      isLoading: false,
    });
    await page.goto(VIDEO_FIXTURE, { waitUntil: "domcontentloaded" });
    await expect(primaryBottomNav(page)).toBeVisible();
    await expect(badgeInLink(navLink(page, "Prayer"))).toHaveText("2");
    await expect(badgeInLink(navLink(page, "Journey"))).toHaveText("5");
    await captureScreenshot(page, "video-feed-390-nav-parity.png");
    await context.close();
  });
});
