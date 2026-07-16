import { test, expect } from "@playwright/test";

const VIDEO_FIXTURE_PATH = "/videos?fixture=1";

async function openVideoFixture(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto(VIDEO_FIXTURE_PATH, { waitUntil: "domcontentloaded" });
  await page.locator("article").first().waitFor({ state: "visible", timeout: 30000 });
}

test.describe("Dedicated video feed — shared response flow", () => {

  test("video feed exposes Respond and opens feed response options", async ({
    page,
  }) => {
    await openVideoFixture(page);

    const respondButton = page.getByRole("button", { name: /^Respond$/ }).first();
    await expect(respondButton).toBeVisible();
    await respondButton.click();

    await expect(page.getByText("Respond to this post")).toBeVisible();
    await expect(page.getByTestId("feed-response-public-video")).toBeVisible();
    await expect(page.getByTestId("feed-response-private-message")).toBeVisible();
    await expect(page.getByTestId("feed-response-private-video")).toBeVisible();
    await expect(page.getByText(/Respond with Prayer/i)).toHaveCount(0);
    await expect(page.getByText(/public video prayer/i)).toHaveCount(0);
    await expect(page.locator("textarea")).toHaveCount(0);
  });

  test("closing the response chooser returns to the same video", async ({
    page,
  }) => {
    await openVideoFixture(page);

    await page.getByRole("button", { name: /^Respond$/ }).first().click();
    await expect(page.getByText("Choose how you want to respond")).toBeVisible();

    await page.getByRole("button", { name: /Close response options/i }).click();
    await expect(page.getByText("Choose how you want to respond")).toHaveCount(0);
    await expect(page.locator("article").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Respond$/ }).first()).toBeVisible();
  });
});
