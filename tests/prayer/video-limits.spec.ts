import { test, expect, type Browser } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  apiFetch,
  getUserIdFromToken,
  primePrayerPage,
  readAccessTokenFromStorageState,
  responderStatePath,
} from "./auth-helpers";
import { getPrayerAuthEnv, skipAuthTests } from "./env";
import {
  cleanupFixtureResponses,
  ensureOwnerPrayerFixture,
  setResponseDurationStatus,
  type PrayerFixture,
} from "./fixtures";
import {
  createTemporaryOversizeVideo,
  deleteStorageObject,
  ensureMediaFixtures,
} from "./media-fixtures";

let fixture: PrayerFixture | null = null;

test.describe("@auth video limits", () => {
  test.beforeAll(async () => {
    skipAuthTests(test);
    fixture = await ensureOwnerPrayerFixture();
    test.skip(!fixture, "Could not locate or create owner prayer fixture.");
  });

  test("rejects over-30-second video in the client modal", async ({ browser }) => {
    const media = ensureMediaFixtures();
    test.skip(!media.over30Video, "ffmpeg is required to generate over-30s fixture video.");

    const context = await browser.newContext({
      storageState: responderStatePath(),
    });
    const page = await context.newPage();
    await primePrayerPage(page);
    await page.goto(`/prayer?story=${fixture!.storyId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);

    await page.getByRole("button", { name: /Respond with Prayer/i }).click();
    await page.getByRole("button", { name: /Public video/i }).click();

    const fileInput = page.locator('input[type="file"][accept*="video"]').first();
    await fileInput.setInputFiles(media.over30Video!);
    await expect(page.getByText(/30 seconds/i)).toBeVisible({ timeout: 10000 });
    await context.close();
  });

  test("rejects over-100MB video server-side", async ({ baseURL }) => {
    if (!fixture || !baseURL) return;
    const env = getPrayerAuthEnv();
    test.skip(
      !env.serviceRoleKey,
      "SUPABASE_SERVICE_ROLE_KEY required for oversize storage upload test."
    );

    const token = readAccessTokenFromStorageState(responderStatePath());
    const userId = token ? await getUserIdFromToken(token) : null;
    expect(token && userId).toBeTruthy();

    let oversize: Awaited<ReturnType<typeof createTemporaryOversizeVideo>> = null;
    try {
      oversize = await createTemporaryOversizeVideo(userId!);
      test.skip(!oversize, "Could not upload temporary oversize video.");

      const result = await apiFetch(baseURL, token!, "/api/submit-prayer-video-response", {
        method: "POST",
        body: JSON.stringify({
          prayer_story_id: fixture!.storyId,
          response_video_url: oversize!.publicUrl,
        }),
      });

      expect(result.response.status).toBe(400);
      expect(result.json?.code).toBe("file_too_large");
      expect(String(JSON.stringify(result.json))).not.toMatch(/SUPABASE_SERVICE_ROLE/i);
    } finally {
      if (oversize) {
        await deleteStorageObject(oversize.storagePath).catch(() => {});
        try {
          const fs = await import("fs");
          fs.unlinkSync(oversize.localPath);
        } catch {
          // ignore
        }
      }
    }
  });

  test("failed duration verification cannot be admin-approved", async ({
    baseURL,
  }) => {
    if (!fixture || !baseURL) return;
    const env = getPrayerAuthEnv();
    test.skip(!env.serviceRoleKey || !env.supabaseUrl, "Service role required.");
    test.skip(
      !process.env.PLAYWRIGHT_ADMIN_EMAIL || !process.env.PLAYWRIGHT_ADMIN_PASSWORD,
      "Manual admin test — set PLAYWRIGHT_ADMIN_EMAIL/PASSWORD to automate admin approval guard."
    );

    const token = readAccessTokenFromStorageState(responderStatePath());
    const userId = token ? await getUserIdFromToken(token) : null;
    if (!token || !userId) return;

    const admin = createClient(env.supabaseUrl!, env.serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: row } = await admin
      .from("prayer_video_responses")
      .insert({
        story_id: fixture.storyId,
        user_id: userId,
        video_url: `https://example.test/${userId}/failed-duration.mp4`,
        status: "submitted",
        duration_verification_status: "failed",
      })
      .select("id")
      .single();

    test.skip(!row?.id, "Could not create duration-failed response row.");

    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseURL}/login`);
    await page.getByLabel(/email/i).fill(process.env.PLAYWRIGHT_ADMIN_EMAIL!);
    await page.getByLabel(/password/i).fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL(/\/(feed|account|admin)/, { timeout: 60000 });

    const {
      data: { session },
    } = await page.evaluate(async () => {
      const keys = Object.keys(localStorage).filter((k) => k.includes("-auth-token"));
      const raw = keys[0] ? localStorage.getItem(keys[0]) : null;
      return { data: { session: raw ? JSON.parse(raw) : null } };
    });

    await browser.close();

    const adminAccessToken = session?.access_token as string | undefined;
    test.skip(!adminAccessToken, "Could not obtain admin access token.");

    const attempt = await apiFetch(
      baseURL,
      adminAccessToken!,
      "/api/moderate-prayer-video-response",
      {
        method: "POST",
        body: JSON.stringify({
          response_id: row!.id,
          next_status: "approved",
        }),
      }
    );
    expect([403, 409]).toContain(attempt.response.status);
    expect(attempt.json?.ok).toBe(false);

    await admin.from("prayer_video_responses").delete().eq("id", row!.id);
  });

  test("submitted responses stay non-public without trusted duration", async ({
    baseURL,
  }) => {
    if (!fixture || !baseURL) return;
    const media = ensureMediaFixtures();
    test.skip(!media.validVideo, "ffmpeg required for valid video fixture.");

    const token = readAccessTokenFromStorageState(responderStatePath());
    const userId = token ? await getUserIdFromToken(token) : null;
    if (!token || !userId) return;

    const env = getPrayerAuthEnv();
    if (!env.supabaseUrl || !env.supabaseAnonKey) return;

    const client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const path = `${userId}/playwright-valid-${Date.now()}.mp4`;
    const fs = await import("fs");
    const fileBuffer = fs.readFileSync(media.validVideo!);

    const { error: uploadError } = await client.storage
      .from("story-videos")
      .upload(path, fileBuffer, { contentType: "video/mp4", upsert: false });

    test.skip(Boolean(uploadError), "Could not upload valid test video.");

    const { data: publicUrlData } = client.storage.from("story-videos").getPublicUrl(path);

    const submit = await apiFetch(baseURL, token, "/api/submit-prayer-video-response", {
      method: "POST",
      body: JSON.stringify({
        prayer_story_id: fixture.storyId,
        response_video_url: publicUrlData.publicUrl,
      }),
    });

    expect(submit.response.ok).toBeTruthy();
    expect(submit.json?.status).toBe("submitted");

    const responseId = submit.json?.responseId as string | undefined;
    if (responseId && env.serviceRoleKey) {
      const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await admin.from("prayer_video_responses").delete().eq("id", responseId);
    }

    await client.storage.from("story-videos").remove([path]);
  });
});
