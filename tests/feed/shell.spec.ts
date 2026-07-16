import { test, expect, devices } from "@playwright/test";

const FIXTURE_PATH = "/feed?fixture=1";
const FIRST_POST_SNIPPET = "God met me in a season of waiting";

async function openFixtureFeed(page: import("@playwright/test").Page) {
  await page.goto(FIXTURE_PATH, { waitUntil: "domcontentloaded" });
  await page.locator("#stories").waitFor({ state: "visible" });
  await expect(page.getByText(FIRST_POST_SNIPPET).first()).toBeVisible({
    timeout: 30000,
  });
}

test.describe("Community Feed shell — fixture render path", () => {
  test("no visible Fixture engineering copy", async ({ page }) => {
    await openFixtureFeed(page);
    await expect(page.getByText(/Fixture:/i)).toHaveCount(0);
    await expect(page.getByText(/mock|placeholder|validation/i)).toHaveCount(0);
  });

  test("ordinary captions have no nested bordered container", async ({
    page,
  }) => {
    await openFixtureFeed(page);
    const caption = page.getByText(FIRST_POST_SNIPPET).first();
    await expect(caption).toBeVisible();
    const borderedAncestor = caption.locator(
      "xpath=ancestor::*[contains(@class,'ring-1') or contains(@class,'rounded-[1.25rem]')][1]"
    );
    await expect(borderedAncestor).toHaveCount(0);
  });

  test("Block User is absent from the normal post body", async ({ page }) => {
    await openFixtureFeed(page);
    await expect(page.getByRole("button", { name: "Block User" })).toHaveCount(
      0
    );
    await expect(page.getByText("Block user")).toHaveCount(0);
  });

  test("Block user is available through the overflow menu", async ({ page }) => {
    await openFixtureFeed(page);
    const overflow = page.getByRole("button", { name: "Post options" }).first();
    await overflow.click();
    await expect(page.getByRole("menuitem", { name: "Block user" })).toBeVisible();
  });

  test("every standard post has an accessible overflow trigger", async ({
    page,
  }) => {
    await openFixtureFeed(page);
    const posts = page.locator("article[id^='freedom-feed-story-']");
    const count = await posts.count();
    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      await expect(
        posts.nth(index).getByRole("button", { name: "Post options" })
      ).toBeVisible();
    }
  });

  test("reaction presentation is not duplicated", async ({ page }) => {
    await openFixtureFeed(page);
    const danielPost = page.locator("#freedom-feed-story-fixture-portrait-video");
    await danielPost.scrollIntoViewIfNeeded();
    await expect(danielPost.getByTestId("feed-engagement-summary")).toHaveCount(1);
    await expect(danielPost.getByRole("button", { name: "Amen" })).toHaveCount(0);
    await expect(danielPost.getByRole("button", { name: /^React/ })).toBeVisible();
  });

  test("no unexplained plus control is rendered", async ({ page }) => {
    await openFixtureFeed(page);
    await expect(page.getByRole("button", { name: /^\+$/ })).toHaveCount(0);
  });

  test("video post renders poster or fallback before playback", async ({
    page,
  }) => {
    await openFixtureFeed(page);
    await page.getByText("Daniel P.").scrollIntoViewIfNeeded();
    const videoPost = page.locator("#freedom-feed-story-fixture-portrait-video");
    await expect(
      videoPost.getByRole("button", { name: /Open video in Video Feed/i })
    ).toBeVisible();
    await expect(videoPost.locator("video")).toHaveCount(0);
    await expect(videoPost.locator("img").first()).toBeVisible();
  });

  test("native controls are not visible before playback", async ({ page }) => {
    await openFixtureFeed(page);
    await page.getByRole("button", { name: "Load more" }).click();
    await page.getByText("James R.").first().scrollIntoViewIfNeeded();
    await expect(page.locator("article video[controls]")).toHaveCount(0);
  });

  test("Feed navigation item uses the correct icon and selected state", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await openFixtureFeed(page);

    const feedNav = page.locator("nav.logged-in-bottom-nav").getByRole("link", {
      name: "Feed",
    }).first();
    await expect(feedNav).toBeVisible();
    await expect(feedNav).toHaveAttribute("aria-current", "page");

    await context.close();
  });

  test("no written-comment composer exists", async ({ page }) => {
    await openFixtureFeed(page);
    await expect(page.getByRole("textbox", { name: /comment/i })).toHaveCount(0);
    await expect(page.getByText(/write a comment/i)).toHaveCount(0);
  });

  test("no internal provenance labels appear", async ({ page }) => {
    await openFixtureFeed(page);
    await expect(page.getByText(/originSurface|dedupeKey|fixture-user/i)).toHaveCount(
      0
    );
  });

  test("mobile feed has no horizontal overflow at 390px and 430px", async ({
    browser,
  }) => {
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

  test("post separator spans the feed width on mobile", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await openFixtureFeed(page);

    const separator = page.locator('[role="separator"]').first();
    await separator.scrollIntoViewIfNeeded();
    const separatorBox = await separator.boundingBox();
    expect(separatorBox?.width ?? 0).toBeGreaterThan(380);

    await context.close();
  });

  test("media is wider than inset text on mobile", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await openFixtureFeed(page);

    await page
      .getByText("The trail reminded us that we are never walking alone.")
      .scrollIntoViewIfNeeded();
    const media = page
      .locator("#freedom-feed-story-fixture-landscape-photo img")
      .first();
    const text = page
      .getByText("The trail reminded us that we are never walking alone.")
      .first();
    const mediaBox = await media.boundingBox();
    const textBox = await text.boundingBox();
    expect(mediaBox?.width ?? 0).toBeGreaterThan((textBox?.width ?? 0) + 20);

    await context.close();
  });

  test("bottom navigation does not cover Load more", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await openFixtureFeed(page);

    const loadMore = page.getByRole("button", { name: "Load more" });
    await loadMore.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const buttonBox = await loadMore.boundingBox();
    const nav = page.locator("nav.logged-in-bottom-nav").first();
    const navBox = await nav.boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    if (buttonBox && navBox) {
      expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(navBox.y + 2);
    }

    await context.close();
  });

  test("Load more preserves existing rendered items", async ({ page }) => {
    await openFixtureFeed(page);
    await expect(page.getByText(FIRST_POST_SNIPPET).first()).toBeVisible();
    await expect(
      page.getByText("Please pray for my daughter's procedure tomorrow morning.").first()
    ).not.toBeVisible();

    await page.getByRole("button", { name: "Load more" }).click();
    await expect(
      page.getByText("Please pray for my daughter's procedure tomorrow morning.").first()
    ).toBeVisible();
    await expect(page.getByText(FIRST_POST_SNIPPET).first()).toBeVisible();
  });
});

test.describe("Community Feed shell — hero overflow", () => {
  for (const width of [320, 359, 390, 430]) {
    test(`hero edge bleed has no horizontal overflow at ${width}px`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width, height: 700 },
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
    });
  }
});
