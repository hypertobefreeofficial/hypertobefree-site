import { test, expect, type Page } from "@playwright/test";

const FIXTURE_FEED = "/feed?fixture=1";

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

function desktopNav(page: Page) {
  return page.locator("nav.logged-in-desktop-nav");
}

function mobileBottomNav(page: Page) {
  return page.locator("nav.logged-in-bottom-nav");
}

function desktopBell(page: Page) {
  return page.getByTestId("desktop-notification-bell");
}

async function openDesktopFeedAt(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(FIXTURE_FEED, { waitUntil: "domcontentloaded" });
  await page.locator("#stories").first().waitFor({ state: "visible" });
  await expect(desktopNav(page)).toBeVisible();
}

async function assertDesktopBellBadgeFitsNav(page: Page) {
  const navBox = await desktopNav(page).boundingBox();
  const badgeBox = await page
    .getByTestId("desktop-notification-bell-badge")
    .boundingBox();

  expect(navBox).not.toBeNull();
  expect(badgeBox).not.toBeNull();

  if (navBox && badgeBox) {
    expect(badgeBox.y).toBeGreaterThanOrEqual(navBox.y);
    expect(badgeBox.y + badgeBox.height).toBeLessThanOrEqual(
      navBox.y + navBox.height + 1
    );
  }
}

