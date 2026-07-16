import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  apiFetch,
  getUserIdFromToken,
  primePrayerPage,
  readAccessTokenFromStorageState,
  responderStatePath,
} from "../prayer/auth-helpers";
import { getPrayerAuthEnv, skipAuthTests } from "../prayer/env";
import {
  cleanupFeedPrivateInbox,
  cleanupFeedPrivateMessages,
  cleanupFeedPublicVideoResponses,
  ensureOwnerFeedFixture,
  resetFeedFixtureState,
  type FeedFixture,
} from "./fixtures";
import {
  countInboxMessagesForStory,
  countPublicVideoResponses,
  uploadValidTestVideoForUser,
} from "./helpers";
import {
  createTemporaryOversizeVideo,
  deleteStorageObject,
  ensureMediaFixtures,
} from "../prayer/media-fixtures";

let fixture: FeedFixture | null = null;
let responderUserId: string | null = null;

test.describe("@auth Feed response flows", () => {
  test.beforeAll(async () => {
    skipAuthTests(test);
    fixture = await ensureOwnerFeedFixture();
    test.skip(!fixture, "Could not locate or create owner feed fixture.");
    const token = readAccessTokenFromStorageState(responderStatePath());
    responderUserId = token ? await getUserIdFromToken(token) : null;
  });

  test.beforeEach(async () => {
    if (!fixture || !responderUserId) return;
    await resetFeedFixtureState({ fixture, responderUserId });
  });

  test.afterAll(async () => {
    if (!fixture) return;
    const token = readAccessTokenFromStorageState(responderStatePath());
    const responderUserId = token ? await getUserIdFromToken(token) : null;
    if (!responderUserId) return;

    await cleanupFeedPublicVideoResponses({
      storyId: fixture.storyId,
      responderUserId,
    });
    await cleanupFeedPrivateMessages({
      storyId: fixture.storyId,
      senderUserId: responderUserId,
      recipientUserId: fixture.ownerUserId,
    });
    await cleanupFeedPrivateInbox({
      storyId: fixture.storyId,
      ownerUserId: fixture.ownerUserId,
      responderUserId,
    });
  });

  test("generic public video API rejects unauthenticated requests", async ({
    baseURL,
  }) => {
    if (!fixture || !baseURL) return;

    const result = await apiFetch(baseURL, "", "/api/responses/public-video", {
      method: "POST",
      body: JSON.stringify({
        source_type: "feed",
        source_post_id: fixture.storyId,
        response_video_url: "https://example.test/video.mp4",
      }),
    });

    expect(result.response.status).toBe(401);
    expect(result.json?.code).toBe("unauthorized");
  });

  test("generic public video API rejects missing source post", async ({
    baseURL,
  }) => {
    if (!baseURL) return;
    const token = readAccessTokenFromStorageState(responderStatePath());
    expect(token).toBeTruthy();

    const result = await apiFetch(baseURL, token!, "/api/responses/public-video", {
      method: "POST",
      body: JSON.stringify({
        source_type: "feed",
        source_post_id: "00000000-0000-0000-0000-000000000000",
        response_video_url: "https://example.test/video.mp4",
      }),
    });

    expect(result.response.status).toBe(404);
    expect(result.json?.code).toBe("source_not_found");
  });

  test("generic public video API rejects source type mismatch", async ({
    baseURL,
  }) => {
    if (!fixture || !baseURL) return;
    const token = readAccessTokenFromStorageState(responderStatePath());
    expect(token).toBeTruthy();

    const result = await apiFetch(baseURL, token!, "/api/responses/public-video", {
      method: "POST",
      body: JSON.stringify({
        source_type: "prayer",
        source_post_id: fixture.storyId,
        response_video_url: "https://example.test/video.mp4",
      }),
    });

    expect(result.response.status).toBe(400);
    expect(result.json?.code).toBe("source_type_mismatch");
  });

  test("legacy prayer endpoint infers feed source for feed posts", async ({
    baseURL,
  }) => {
    if (!fixture || !baseURL) return;
    const token = readAccessTokenFromStorageState(responderStatePath());
    expect(token).toBeTruthy();

    const result = await apiFetch(
      baseURL,
      token!,
      "/api/submit-prayer-video-response",
      {
        method: "POST",
        body: JSON.stringify({
          prayer_story_id: fixture.storyId,
          response_video_url: "https://example.test/unowned-video.mp4",
        }),
      }
    );

    expect([400, 403]).toContain(result.response.status);
    expect(result.json?.code).not.toBe("source_not_found");
  });

  test("feed respond sheet uses feed wording and no public comment composer", async ({
    browser,
  }) => {
    if (!fixture) return;

    const context = await browser.newContext({
      storageState: responderStatePath(),
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.sessionStorage.setItem("htbf-mobile-splash-shown", "true");
    });

    await page.goto(`/feed?story=${fixture.storyId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);

    const post = page.locator(`#freedom-feed-story-${fixture.storyId}`);
    await post.scrollIntoViewIfNeeded();
    await post.getByRole("button", { name: /^Respond/ }).click();

    await expect(
      page.getByRole("dialog", { name: /Choose how you want to respond/i })
    ).toBeVisible();
    await expect(page.getByText(/Respond to this post/i)).toBeVisible();
    await expect(page.getByText(/Post a public video response/i)).toBeVisible();
    await expect(page.getByText(/Send a private message/i)).toBeVisible();
    await expect(page.getByText(/private video response/i)).toBeVisible();
    await expect(page.getByText(/prayer message/i)).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: /comment/i })).toHaveCount(0);

    await page.getByRole("button", { name: "Close response options" }).click();
    await context.close();
  });

  test("private message submission stays off the public feed", async ({
    browser,
    baseURL,
  }) => {
    if (!fixture || !baseURL) return;
    const env = getPrayerAuthEnv();
    test.skip(!env.supabaseUrl || !env.supabaseAnonKey, "Supabase required.");

    const token = readAccessTokenFromStorageState(responderStatePath());
    const responderUserId = token ? await getUserIdFromToken(token) : null;
    expect(token && responderUserId).toBeTruthy();

    const context = await browser.newContext({
      storageState: responderStatePath(),
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.sessionStorage.setItem("htbf-mobile-splash-shown", "true");
    });

    await page.goto(`/feed?story=${fixture.storyId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1500);

    const post = page.locator(`#freedom-feed-story-${fixture.storyId}`);
    await post.getByRole("button", { name: /^Respond/ }).click();
    await page.getByRole("button", { name: /Send a private message/i }).click();
    await page
      .getByRole("textbox")
      .fill("Private feed response verification message.");
    await page.getByRole("button", { name: "Send Message" }).click();
    await page.waitForTimeout(1500);

    await expect(page.getByText("Private feed response verification message.")).toHaveCount(
      0
    );

    const client = createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
      global: { headers: { Authorization: `Bearer ${token!}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: threadRows } = await client
      .from("story_video_replies")
      .select("id, message, recipient_user_id")
      .eq("story_id", fixture.storyId)
      .eq("user_id", responderUserId!)
      .order("created_at", { ascending: false })
      .limit(1);

    expect((threadRows ?? []).length).toBeGreaterThan(0);
    expect(threadRows?.[0]?.recipient_user_id).toBe(fixture.ownerUserId);
    expect(String(threadRows?.[0]?.message ?? "")).toContain(
      "Private feed response verification message."
    );

    await context.close();
  });

  test("public video API rejects oversize uploads server-side", async ({
    baseURL,
  }) => {
    if (!fixture || !baseURL) return;
    const env = getPrayerAuthEnv();
    test.skip(!env.serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY required.");

    const token = readAccessTokenFromStorageState(responderStatePath());
    const userId = token ? await getUserIdFromToken(token) : null;
    expect(token && userId).toBeTruthy();

    let oversize: Awaited<ReturnType<typeof createTemporaryOversizeVideo>> = null;
    try {
      oversize = await createTemporaryOversizeVideo(userId!);
      test.skip(!oversize, "Could not upload temporary oversize video.");

      const result = await apiFetch(
        baseURL,
        token!,
        "/api/responses/public-video",
        {
          method: "POST",
          body: JSON.stringify({
            source_type: "feed",
            source_post_id: fixture.storyId,
            response_video_url: oversize!.publicUrl,
          }),
        }
      );

      expect(result.response.status).toBe(400);
      expect(result.json?.code).toBe("file_too_large");
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

  test("blocked responder cannot submit public feed video response", async ({
    baseURL,
  }) => {
    if (!fixture || !baseURL) return;
    const env = getPrayerAuthEnv();
    test.skip(!env.serviceRoleKey || !env.supabaseUrl, "Service role required.");

    const token = readAccessTokenFromStorageState(responderStatePath());
    const responderUserId = token ? await getUserIdFromToken(token) : null;
    expect(token && responderUserId).toBeTruthy();

    const admin = createClient(env.supabaseUrl!, env.serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await admin.from("blocked_users").upsert({
      blocker_user_id: fixture.ownerUserId,
      blocked_user_id: responderUserId!,
    });

    try {
      const result = await apiFetch(
        baseURL,
        token!,
        "/api/responses/public-video",
        {
          method: "POST",
          body: JSON.stringify({
            source_type: "feed",
            source_post_id: fixture.storyId,
            response_video_url: "https://example.test/blocked-test.mp4",
          }),
        }
      );

      expect(result.response.status).toBe(403);
      expect(result.json?.code).toBe("blocked");
    } finally {
      await admin
        .from("blocked_users")
        .delete()
        .eq("blocker_user_id", fixture.ownerUserId)
        .eq("blocked_user_id", responderUserId!);
    }
  });

  test("public feed video response submits with authenticated responder", async ({
    baseURL,
  }) => {
    if (!fixture || !baseURL || !responderUserId) return;
    const env = getPrayerAuthEnv();
    test.skip(!env.supabaseUrl || !env.serviceRoleKey, "Supabase required.");
    test.skip(!ensureMediaFixtures().validVideo, "ffmpeg required for valid video.");

    const token = readAccessTokenFromStorageState(responderStatePath());
    expect(token).toBeTruthy();

    const beforeCount = await countPublicVideoResponses(fixture.storyId);
    const upload = await uploadValidTestVideoForUser(responderUserId, token!);
    test.skip(!upload, "Could not upload valid test video.");

    try {
      const result = await apiFetch(
        baseURL,
        token!,
        "/api/responses/public-video",
        {
          method: "POST",
          body: JSON.stringify({
            source_type: "feed",
            source_post_id: fixture.storyId,
            response_video_url: upload!.publicUrl,
          }),
        }
      );

      expect(result.response.ok).toBeTruthy();
      expect(result.json?.ok).toBe(true);
      expect(result.json?.responseId).toBeTruthy();
      expect(result.json?.status).toBe("submitted");

      const admin = createClient(env.supabaseUrl!, env.serviceRoleKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: row } = await admin
        .from("prayer_video_responses")
        .select("story_id, user_id, status")
        .eq("id", result.json!.responseId as string)
        .maybeSingle();

      expect(row?.story_id).toBe(fixture.storyId);
      expect(row?.user_id).toBe(responderUserId);
      expect(row?.status).toBe("submitted");

      const afterCount = await countPublicVideoResponses(fixture.storyId);
      expect(afterCount).toBe((beforeCount ?? 0) + 1);
    } finally {
      await deleteStorageObject(upload!.storagePath).catch(() => {});
    }
  });

  test("private feed video response creates Journey Inbox item and stays private", async ({
    browser,
  }) => {
    if (!fixture || !responderUserId) return;
    const env = getPrayerAuthEnv();
    test.skip(!env.supabaseUrl || !env.serviceRoleKey, "Supabase required.");
    const media = ensureMediaFixtures();
    test.skip(!media.validVideo, "ffmpeg required for valid video.");

    const token = readAccessTokenFromStorageState(responderStatePath());
    expect(token).toBeTruthy();

    const beforeInbox = await countInboxMessagesForStory(fixture.storyId);
    const beforePublic = await countPublicVideoResponses(fixture.storyId);

    const context = await browser.newContext({
      storageState: responderStatePath(),
      viewport: { width: 430, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.sessionStorage.setItem("htbf-mobile-splash-shown", "true");
    });

    await page.goto(`/feed?story=${fixture.storyId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1500);

    const post = page.locator(`#freedom-feed-story-${fixture.storyId}`);
    await post.getByRole("button", { name: /^Respond/ }).click();
    await page.getByRole("button", { name: /Record a private video response/i }).click();

    const fileInput = page.locator('input[type="file"][accept*="video"]').first();
    await fileInput.setInputFiles(media.validVideo!);
    await page.getByRole("button", { name: /Send Private Video/i }).click();
    await page.waitForTimeout(4000);

    const afterInbox = await countInboxMessagesForStory(fixture.storyId);
    expect(afterInbox).toBe((beforeInbox ?? 0) + 2);

    const afterPublic = await countPublicVideoResponses(fixture.storyId);
    expect(afterPublic).toBe(beforePublic ?? 0);

    const admin = createClient(env.supabaseUrl!, env.serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: inboxRows } = await admin
      .from("inbox_messages")
      .select("user_id, story_id, message_type, video_url")
      .eq("story_id", fixture.storyId)
      .order("created_at", { ascending: false })
      .limit(2);

    expect((inboxRows ?? []).length).toBeGreaterThanOrEqual(2);
    expect(inboxRows?.some((row) => row.user_id === fixture!.ownerUserId)).toBe(
      true
    );
    expect(
      inboxRows?.some((row) => row.message_type === "prayer_video_reply")
    ).toBe(true);
    expect(String(inboxRows?.[0]?.video_url ?? "")).not.toMatch(/^https?:\/\//);

    await expect(page.getByText(/private video response/i)).toHaveCount(0);
    await context.close();
  });

  test("canceling private video response does not create inbox records", async ({
    browser,
  }) => {
    if (!fixture || !responderUserId) return;
    const env = getPrayerAuthEnv();
    test.skip(!env.supabaseUrl || !env.serviceRoleKey, "Supabase required.");
    const media = ensureMediaFixtures();
    test.skip(!media.validVideo, "ffmpeg required for valid video.");

    const beforeInbox = await countInboxMessagesForStory(fixture!.storyId);

    const context = await browser.newContext({
      storageState: responderStatePath(),
      viewport: { width: 430, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.sessionStorage.setItem("htbf-mobile-splash-shown", "true");
    });

    await page.goto(`/feed?story=${fixture!.storyId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1500);

    const post = page.locator(`#freedom-feed-story-${fixture!.storyId}`);
    await post.getByRole("button", { name: /^Respond/ }).click();
    await page.getByRole("button", { name: /Record a private video response/i }).click();
    const fileInput = page.locator('input[type="file"][accept*="video"]').first();
    await fileInput.setInputFiles(media.validVideo!);
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.waitForTimeout(1000);

    const afterInbox = await countInboxMessagesForStory(fixture!.storyId);
    expect(afterInbox).toBe(beforeInbox ?? 0);
    await context.close();
  });

  test("reports preserve feed video response evidence", async ({ baseURL }) => {
    if (!fixture || !baseURL) return;
    const env = getPrayerAuthEnv();
    test.skip(!env.serviceRoleKey || !env.supabaseUrl, "Service role required.");

    const token = readAccessTokenFromStorageState(responderStatePath());
    const responderUserId = token ? await getUserIdFromToken(token) : null;
    expect(token && responderUserId).toBeTruthy();

    const admin = createClient(env.supabaseUrl!, env.serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: responseRow } = await admin
      .from("prayer_video_responses")
      .insert({
        story_id: fixture.storyId,
        user_id: responderUserId!,
        video_url: `https://example.test/${responderUserId}/feed-report-fixture.mp4`,
        status: "submitted",
      })
      .select("id")
      .single();

    test.skip(!responseRow?.id, "Could not seed feed video response for report test.");

    try {
      const report = await apiFetch(baseURL, token!, "/api/submit-content-report", {
        method: "POST",
        body: JSON.stringify({
          content_type: "video_response",
          reason: "spam_scam",
          details: "Feed response moderation verification",
          story_id: fixture.storyId,
          response_id: responseRow!.id,
          reported_user_id: responderUserId,
        }),
      });

      expect(report.response.ok).toBeTruthy();
      expect(report.json?.ok).toBe(true);
    } finally {
      await admin
        .from("prayer_video_responses")
        .delete()
        .eq("id", responseRow!.id);
    }
  });

  test("prayer chooser still opens from prayer detail", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: responderStatePath(),
    });
    const page = await context.newPage();
    await primePrayerPage(page);
    await page.goto("/prayer", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const firstCard = page.locator("article").first();
    await firstCard.click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /Respond with Prayer/i }).click();
    await expect(
      page.getByRole("dialog", { name: /Choose how you want to respond/i })
    ).toBeVisible();
    await expect(page.getByText(/Respond with Prayer/i)).toBeVisible();
    await context.close();
  });
});
