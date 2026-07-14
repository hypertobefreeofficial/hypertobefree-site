import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  apiFetch,
  getUserIdFromToken,
  ownerStatePath,
  readAccessTokenFromStorageState,
  responderStatePath,
  thirdStatePath,
} from "./auth-helpers";
import { getPrayerAuthEnv, skipAuthTests } from "./env";
import {
  cleanupFixtureResponses,
  countApprovedVideoResponses,
  ensureOwnerPrayerFixture,
  type PrayerFixture,
} from "./fixtures";

let fixture: PrayerFixture | null = null;
let responseId: string | null = null;

test.describe("@auth response removal authorization", () => {
  test.beforeAll(async () => {
    skipAuthTests(test);
    fixture = await ensureOwnerPrayerFixture();
    test.skip(!fixture, "Could not locate or create owner prayer fixture.");

    const env = getPrayerAuthEnv();
    if (!env.serviceRoleKey || !env.supabaseUrl) {
      test.skip(true, "SUPABASE_SERVICE_ROLE_KEY required for removal authorization tests.");
      return;
    }

    const responderToken = readAccessTokenFromStorageState(responderStatePath());
    const responderUserId = responderToken
      ? await getUserIdFromToken(responderToken)
      : null;
    if (!responderToken || !responderUserId) return;

    await cleanupFixtureResponses({
      storyId: fixture!.storyId,
      responderUserId,
    });

    const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: existingVideo } = await admin
      .from("prayer_video_responses")
      .select("id, video_url")
      .eq("story_id", fixture!.storyId)
      .eq("user_id", responderUserId)
      .limit(1)
      .maybeSingle();

    if (existingVideo?.id) {
      responseId = existingVideo.id;
      return;
    }

    const { data: anyApproved } = await admin
      .from("prayer_video_responses")
      .select("id")
      .eq("story_id", fixture!.storyId)
      .eq("status", "approved")
      .limit(1)
      .maybeSingle();

    if (anyApproved?.id) {
      responseId = anyApproved.id;
      return;
    }

    const placeholderUrl = `https://placeholder.local/${responderUserId}/playwright-response.mp4`;
    const { data: inserted, error } = await admin
      .from("prayer_video_responses")
      .insert({
        story_id: fixture!.storyId,
        user_id: responderUserId,
        video_url: placeholderUrl,
        status: "approved",
        duration_verification_status: "unavailable",
      })
      .select("id")
      .single();

    if (!error && inserted?.id) {
      responseId = inserted.id;
    }
  });

  test("owner removes responder video; unauthorized users receive 403", async ({
    baseURL,
  }) => {
    if (!fixture || !responseId || !baseURL) return;

    const ownerToken = readAccessTokenFromStorageState(ownerStatePath());
    const responderToken = readAccessTokenFromStorageState(responderStatePath());
    const thirdToken = readAccessTokenFromStorageState(thirdStatePath());

    expect(ownerToken).toBeTruthy();
    expect(responderToken).toBeTruthy();

    const beforeCount = await countApprovedVideoResponses(fixture.storyId);

    const ownerRemove = await apiFetch(
      baseURL,
      ownerToken!,
      "/api/remove-prayer-video-response",
      {
        method: "POST",
        body: JSON.stringify({ response_id: responseId }),
      }
    );
    expect(ownerRemove.response.ok).toBeTruthy();
    expect(ownerRemove.json?.ok).toBe(true);

    const afterCount = await countApprovedVideoResponses(fixture.storyId);
    if (beforeCount != null && afterCount != null) {
      expect(afterCount).toBeLessThanOrEqual(beforeCount);
    }

    const reload = await apiFetch(
      baseURL,
      ownerToken!,
      "/api/remove-prayer-video-response",
      {
        method: "POST",
        body: JSON.stringify({ response_id: responseId }),
      }
    );
    expect(reload.response.ok).toBeTruthy();
    expect(reload.json?.alreadyRemoved ?? reload.json?.ok).toBeTruthy();

    if (thirdToken) {
      const thirdAttempt = await apiFetch(
        baseURL,
        thirdToken,
        "/api/remove-prayer-video-response",
        {
          method: "POST",
          body: JSON.stringify({ response_id: responseId }),
        }
      );
      expect(thirdAttempt.response.status).toBe(403);
      expect(thirdAttempt.json?.ok).toBe(false);
    }

    const env = getPrayerAuthEnv();
    if (env.serviceRoleKey && env.supabaseUrl) {
      const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await admin
        .from("prayer_video_responses")
        .update({ status: "approved", removed_at: null, removal_source: null })
        .eq("id", responseId);
    }
  });

  test("responder cannot remove another owner's prayer response", async ({
    baseURL,
  }) => {
    if (!fixture || !responseId || !baseURL) return;
    const responderToken = readAccessTokenFromStorageState(responderStatePath());
    expect(responderToken).toBeTruthy();

    const env = getPrayerAuthEnv();
    if (!env.serviceRoleKey || !env.supabaseUrl) return;

    const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const ownerToken = readAccessTokenFromStorageState(ownerStatePath());
    const ownerUserId = ownerToken ? await getUserIdFromToken(ownerToken) : null;
    if (!ownerUserId) return;

    const { data: foreignStory } = await admin
      .from("stories")
      .select("id")
      .eq("user_id", ownerUserId)
      .neq("id", fixture.storyId)
      .limit(1)
      .maybeSingle();

    if (!foreignStory?.id) {
      test.skip(true, "No secondary owner prayer available for foreign removal test.");
      return;
    }

    const { data: foreignResponse } = await admin
      .from("prayer_video_responses")
      .select("id")
      .eq("story_id", foreignStory.id)
      .limit(1)
      .maybeSingle();

    if (!foreignResponse?.id) {
      test.skip(true, "No foreign prayer response available for authorization test.");
      return;
    }

    const attempt = await apiFetch(
      baseURL,
      responderToken!,
      "/api/remove-prayer-video-response",
      {
        method: "POST",
        body: JSON.stringify({ response_id: foreignResponse.id }),
      }
    );

    expect([403, 404]).toContain(attempt.response.status);
    expect(attempt.json?.ok).toBe(false);
  });
});
