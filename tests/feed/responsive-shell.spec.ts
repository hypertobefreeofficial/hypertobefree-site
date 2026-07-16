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

const DESKTOP_NAV_DESTINATIONS = [
  "Feed",
  "Videos",
  "Prayer",
  "Journey",
  "Search",
  "Profile",
] as const;

async function assertDesktopNavInViewport(
  page: import("@playwright/test").Page
) {
  const navBox = await desktopNav(page).boundingBox();
  expect(navBox).not.toBeNull();
  if (navBox) {
    expect(navBox.y).toBeLessThanOrEqual(8);
    expect(navBox.height).toBeGreaterThan(40);
  }
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

    for (const destination of DESKTOP_NAV_DESTINATIONS) {
      test(`desktop nav shows ${destination} at ${width}px`, async ({
        browser,
      }) => {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
        });
        const page = await context.newPage();
        await openFixtureFeed(page);
        await assertDesktopNavInViewport(page);
        await expect(
          desktopNav(page).getByRole("link", { name: destination })
        ).toBeVisible();
        await context.close();
      });
    }

    test(`Feed is active in desktop nav at ${width}px`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
      });
      const page = await context.newPage();
      await openFixtureFeed(page);
      await expect(
        desktopNav(page).getByRole("link", { name: "Feed" })
      ).toHaveAttribute("aria-current", "page");
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
      danielPost.getByRole("button", { name: /^Respond/ })
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

  test("respond sheet renders above mobile navigation with encouragement choices visible", async ({
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
    await danielPost.getByRole("button", { name: /^Respond/ }).click();

    const dialog = page.getByRole("dialog", {
      name: /Choose how you want to respond/i,
    });
    await expect(dialog).toBeVisible();

    await expect(page.getByRole("button", { name: /Amen/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Praise God/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Encouraged/i })
    ).toBeVisible();

    const navBox = await mobileBottomNav(page).boundingBox();
    const amenBox = await page.getByRole("button", { name: /Amen/i }).boundingBox();
    expect(navBox).not.toBeNull();
    expect(amenBox).not.toBeNull();
    if (navBox && amenBox) {
      expect(amenBox.y + amenBox.height).toBeLessThanOrEqual(navBox.y + 2);
    }

    await context.close();
  });

  test("Respond trigger stays behind the response overlay while sheet is open", async ({
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
    const trigger = danielPost.getByRole("button", { name: /^Respond/ });
    await trigger.click();

    const hiddenTrigger = danielPost.getByRole("button", {
      name: /^Respond/,
      includeHidden: true,
    });

    await expect(
      page.getByRole("dialog", { name: /Choose how you want to respond/i })
    ).toBeVisible();
    await expect(hiddenTrigger).toBeHidden();
    await expect(hiddenTrigger).toHaveCSS("visibility", "hidden");
    await expect(hiddenTrigger).toHaveCSS("pointer-events", "none");

    await context.close();
  });

  test("Respond trigger cannot be clicked while the response sheet is open", async ({
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
    const trigger = danielPost.getByRole("button", { name: /^Respond/ });
    await trigger.click();
    await expect(
      page.getByRole("dialog", { name: /Choose how you want to respond/i })
    ).toBeVisible();
    await expect(
      danielPost.getByRole("button", { name: /^Respond/, includeHidden: true })
    ).toBeHidden();

    let clickIntercepted = false;
    try {
      await trigger.click({ timeout: 1000 });
    } catch {
      clickIntercepted = true;
    }
    expect(clickIntercepted).toBe(true);

    await context.close();
  });

  test("focus returns to Respond after closing the response sheet", async ({
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
    const trigger = danielPost.getByRole("button", { name: /^Respond/ });
    await trigger.click();
    await page.getByRole("button", { name: "Close response options" }).click();
    await expect(
      page.getByRole("dialog", { name: /Choose how you want to respond/i })
    ).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await context.close();
  });

  test("response sheet respects safe-area clearance padding", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      ...devices["iPhone 14 Pro Max"],
    });
    const page = await context.newPage();
    await openFixtureFeed(page);

    const danielPost = page.locator("#freedom-feed-story-fixture-portrait-video");
    await danielPost.scrollIntoViewIfNeeded();
    await danielPost.getByRole("button", { name: /^Respond/ }).click();

    const paddingBottom = await page
      .getByRole("dialog", { name: /Choose how you want to respond/i })
      .evaluate((node) => getComputedStyle(node).paddingBottom);

    expect(parseFloat(paddingBottom)).toBeGreaterThan(15);

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
