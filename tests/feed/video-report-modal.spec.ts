import { test, expect } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3492";

async function openFixtureFeed(page: import("@playwright/test").Page) {
  await page.goto(`${baseURL}/feed?fixture=1`, {
    waitUntil: "networkidle",
  });
  await page.locator("#stories").waitFor({ state: "visible" });
}

async function openVideoReportModal(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Load more" }).click();
  const response = page.locator("#freedom-feed-response-fixture-video-response");
  await response.scrollIntoViewIfNeeded();
  await response.getByRole("button", { name: "Post options" }).click();
  await page.getByRole("menuitem", { name: /Report video/i }).click();
  await expect(page.getByRole("dialog", { name: /Report Video/i })).toBeVisible();
}

test.describe("Feed video report modal", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem("htbf-mobile-splash-shown", "true");
      const session = {
        access_token: "fixture-access-token",
        token_type: "bearer",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        refresh_token: "fixture-refresh-token",
        user: {
          id: "fixture-viewer-user",
          aud: "authenticated",
          role: "authenticated",
        },
      };
      for (const key of Object.keys(window.localStorage)) {
        if (key.includes("-auth-token")) {
          window.localStorage.setItem(key, JSON.stringify(session));
        }
      }
      window.localStorage.setItem(
        "sb-placeholder-auth-token",
        JSON.stringify(session)
      );
    });
  });

  test("shows inline error and keeps fields on API failure", async ({ page }) => {
    await page.route("**/api/submit-content-report", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: "We couldn't submit your report. Please try again.",
          code: "insert_failed",
        }),
      });
    });

    await openFixtureFeed(page);
    await openVideoReportModal(page);
    await page.locator("select").selectOption("other");
    await page.locator("textarea").fill("Test this.");
    await page.getByRole("button", { name: "Submit Report" }).click();

    await expect(
      page.getByRole("alert").filter({
        hasText: "We couldn't submit your report. Please try again.",
      })
    ).toBeVisible();
    await expect(page.getByRole("dialog", { name: /Report Video/i })).toBeVisible();
    await expect(page.locator("textarea")).toHaveValue("Test this.");
    await expect(page.getByRole("button", { name: "Submit Report" })).toBeEnabled();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog", { name: /Report Video/i })).toHaveCount(0);
  });

  test("closes modal and shows success banner on API success", async ({ page }) => {
    await page.route("**/api/submit-content-report", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, reportId: "mock-report-id" }),
      });
    });

    await openFixtureFeed(page);
    await openVideoReportModal(page);
    await page.locator("select").selectOption("other");
    await page.locator("textarea").fill("Test this.");
    await page.getByRole("button", { name: "Submit Report" }).click();

    await expect(page.getByRole("dialog", { name: /Report Video/i })).toHaveCount(0);
    await expect(page.getByText("This video has been reported.")).toBeVisible();
  });
});
