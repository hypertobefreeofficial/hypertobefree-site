import { test, expect, devices } from "@playwright/test";

const FIXTURE_PATH = "/feed?fixture=1";
const FIRST_POST_SNIPPET = "God met me in a season of waiting";
const RETURN_STATE_KEY = "htbf_freedom_feed_return_state";

async function openFixtureFeed(page: import("@playwright/test").Page) {
  await page.goto(FIXTURE_PATH, { waitUntil: "domcontentloaded" });
  await page.locator("#stories").waitFor({ state: "visible" });
  await expect(page.getByText(FIRST_POST_SNIPPET).first()).toBeVisible({
    timeout: 30000,
  });
}

function mobileBottomNav(page: import("@playwright/test").Page) {
  return page.locator("nav.logged-in-bottom-nav");
}

function desktopNav(page: import("@playwright/test").Page) {
  return page.locator("nav.logged-in-desktop-nav");
}

async function assertAboveMobileNav(
  page: import("@playwright/test").Page,
  locator: import("@playwright/test").Locator
) {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);

  const targetBox = await locator.boundingBox();
  const navBox = await mobileBottomNav(page).boundingBox();
  expect(targetBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  if (targetBox && navBox) {
    expect(targetBox.y + targetBox.height).toBeLessThanOrEqual(navBox.y + 2);
  }
}

