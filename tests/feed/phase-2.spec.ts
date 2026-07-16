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

test.describe("Community Feed Phase 2 — type-specific posts", () => {
  test("testimony post uses plain caption flow", async ({ page }) => {
    await openFixtureFeed(page);
    const caption = page.getByText(FIRST_POST_SNIPPET).first();
    await expect(caption).toBeVisible();
    await expect(
      caption.locator(
        "xpath=ancestor::*[contains(@class,'ring-1') or contains(@class,'rounded-[1.25rem]')][1]"
      )
    ).toHaveCount(0);
  });

  test("reaction summary is not duplicated with permanent named controls", async ({
    page,
  }) => {
    await openFixtureFeed(page);
    const danielPost = page.locator("#freedom-feed-story-fixture-portrait-video");
    await danielPost.scrollIntoViewIfNeeded();
    await expect(danielPost.getByTestId("feed-engagement-summary")).toHaveCount(1);
    await expect(danielPost.getByRole("button", { name: "Amen" })).toHaveCount(0);
    await expect(danielPost.getByRole("button", { name: /^Respond/ })).toBeVisible();
  });

  test("respond selector exposes Amen, Praise God, and Encouraged", async ({
    page,
  }) => {
    await openFixtureFeed(page);
    const danielPost = page.locator("#freedom-feed-story-fixture-portrait-video");
    await danielPost.scrollIntoViewIfNeeded();
    await danielPost.getByRole("button", { name: /^Respond/ }).click();
    await expect(page.getByRole("button", { name: /Amen/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Praise God/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Encouraged/i })
    ).toBeVisible();
  });

  test("prayer viewer sees I'm Praying and not God Did It", async ({ page }) => {
    await openFixtureFeed(page);
    const prayerPost = page.locator("#freedom-feed-story-fixture-prayer-request");
    await prayerPost.scrollIntoViewIfNeeded();
    await expect(
      prayerPost.getByRole("button", { name: /I'm Praying|Praying/ })
    ).toBeVisible();
    await expect(prayerPost.getByTestId("god-did-it-button")).toHaveCount(0);
  });

  test("prayer owner sees God Did It after load more", async ({ page }) => {
    await openFixtureFeed(page);
    await page.getByRole("button", { name: "Load more" }).click();
    const ownerPost = page.locator("#freedom-feed-story-fixture-prayer-owner");
    await ownerPost.scrollIntoViewIfNeeded();
    await expect(ownerPost.getByTestId("god-did-it-button")).toBeVisible();
  });

  test("answered prayer shows original prayer and update", async ({ page }) => {
    await openFixtureFeed(page);
    await page.getByRole("button", { name: "Load more" }).click();
    const answered = page.locator("#freedom-feed-story-fixture-answered-prayer");
    await answered.scrollIntoViewIfNeeded();
    await expect(answered.getByText("Original prayer")).toBeVisible();
    await expect(answered.getByText("The update")).toBeVisible();
    await expect(
      answered.getByText("Please pray for my daughter's procedure tomorrow morning.")
    ).toBeVisible();
    await expect(
      answered.getByText("Praise God—the procedure went perfectly")
    ).toBeVisible();
  });

  test("video-response entry includes parent relationship context", async ({
    page,
  }) => {
    await openFixtureFeed(page);
    await page.getByRole("button", { name: "Load more" }).click();
    const response = page.locator("#freedom-feed-response-fixture-video-response");
    await response.scrollIntoViewIfNeeded();
    await expect(
      response.getByText(/Responded with a video prayer for/)
    ).toBeVisible();
    await expect(response.getByText(/healing for my mom/i)).toBeVisible();
    await expect(response.getByText(/From Prayer Connect/i)).toHaveCount(0);
  });

  test("standalone video response has working Share and no disabled Save", async ({
    page,
  }) => {
    await openFixtureFeed(page);
    await page.getByRole("button", { name: "Load more" }).click();
    const response = page.locator("#freedom-feed-response-fixture-video-response");
    await response.scrollIntoViewIfNeeded();

    const shareButton = response.getByRole("button", { name: "Share" });
    await expect(shareButton).toBeEnabled();
    await expect(response.getByRole("button", { name: "Save" })).toHaveCount(0);
    await expect(response.locator("button[disabled]")).toHaveCount(0);
  });

  test("non-prayer overflow menu does not offer misleading Hide post", async ({
    page,
  }) => {
    await openFixtureFeed(page);
    const testimonyPost = page.locator("#freedom-feed-story-fixture-text-testimony");
    await testimonyPost.scrollIntoViewIfNeeded();
    await testimonyPost.getByRole("button", { name: "Post options" }).click();
    await expect(page.getByRole("menuitem", { name: "Hide post" })).toHaveCount(
      0
    );
  });

  test("prayer overflow menu still offers Hide post", async ({ page }) => {
    await openFixtureFeed(page);
    const prayerPost = page.locator("#freedom-feed-story-fixture-prayer-request");
    await prayerPost.scrollIntoViewIfNeeded();
    await prayerPost.getByRole("button", { name: "Post options" }).click();
    await expect(page.getByRole("menuitem", { name: "Hide post" })).toBeVisible();
  });

  test("respond selector keeps sheet open after choosing a reaction", async ({
    page,
  }) => {
    await openFixtureFeed(page);
    const danielPost = page.locator("#freedom-feed-story-fixture-portrait-video");
    await danielPost.scrollIntoViewIfNeeded();
    await danielPost.getByRole("button", { name: /^Respond/ }).click();
    await page.getByRole("button", { name: /Amen/i }).click();
    await expect(
      page.getByRole("dialog", { name: /Choose how you want to respond/i })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Amen/i })).toBeVisible();
  });

  test("Block User is only inside overflow", async ({ page }) => {
    await openFixtureFeed(page);
    await expect(page.getByRole("button", { name: "Block User" })).toHaveCount(0);
    const overflow = page.getByRole("button", { name: "Post options" }).first();
    await overflow.click();
    await expect(page.getByRole("menuitem", { name: "Block user" })).toBeVisible();
  });

  test("portrait praise video renders poster without native controls", async ({
    page,
  }) => {
    await openFixtureFeed(page);
    const praisePost = page.locator(
      "#freedom-feed-story-fixture-praise-portrait-video"
    );
    await praisePost.scrollIntoViewIfNeeded({ timeout: 30000 });
    await expect(praisePost).toBeVisible();
    await expect(praisePost.locator("video[controls]")).toHaveCount(0);
    await expect(
      praisePost.getByRole("button", { name: /Open video in Video Feed/i })
    ).toBeVisible();
  });

  test("no horizontal overflow at 390px and 430px", async ({ browser }) => {
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
});
