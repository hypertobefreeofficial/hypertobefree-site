import { createClient } from "@supabase/supabase-js";
import { moderatePublicContent } from "../../../lib/server/moderatePublicContent";
import { getPublicVideoEligibility } from "../../../lib/prayer-connect/eligibility";

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

  const { data: insertedData, error: insertError } = await adminClient
    .from("prayer_video_responses")
    .insert({
      story_id: prayerStoryId,
      user_id: user.id,
      video_url: responseVideoUrl,
      body: null,
      status: "submitted",
    })
    .select("id")
    .single();

  if (insertError || !insertedData?.id) {
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
  const decision = await moderatePublicContent({
    storyType: "public_prayer_response",
    storyText: prayer.story_text ?? "",
    hasVideo: true,
    hasPhoto: false,
  });

  if (decision.statusToUse !== "approved") {
    return Response.json({ ok: true, responseId, status: "submitted" });
  }

  const { error: updateError } = await adminClient
    .from("prayer_video_responses")
    .update({
      status: "approved",
      moderated_at: new Date().toISOString(),
    })
    .eq("id", responseId)
    .eq("user_id", user.id)
    .eq("status", "submitted");

  if (updateError) {
    console.error("Could not apply prayer response AI approval:", updateError);
    return Response.json({ ok: true, responseId, status: "submitted" });
  }

  return Response.json({ ok: true, responseId, status: "approved" });
}