test.describe("Community Feed responsive shell", () => {
  for (const width of [390, 430]) {
    test(`mobile bottom nav visible at ${width}px`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        isMobile: true,
      });
      const page = await context.newPage();
      await openFixtureFeed(page);
      await expect(mobileBottomNav(page)).toBeVisible();
      await context.close();
    });
  }

  for (const width of [1024, 1440]) {
    test(`mobile bottom nav hidden at ${width}px`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
      });
      const page = await context.newPage();
      await openFixtureFeed(page);
      await expect(mobileBottomNav(page)).toBeHidden();
      await context.close();
    });

    test(`desktop navigation available at ${width}px`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
      });
      const page = await context.newPage();
      await openFixtureFeed(page);
      await expect(desktopNav(page)).toBeVisible();
      await expect(
        desktopNav(page).getByRole("link", { name: "Feed" })
      ).toBeVisible();
      await expect(
        desktopNav(page).getByRole("link", { name: "Prayer" })
      ).toBeVisible();
      await context.close();
    });
  }

  test("only one navigation system is visible at 390px and 1440px", async ({
    browser,
  }) => {
    for (const { width, mobile } of [
      { width: 390, mobile: true },
      { width: 1440, mobile: false },
    ]) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        isMobile: mobile,
      });
      const page = await context.newPage();
      await openFixtureFeed(page);

      const bottomVisible = await mobileBottomNav(page).isVisible();
      const desktopVisible = await desktopNav(page).isVisible();
      expect(bottomVisible !== desktopVisible).toBe(true);

      await context.close();
    }
  });

  test("final post action scrolls fully above mobile navigation", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await openFixtureFeed(page);

    const danielPost = page.locator("#freedom-feed-story-fixture-portrait-video");
    await danielPost.scrollIntoViewIfNeeded();
    await assertAboveMobileNav(
      page,
      danielPost.getByRole("button", { name: /^React/ })
    );

    await context.close();
  });

  test("Load more scrolls fully above mobile navigation", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await openFixtureFeed(page);
    await assertAboveMobileNav(page, page.getByRole("button", { name: "Load more" }));
    await context.close();
  });

  test("end-of-feed message scrolls fully above mobile navigation", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 430, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await openFixtureFeed(page);

    while (await page.getByRole("button", { name: "Load more" }).isVisible()) {
      await page.getByRole("button", { name: "Load more" }).click();
      await page.waitForTimeout(600);
    }

    const endMessage = page.getByText("You've reached the end of the feed.");
    await assertAboveMobileNav(page, endMessage);
    await context.close();
  });

  test("God Did It scrolls fully above mobile navigation", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 430, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await openFixtureFeed(page);
    await page.getByRole("button", { name: "Load more" }).click();
    const ownerPost = page.locator("#freedom-feed-story-fixture-prayer-owner");
    await assertAboveMobileNav(
      page,
      ownerPost.getByTestId("god-did-it-button")
    );
    await context.close();
  });

  test("video playback controls are not covered by mobile navigation", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 430, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await openFixtureFeed(page);
    const videoPost = page.locator("#freedom-feed-story-fixture-portrait-video");
    await videoPost.scrollIntoViewIfNeeded();
    await assertAboveMobileNav(
      page,
      videoPost.getByRole("button", { name: /Open video in Video Feed/i })
    );
    await context.close();
  });

  test("reaction sheet renders above mobile navigation with all choices visible", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 430, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await openFixtureFeed(page);

    const danielPost = page.locator("#freedom-feed-story-fixture-portrait-video");
    await danielPost.scrollIntoViewIfNeeded();
    await danielPost.getByRole("button", { name: /^React/ }).click();

    const menu = page.getByRole("menu", { name: "Choose a reaction" });
    await expect(menu).toBeVisible();
    await page.waitForFunction(() => {
      const node = document.querySelector(
        '[aria-label="Choose a reaction"]'
      ) as HTMLElement | null;
      if (!node) return false;
      return parseFloat(getComputedStyle(node).bottom || "0") > 40;
    });

    const amen = page.getByRole("menuitemradio", { name: /Amen/ });
    const praise = page.getByRole("menuitemradio", { name: /Praise God/ });
    const encouraged = page.getByRole("menuitemradio", { name: /Encouraged/ });

    await expect(amen).toBeVisible();
    await expect(praise).toBeVisible();
    await expect(encouraged).toBeVisible();

    const navBox = await mobileBottomNav(page).boundingBox();
    const encouragedBox = await encouraged.boundingBox();
    expect(navBox).not.toBeNull();
    expect(encouragedBox).not.toBeNull();
    if (navBox && encouragedBox) {
      expect(encouragedBox.y + encouragedBox.height).toBeLessThanOrEqual(
        navBox.y + 2
      );
    }

    const menuBox = await menu.boundingBox();
    if (menuBox && navBox) {
      expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(navBox.y + 2);
    }

    await context.close();
  });

  test("reaction sheet respects safe-area clearance padding", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      ...devices["iPhone 14 Pro Max"],
    });
    const page = await context.newPage();
    await openFixtureFeed(page);

    const danielPost = page.locator("#freedom-feed-story-fixture-portrait-video");
    await danielPost.scrollIntoViewIfNeeded();
    await danielPost.getByRole("button", { name: /^React/ }).click();

    const paddingBottom = await page
      .getByRole("menu", { name: "Choose a reaction" })
      .evaluate((node) => getComputedStyle(node).bottom);

    expect(parseFloat(paddingBottom)).toBeGreaterThan(48);

    await context.close();
  });

  test("sticky header does not cover restored feed content", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await openFixtureFeed(page);

    const storyId = "fixture-portrait-video";

    await page.evaluate(
      ({ key, storyId, scrollY }) => {
        window.sessionStorage.setItem(
          key,
          JSON.stringify({
            source: "freedom-feed",
            storyId,
            scrollY,
            storyViewportTop: 0,
            savedAt: Date.now(),
          })
        );
      },
      { key: RETURN_STATE_KEY, storyId, scrollY: 1200 }
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#stories").waitFor({ state: "visible" });
    await page.waitForTimeout(300);

    const storyTop = await page
      .locator(`#freedom-feed-story-${storyId}`)
      .evaluate((node) => node.getBoundingClientRect().top);

    const clearancePx = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.height = "var(--app-feed-scroll-padding-top)";
      document.documentElement.appendChild(probe);
      const height = probe.getBoundingClientRect().height;
      probe.remove();
      return height;
    });

    expect(storyTop).toBeGreaterThanOrEqual(clearancePx - 4);
    expect(clearancePx).toBeGreaterThan(40);

    await context.close();
  });

  test("parent-post navigation lands below the sticky header", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 430, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await openFixtureFeed(page);
    await page.getByRole("button", { name: "Load more" }).click();

    const response = page.locator("#freedom-feed-response-fixture-video-response");
    await response.scrollIntoViewIfNeeded();

    const clearancePx = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.height = "var(--app-feed-scroll-padding-top)";
      document.documentElement.appendChild(probe);
      const height = probe.getBoundingClientRect().height;
      probe.remove();
      return height;
    });

    const headerTop = await response
      .getByText(/Responded with a video prayer for/)
      .evaluate((node) => node.getBoundingClientRect().top);

    expect(headerTop).toBeGreaterThanOrEqual(clearancePx - 4);
    await context.close();
  });

  test("no horizontal overflow at 390px or 430px", async ({ browser }) => {
    for (const width of [390, 430]) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        isMobile: true,
      });
      const page = await context.newPage();
      await openFixtureFeed(page);

      const hasOverflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1
      );
      expect(hasOverflow).toBe(false);

      await context.close();
    }
  });

  test("no written-comment composer exists", async ({ page }) => {
    await openFixtureFeed(page);
    await expect(page.getByRole("textbox", { name: /comment/i })).toHaveCount(0);
  });

  test("backend provenance remains absent", async ({ page }) => {
    await openFixtureFeed(page);
    await expect(page.getByText(/originSurface|dedupeKey|fixture-user/i)).toHaveCount(
      0
    );
  });
});