async function assertSingleDesktopHeader(page: Page) {
  await expect(desktopNav(page)).toHaveCount(1);
  await expect(desktopBell(page)).toHaveCount(1);

  const layout = await page.evaluate(() => {
    const nav = document.querySelector("nav.logged-in-desktop-nav");
    const inner = nav?.querySelector(".app-desktop-shell-inner");
    const navRect = nav?.getBoundingClientRect();
    const innerRect = inner?.getBoundingClientRect();
    const htbfInNav = nav
      ? [...nav.querySelectorAll("*")].filter(
          (el) =>
            el.childElementCount === 0 &&
            el.textContent?.trim() === "HTBF" &&
            (el as HTMLElement).offsetParent !== null
        ).length
      : 0;
    const visibleHeaders = [...document.querySelectorAll("header")].filter(
      (header) => {
        const rect = header.getBoundingClientRect();
        const style = window.getComputedStyle(header);
        return (
          rect.height > 8 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      }
    ).length;

    return {
      htbfInNav,
      visibleHeaders,
      navHeight: navRect?.height ?? 0,
      innerHeight: innerRect?.height ?? 0,
      scrollOverflow:
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    };
  });

  expect(layout.htbfInNav).toBe(1);
  expect(layout.visibleHeaders).toBe(0);
  expect(layout.navHeight).toBeGreaterThanOrEqual(50);
  expect(layout.navHeight).toBeLessThanOrEqual(54);
  expect(layout.innerHeight).toBeGreaterThanOrEqual(50);
  expect(layout.innerHeight).toBeLessThanOrEqual(54);
  expect(layout.scrollOverflow).toBe(true);
}

async function openDesktopFeed(page: Page) {
  await openDesktopFeedAt(page, 1280);
}

test.describe("Desktop notification bell", () => {
  test("shows bell at desktop width and hides mobile bottom nav", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await installBadgeOverride(page, {
      prayerCount: 2,
      inboxCount: 1,
      isLoading: false,
    });
    await openDesktopFeed(page);

    await expect(desktopBell(page)).toBeVisible();
    await expect(mobileBottomNav(page)).toBeHidden();
    await expect(page.getByTestId("desktop-notification-bell-badge")).toHaveText(
      "3"
    );

    await context.close();
  });

  test("hides bell below lg breakpoint", async ({ browser }) => {
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
    await page.goto(FIXTURE_FEED, { waitUntil: "domcontentloaded" });
    await expect(mobileBottomNav(page)).toBeVisible();
    await expect(desktopNav(page)).toBeHidden();
    await expect(desktopBell(page)).toBeHidden();

    await context.close();
  });

  test("renders unread total on the bell badge", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await installBadgeOverride(page, {
      prayerCount: 4,
      inboxCount: 3,
      isLoading: false,
    });
    await openDesktopFeed(page);

    await expect(page.getByTestId("desktop-notification-bell-badge")).toHaveText(
      "7"
    );
    await expect(desktopBell(page)).toHaveAttribute(
      "aria-label",
      "Notifications, 7 unread"
    );

    await context.close();
  });

  test("caps bell badge at 99+", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await installBadgeOverride(page, {
      prayerCount: 80,
      inboxCount: 40,
      isLoading: false,
    });
    await openDesktopFeed(page);

    await expect(page.getByTestId("desktop-notification-bell-badge")).toHaveText(
      "99+"
    );
    await expect(desktopBell(page)).toHaveAttribute(
      "aria-label",
      "Notifications, 99+ unread"
    );

    await context.close();
  });

  for (const width of [1024, 1280, 1440, 1600]) {
    test(`keeps one desktop header and visible bell badge at ${width}px`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
      });
      const page = await context.newPage();
      await installBadgeOverride(page, {
        prayerCount: 4,
        inboxCount: 3,
        isLoading: false,
      });
      await openDesktopFeedAt(page, width);
      await assertSingleDesktopHeader(page);
      await expect(page.getByTestId("desktop-notification-bell-badge")).toHaveText(
        "7"
      );
      await assertDesktopBellBadgeFitsNav(page);

      const navItemOrder = await page.evaluate(() => {
        const nav = document.querySelector("nav.logged-in-desktop-nav");
        if (!nav) return [];

        return [...nav.querySelectorAll("a, button")]
          .map((el) => el.textContent?.replace(/\s+/g, " ").trim() ?? "")
          .filter(Boolean);
      });

      expect(navItemOrder).toContain("Search");
      expect(navItemOrder).toContain("Profile");
      expect(navItemOrder.indexOf("Search")).toBeLessThan(
        navItemOrder.indexOf("Profile")
      );

      await context.close();
    });
  }

  test("opens and closes popover with keyboard and preserves counts", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await installBadgeOverride(page, {
      prayerCount: 2,
      inboxCount: 5,
      isLoading: false,
    });
    await openDesktopFeed(page);

    await expect(desktopBell(page)).toBeVisible();

    const popover = page.getByTestId("desktop-notification-popover");
    await expect(async () => {
      await desktopBell(page).click();
      await expect(popover).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    await expect(popover.getByText("7 unread")).toBeVisible();
    await expect(popover.getByRole("link", { name: "Prayer" })).toBeVisible();
    await expect(popover.getByRole("link", { name: "Journey" })).toBeVisible();
    await expect(page.getByTestId("desktop-notification-bell-badge")).toHaveText(
      "7"
    );

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("desktop-notification-popover")).toHaveCount(0);
    await expect(desktopBell(page)).toBeFocused();
    await expect(page.getByTestId("desktop-notification-bell-badge")).toHaveText(
      "7"
    );

    await desktopBell(page).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("desktop-notification-popover")).toBeVisible();
    const viewAll = page.getByTestId("desktop-notification-view-all");
    await expect(viewAll).toHaveAttribute("href", "/notifications");
    await viewAll.click();
    await expect(page).toHaveURL(/\/(notifications|login)/);

    await context.close();
  });

  test("mobile badges still render at mobile width", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await installBadgeOverride(page, {
      prayerCount: 3,
      inboxCount: 2,
      isLoading: false,
    });
    await page.goto(FIXTURE_FEED, { waitUntil: "domcontentloaded" });

    const prayerLink = mobileBottomNav(page).getByRole("link", {
      name: /^Prayer/,
    });
    const journeyLink = mobileBottomNav(page).getByRole("link", {
      name: /^Journey/,
    });

    await expect(
      prayerLink.locator('[data-testid="mobile-nav-unread-badge"]')
    ).toHaveText("3");
    await expect(
      journeyLink.locator('[data-testid="mobile-nav-unread-badge"]')
    ).toHaveText("2");

    await context.close();
  });

  test("uses one provider mount and stable channel across viewport resize", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await installDiagnostics(page);
    await page.goto(FIXTURE_FEED, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (window.__HTBF_MOBILE_NAV_BADGE_DIAG__?.providerMounts ?? 0) >= 1
    );

    const mobileDiagnostics = await page.evaluate(
      () => window.__HTBF_MOBILE_NAV_BADGE_DIAG__
    );
    expect(mobileDiagnostics?.providerMounts).toBe(1);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForFunction(
      () => (window.__HTBF_MOBILE_NAV_BADGE_DIAG__?.providerMounts ?? 0) >= 1
    );

    const desktopDiagnostics = await page.evaluate(
      () => window.__HTBF_MOBILE_NAV_BADGE_DIAG__
    );
    expect(desktopDiagnostics?.providerMounts).toBe(1);
    expect(desktopDiagnostics?.channelCreates).toBeLessThanOrEqual(1);

    await context.close();
  });
});
