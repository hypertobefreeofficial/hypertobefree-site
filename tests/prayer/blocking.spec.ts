import { test, expect, type Browser } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { primePrayerPage, readAccessTokenFromStorageState, responderStatePath } from "./auth-helpers";
import { getPrayerAuthEnv, skipAuthTests } from "./env";
import { ensureOwnerPrayerFixture, type PrayerFixture } from "./fixtures";

let fixture: PrayerFixture | null = null;

test.describe("@auth blocking", () => {
  test.beforeAll(async () => {
    skipAuthTests(test);
    fixture = await ensureOwnerPrayerFixture();
    test.skip(!fixture, "Could not locate or create owner prayer fixture.");
  });

  test.afterAll(async () => {
    const env = getPrayerAuthEnv();
    const token = readAccessTokenFromStorageState(responderStatePath());
    if (!env.supabaseUrl || !env.supabaseAnonKey || !token || !fixture) return;

    const client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await client
      .from("blocked_users")
      .delete()
      .eq("blocked_user_id", fixture.ownerUserId);
  });

  test("blocking owner hides their prayer from responder discovery", async ({
    browser,
  }) => {
    if (!fixture) return;

    const context = await browser.newContext({
      storageState: responderStatePath(),
    });
    const page = await context.newPage();
    await primePrayerPage(page);

    await page.goto(`/prayer?story=${fixture.storyId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Prayer options" }).click();
    await page.getByRole("menuitem", { name: "Block user" }).click();
    await page.getByRole("button", { name: "Block user" }).click();
    await page.waitForTimeout(1200);

    await page.goto("/prayer", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await expect(page.getByText(fixture.title.slice(0, 40))).not.toBeVisible();

    await context.close();
  });
});
