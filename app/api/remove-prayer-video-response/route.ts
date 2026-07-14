import { createClient } from "@supabase/supabase-js";
import {
  checkPrayerRateLimit,
  PRAYER_RATE_LIMITS,
  rateLimitKey,
  rateLimitResponse,
} from "../../../lib/server/prayerRateLimit";

type ResponseRow = {
  id: string;
  story_id: string;
  user_id: string;
  status: string | null;
  removed_at: string | null;
};

type StoryRow = {
  id: string;
  user_id: string | null;
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
      "Removing responses is unavailable right now.",
      "service_unavailable",
      503
    );
  }

  const accessToken = readBearerToken(request);
  if (!accessToken) {
    return fail("Please sign in to manage responses.", "unauthorized", 401);
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

  const responseId =
    typeof body.response_id === "string" ? body.response_id.trim() : "";
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 500)
      : null;
  if (!responseId) {
    return fail("A response id is required.", "missing_fields", 400);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(accessToken);
  if (userError || !user) {
    return fail("Please sign in to manage responses.", "unauthorized", 401);
  }

  const rateCheck = checkPrayerRateLimit(
    rateLimitKey(user.id, "remove_video_response"),
    PRAYER_RATE_LIMITS.removeVideoResponse
  );
  if (rateCheck.allowed === false) {
    return rateLimitResponse(rateCheck.retryAfterSeconds);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: responseData, error: responseError } = await adminClient
    .from("prayer_video_responses")
    .select("id, story_id, user_id, status, removed_at")
    .eq("id", responseId)
    .maybeSingle();

  if (responseError) {
    console.error("Remove video response: load failed:", responseError);
    return fail("Could not load the response.", "response_load_failed", 500);
  }
  const response = responseData as ResponseRow | null;
  if (!response) {
    return fail("This response no longer exists.", "not_found", 404);
  }

  // Idempotent: already removed → succeed without changing bookkeeping.
  if (response.removed_at || response.status === "removed") {
    return Response.json({
      ok: true,
      responseId: response.id,
      status: "removed",
      alreadyRemoved: true,
    });
  }

  const { data: storyData, error: storyError } = await adminClient
    .from("stories")
    .select("id, user_id")
    .eq("id", response.story_id)
    .maybeSingle();
  if (storyError) {
    console.error("Remove video response: parent load failed:", storyError);
    return fail("Could not load the parent prayer.", "parent_load_failed", 500);
  }
  const story = storyData as StoryRow | null;

  const isAuthor = response.user_id === user.id;
  const isOwner = Boolean(story?.user_id) && story?.user_id === user.id;

  let isAdmin = false;
  if (!isAuthor && !isOwner) {
    const { data: adminFlag } = await userClient.rpc("current_user_is_admin");
    isAdmin = adminFlag === true;
  }

  if (!isAuthor && !isOwner && !isAdmin) {
    return fail(
      "You do not have permission to remove this response.",
      "forbidden",
      403
    );
  }

  const removalSource = isAuthor
    ? "response_author"
    : isOwner
      ? "prayer_owner"
      : "administrator";

  const { error: updateError } = await adminClient
    .from("prayer_video_responses")
    .update({
      status: "removed",
      removed_at: new Date().toISOString(),
      removed_by_user_id: user.id,
      removal_source: removalSource,
      // Prayer-owner / author removals do not require a reason.
      removal_reason: isAdmin ? reason : null,
    })
    .eq("id", responseId)
    .is("removed_at", null);

  if (updateError) {
    console.error("Remove video response: update failed:", updateError);
    return fail(
      "Could not remove the response. Please try again.",
      "update_failed",
      500
    );
  }

  return Response.json({
    ok: true,
    responseId: response.id,
    status: "removed",
    source: removalSource,
  });
}
