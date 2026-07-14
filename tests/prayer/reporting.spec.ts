import { test, expect, type Browser } from "@playwright/test";
import {
  apiFetch,
  primePrayerPage,
  readAccessTokenFromStorageState,
  responderStatePath,
} from "./auth-helpers";
import { skipAuthTests, getPrayerAuthEnv } from "./env";
import { ensureOwnerPrayerFixture, type PrayerFixture } from "./fixtures";

let fixture: PrayerFixture | null = null;

test.describe("@auth reporting", () => {
  test.beforeAll(async () => {
    skipAuthTests(test);
    fixture = await ensureOwnerPrayerFixture();
    test.skip(!fixture, "Could not locate or create owner prayer fixture.");
  });

  test("submits prayer report and handles duplicate safely", async ({
    browser,
    baseURL,
  }) => {
    if (!fixture || !baseURL) return;
    const token = readAccessTokenFromStorageState(responderStatePath());
    expect(token).toBeTruthy();

    const first = await apiFetch(baseURL!, token!, "/api/submit-content-report", {
      method: "POST",
      body: JSON.stringify({
        content_type: "prayer_request",
        reason: "spam_scam",
        details: "Playwright automated report test",
        story_id: fixture.storyId,
        reported_user_id: fixture.ownerUserId,
      }),
    });

    expect(first.response.ok).toBeTruthy();
    expect(first.json?.ok).toBe(true);
    expect(JSON.stringify(first.json ?? {})).not.toMatch(/supabase|postgres|RLS/i);

    const duplicate = await apiFetch(baseURL!, token!, "/api/submit-content-report", {
      method: "POST",
      body: JSON.stringify({
        content_type: "prayer_request",
        reason: "spam_scam",
        details: "Duplicate report attempt",
        story_id: fixture.storyId,
        reported_user_id: fixture.ownerUserId,
      }),
    });

    expect(duplicate.response.ok).toBeTruthy();
    expect(duplicate.json?.ok).toBe(true);

    const context = await browser.newContext({
      storageState: responderStatePath(),
    });
    const page = await context.newPage();
    await primePrayerPage(page);
    await page.goto(`/prayer?story=${fixture.storyId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);
    await page.getByRole("button", { name: "Prayer options" }).click();
    await page.getByRole("menuitem", { name: "Report to Admin" }).click();
    await page.getByLabel(/Harassment or bullying/i).check();
    await page.getByRole("button", { name: "Submit report" }).click();
    await expect(page.getByText("Report received")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/privately/i)).toBeVisible();
    await context.close();
  });

  test("reports video response when fixture response exists", async ({
    baseURL,
  }) => {
    if (!fixture || !baseURL) return;
    const env = getPrayerAuthEnv();
    if (!env.serviceRoleKey || !env.supabaseUrl) {
      test.skip(true, "SUPABASE_SERVICE_ROLE_KEY required for response report fixture lookup.");
      return;
    }

    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: responseRow } = await admin
      .from("prayer_video_responses")
      .select("id, user_id")
      .eq("story_id", fixture.storyId)
      .neq("status", "removed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!responseRow?.id) {
      test.skip(true, "No video response fixture exists yet — run video-limits tests first.");
      return;
    }

    const token = readAccessTokenFromStorageState(responderStatePath());
    const result = await apiFetch(baseURL, token!, "/api/submit-content-report", {
      method: "POST",
      body: JSON.stringify({
        content_type: "video_response",
        reason: "other",
        details: "Playwright video response report",
        story_id: fixture.storyId,
        response_id: responseRow.id,
        reported_user_id: responseRow.user_id,
      }),
    });

    expect(result.response.ok).toBeTruthy();
    expect(result.json?.ok).toBe(true);
  });
});
