import { createClient } from "@supabase/supabase-js";
import { getPublicVideoEligibility } from "../../../lib/prayer-connect/eligibility";
import { areUsersBlocked } from "../../../lib/server/prayerBlocking";
import {
  PRAYER_MEDIA_LIMITS,
  validateUploadedThumbnailObject,
  validateUploadedVideoObject,
} from "../../../lib/server/prayerMediaValidation";
import {
  checkPrayerRateLimit,
  PRAYER_RATE_LIMITS,
  rateLimitKey,
  rateLimitResponse,
} from "../../../lib/server/prayerRateLimit";

type PrayerStoryRow = {
  id: string;
  user_id: string | null;
  story_type: string | null;
  story_text: string | null;
  status: string | null;
  prayer_status: string | null;
  topics: string[] | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function fail(error: string, code: string, status: number) {
  return Response.json({ ok: false, error, code }, { status });
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return fail(
      "Public prayer response submission is unavailable right now.",
      "service_unavailable",
      503
    );
  }

  const accessToken = readBearerToken(request);
  if (!accessToken) {
    return fail("Please sign in to send a public video prayer.", "unauthorized", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request body.", "invalid_body", 400);
  }

  if (!isRecord(body)) {
    return fail("Invalid request body.", "invalid_body", 400);
  }

  const prayerStoryId =
    typeof body.prayer_story_id === "string" ? body.prayer_story_id.trim() : "";
  const responseVideoUrl =
    typeof body.response_video_url === "string"
      ? body.response_video_url.trim()
      : "";
  const responseThumbnailUrl =
    typeof body.response_thumbnail_url === "string"
      ? body.response_thumbnail_url.trim()
      : "";

  if (!prayerStoryId || !responseVideoUrl) {
    return fail(
      "Prayer ID and response video are required.",
      "missing_fields",
      400
    );
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(accessToken);

  if (userError || !user) {
    return fail("Please sign in to send a public video prayer.", "unauthorized", 401);
  }

  const rateCheck = checkPrayerRateLimit(
    rateLimitKey(user.id, "submit_video_response"),
    PRAYER_RATE_LIMITS.submitVideoResponse
  );
  if (rateCheck.allowed === false) {
    return rateLimitResponse(rateCheck.retryAfterSeconds);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: prayerData, error: prayerError } = await adminClient
    .from("stories")
    .select("id, user_id, story_type, story_text, status, prayer_status, topics")
    .eq("id", prayerStoryId)
    .maybeSingle();

  if (prayerError) {
    console.error("Prayer video response: parent load failed:", prayerError);
    return fail("Could not load the parent prayer.", "parent_load_failed", 500);
  }

  const prayer = prayerData as PrayerStoryRow | null;
  const isApprovedPrayer =
    prayer?.status === "approved" &&
    (prayer.story_type?.toLowerCase().includes("prayer") ?? false);

  if (!prayer || !isApprovedPrayer) {
    return fail(
      "This prayer request is not available for public responses.",
      "parent_unavailable",
      400
    );
  }

  if (!prayer.user_id || prayer.user_id === user.id) {
    return fail(
      "You cannot submit a public response to your own prayer.",
      "self_response",
      400
    );
  }

  // Authoritative eligibility — must match the client chooser/modal exactly.
  const prayerStatus =
    prayer.prayer_status === "answered"
      ? "answered"
      : prayer.prayer_status === "paused"
        ? "paused"
        : "active";
  const eligibility = getPublicVideoEligibility({
    topics: prayer.topics ?? [],
    prayerStatus,
    requestApproved: true,
  });

  if (!eligibility.canPublicVideo) {
    return fail(
      eligibility.reason ??
        "This prayer request is no longer accepting public responses.",
      "not_accepting",
      409
    );
  }

  if (
    await areUsersBlocked(adminClient, user.id, prayer.user_id!)
  ) {
    return fail(
      "You cannot respond to this prayer.",
      "blocked",
      403
    );
  }

  const { data: duplicateByStory, error: duplicateStoryError } =
    await adminClient
      .from("prayer_video_responses")
      .select("id, status, removed_at")
      .eq("story_id", prayerStoryId)
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

  if (duplicateStoryError) {
    console.error(
      "Prayer video response: duplicate check failed:",
      duplicateStoryError
    );
    return fail("Could not verify submission eligibility.", "duplicate_check_failed", 500);
  }

  const duplicateRow = duplicateByStory as {
    id: string;
    status: string | null;
    removed_at: string | null;
  } | null;

  if (
    duplicateRow &&
    duplicateRow.status !== "removed" &&
    !duplicateRow.removed_at
  ) {
    return fail(
      "You already submitted a video response for this prayer.",
      "duplicate_submission",
      409
    );
  }

  const { data: duplicateByUrl, error: duplicateUrlError } = await adminClient
    .from("prayer_video_responses")
    .select("id, status, removed_at")
    .eq("user_id", user.id)
    .eq("video_url", responseVideoUrl)
    .limit(1)
    .maybeSingle();

  if (duplicateUrlError) {
    console.error(
      "Prayer video response: video URL duplicate check failed:",
      duplicateUrlError
    );
    return fail("Could not verify submission eligibility.", "duplicate_check_failed", 500);
  }

  const duplicateUrlRow = duplicateByUrl as {
    id: string;
    status: string | null;
    removed_at: string | null;
  } | null;

  if (
    duplicateUrlRow &&
    duplicateUrlRow.status !== "removed" &&
    !duplicateUrlRow.removed_at
  ) {
    return fail(
      "This video was already submitted.",
      "duplicate_video",
      409
    );
  }

  const mediaCheck = await validateUploadedVideoObject({
    adminClient,
    videoUrl: responseVideoUrl,
    ownerUserId: user.id,
    maxBytes: PRAYER_MEDIA_LIMITS.maxVideoBytes,
  });

  if (mediaCheck.ok !== true) {
    return fail(mediaCheck.error, mediaCheck.code, 400);
  }

  let validatedThumbnailUrl: string | null = null;
  if (responseThumbnailUrl) {
    const thumbnailCheck = await validateUploadedThumbnailObject({
      adminClient,
      imagePathOrUrl: responseThumbnailUrl,
      ownerUserId: user.id,
      maxBytes: PRAYER_MEDIA_LIMITS.maxImageBytes,
    });

    if (thumbnailCheck.ok !== true) {
      return fail(thumbnailCheck.error, thumbnailCheck.code, 400);
    }

    validatedThumbnailUrl = responseThumbnailUrl;
  }

  const insertPayload: Record<string, unknown> = {
    story_id: prayerStoryId,
    user_id: user.id,
    video_url: responseVideoUrl,
    body: null,
    status: "submitted",
    duration_verification_status: "unavailable",
  };

  if (validatedThumbnailUrl) {
    insertPayload.thumbnail_url = validatedThumbnailUrl;
  }

  const { data: insertedData, error: insertError } = await adminClient
    .from("prayer_video_responses")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertError || !insertedData?.id) {
    // Retry without optional columns when migrations are not applied yet.
    if (
      insertError &&
      /duration_verification_status|thumbnail_url/i.test(insertError.message)
    ) {
      const legacyPayload = { ...insertPayload };
      delete legacyPayload.duration_verification_status;
      delete legacyPayload.thumbnail_url;

      const { data: legacyInsert, error: legacyError } = await adminClient
        .from("prayer_video_responses")
        .insert(legacyPayload)
        .select("id")
        .single();

      if (!legacyError && legacyInsert?.id) {
        return Response.json({
          ok: true,
          responseId: String(legacyInsert.id),
          status: "submitted",
        });
      }
    }

    console.error("Prayer video response insert failed:", {
      message: insertError?.message ?? null,
      code: insertError?.code ?? null,
      details: insertError?.details ?? null,
      hint: insertError?.hint ?? null,
    });
    return fail(
      "Could not save your video prayer. Please try again.",
      "insert_failed",
      500
    );
  }

  const responseId = String(insertedData.id);

  // Server-side video duration is NOT verified here — Supabase Storage metadata
  // does not include duration and probing requires a dedicated worker (ffprobe).
  // Public video responses remain in `submitted` until moderation / media probe
  // approves them. Size, MIME, ownership, and bucket are verified above.
  return Response.json({ ok: true, responseId, status: "submitted" });
}
