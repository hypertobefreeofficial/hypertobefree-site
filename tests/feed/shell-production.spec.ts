import { test, expect } from "@playwright/test";

test("production build does not expose fixture feed content", async ({
  page,
}) => {
  test.skip(
    process.env.PLAYWRIGHT_FEED_PRODUCTION !== "1",
    "Run against `next start` after build with PLAYWRIGHT_FEED_PRODUCTION=1"
  );

  await page.goto("/feed?fixture=1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await expect(page.getByText(/Fixture:/i)).toHaveCount(0);
  await expect(
    page.locator("#freedom-feed-story-fixture-text-testimony")
  ).toHaveCount(0);
});
