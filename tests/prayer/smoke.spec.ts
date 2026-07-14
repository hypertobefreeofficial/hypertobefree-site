import { test, expect } from "@playwright/test";
import { primePrayerPage } from "./auth-helpers";

test("prayer page loads without authentication", async ({ page }) => {
  await primePrayerPage(page, { useMock: true });
  await page.goto("/prayer", { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page).toHaveURL(/\/prayer/);
  await expect(page.locator("main")).toBeVisible();

  await page.waitForFunction(
    () => !document.querySelector("main [aria-busy='true']"),
    null,
    { timeout: 30000 }
  );

  await expect(
    page
      .getByRole("heading", { name: "Prayer" })
      .or(page.getByText(/Find someone to pray for/i))
      .or(page.getByRole("button", { name: "Discover" }))
      .first()
  ).toBeVisible({ timeout: 15000 });
});
