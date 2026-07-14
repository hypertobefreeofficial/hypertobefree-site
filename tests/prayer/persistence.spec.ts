import { test, expect, type Browser } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  apiFetch,
  ownerStatePath,
  primePrayerPage,
  readAccessTokenFromStorageState,
  readAccessTokenFromPage,
  responderStatePath,
  signInOnPage,
  signOutViaStorage,
} from "./auth-helpers";
import { skipAuthTests, getPrayerAuthEnv } from "./env";
import { ensureOwnerPrayerFixture, type PrayerFixture } from "./fixtures";

let fixture: PrayerFixture | null = null;

async function withResponderContext(browser: Browser, fn: (page: import("@playwright/test").Page) => Promise<void>) {
  const context = await browser.newContext({
    storageState: responderStatePath(),
  });
  const page = await context.newPage();
  await primePrayerPage(page);
  try {
    await fn(page);
  } finally {
    await context.close();
  }
}

test.describe("@auth persistence", () => {
  test.beforeAll(async () => {
    skipAuthTests(test);
    fixture = await ensureOwnerPrayerFixture();
    test.skip(!fixture, "Could not locate or create owner prayer fixture.");
  });

  test("save, follow, and hide persist across refresh and re-login", async ({
    browser,
    baseURL,
  }) => {
    const env = getPrayerAuthEnv();
    if (!fixture || !env.supabaseUrl || !env.supabaseAnonKey) return;

    await withResponderContext(browser, async (page) => {
      await page.goto(`/prayer?story=${fixture!.storyId}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(2000);

      const saveButton = page.getByRole("button", { name: /^Save$/i });
      if (await saveButton.isVisible()) {
        await saveButton.click();
        await page.waitForTimeout(800);
      } else {
        await page.getByRole("button", { name: "Prayer options" }).click();
        await page.getByRole("menuitem", { name: "Save prayer" }).click();
      }

      const followButton = page.getByRole("button", { name: /^Follow$/i });
      if (await followButton.isVisible()) {
        await followButton.click();
        await page.waitForTimeout(800);
      }

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      await expect(page.getByRole("button", { name: /Saved|Remove from Saved/i })).toBeVisible();

      const token = readAccessTokenFromStorageState(responderStatePath());
      expect(token).toBeTruthy();

      const client = createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: savedRows } = await client
        .from("saved_content")
        .select("story_id")
        .eq("story_id", fixture!.storyId);
      expect((savedRows ?? []).length).toBeGreaterThan(0);

      const { data: followRows } = await client
        .from("prayer_follows")
        .select("story_id")
        .eq("story_id", fixture!.storyId);
      expect((followRows ?? []).length).toBeGreaterThan(0);

      await signOutViaStorage(page);
      await signInOnPage(page, env.responderEmail!, env.responderPassword!);
      const freshToken = await readAccessTokenFromPage(page);
      expect(freshToken).toBeTruthy();
      const freshClient = createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
        global: { headers: { Authorization: `Bearer ${freshToken}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });

      await page.goto(`/prayer?story=${fixture!.storyId}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(1500);

      const { data: savedAfterLogin } = await freshClient
        .from("saved_content")
        .select("story_id")
        .eq("story_id", fixture!.storyId);
      expect((savedAfterLogin ?? []).length).toBeGreaterThan(0);

      await page.getByRole("button", { name: "Prayer options" }).click();
      await page.getByRole("menuitem", { name: "Hide this prayer" }).click();
      await page.waitForTimeout(1000);

      const { data: hiddenRows } = await freshClient
        .from("prayer_hidden_stories")
        .select("story_id")
        .eq("story_id", fixture!.storyId);
      expect((hiddenRows ?? []).length).toBeGreaterThan(0);

      await page.goto("/prayer", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      await expect(page.getByText(fixture!.title.slice(0, 40))).not.toBeVisible();

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      await expect(page.getByText(fixture!.title.slice(0, 40))).not.toBeVisible();

      await page.getByRole("button", { name: "Hidden prayers" }).click();
      await page.getByRole("button", { name: /Restore/i }).first().click();
      await page.waitForTimeout(1000);

      const { data: hiddenAfterRestore } = await freshClient
        .from("prayer_hidden_stories")
        .select("story_id")
        .eq("story_id", fixture!.storyId);
      expect((hiddenAfterRestore ?? []).length).toBe(0);

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
    });
  });
});
