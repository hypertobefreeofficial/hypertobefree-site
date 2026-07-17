import { createClient } from "@supabase/supabase-js";
import {
  canPublishPublicVideoResponse,
  MANUAL_DURATION_ACK_COPY,
} from "../../../lib/prayer-connect/responsePublication";
import {
  checkPrayerRateLimit,
  PRAYER_RATE_LIMITS,
  rateLimitKey,
  rateLimitResponse,
} from "../../../lib/server/prayerRateLimit";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function fail(error: string, code: string, status: number, extra?: Record<string, unknown>) {
  return Response.json({ ok: false, error, code, ...extra }, { status });
}

const ALLOWED_STATUSES = new Set(["approved", "rejected", "removed"]);

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return fail("Moderation is unavailable right now.", "service_unavailable", 503);
  }

  const accessToken = readBearerToken(request);
  if (!accessToken) {
    return fail("Please sign in as an admin.", "unauthorized", 401);
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
  const nextStatus =
    typeof body.next_status === "string" ? body.next_status.trim() : "";
  const acknowledgeUnverifiedDuration =
    body.acknowledge_unverified_duration === true;

  if (!responseId || !ALLOWED_STATUSES.has(nextStatus)) {
    return fail("A valid response id and status are required.", "missing_fields", 400);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(accessToken);

  if (userError || !user) {
    return fail("Please sign in as an admin.", "unauthorized", 401);
  }

  const { data: isAdmin } = await userClient.rpc("current_user_is_admin");
  if (isAdmin !== true) {
    return fail("Admin access is required.", "forbidden", 403);
  }

  const rateCheck = checkPrayerRateLimit(
    rateLimitKey(user.id, "moderate_video_response"),
    PRAYER_RATE_LIMITS.moderateResponse
  );
  if (rateCheck.allowed === false) {
    return rateLimitResponse(rateCheck.retryAfterSeconds);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: responseData, error: responseError } = await adminClient
    .from("prayer_video_responses")
    .select(
      "id, status, duration_verification_status, duration_seconds, removed_at"
    )
    .eq("id", responseId)
    .maybeSingle();

  if (responseError) {
    console.error("Moderate response: load failed:", responseError);
    return fail("Could not load the response.", "response_load_failed", 500);
  }

  const response = responseData as {
    id: string;
    status: string | null;
    duration_verification_status: string | null;
    duration_seconds: number | null;
    removed_at: string | null;
  } | null;

  if (!response) {
    return fail("This response no longer exists.", "not_found", 404);
  }

  if (response.removed_at && nextStatus === "approved") {
    return fail(
      "Removed responses cannot be approved.",
      "response_removed",
      409
    );
  }

  if (response.status === "removed" && nextStatus === "approved") {
    return fail(
      "Removed responses cannot be approved.",
      "response_removed",
      409
    );
  }

  if (nextStatus === "approved") {
    const publication = canPublishPublicVideoResponse(response, {
      acknowledgeUnverifiedDuration: acknowledgeUnverifiedDuration,
    });
    if (!publication.allowed) {
      return fail(
        publication.reason ?? "Cannot publish this response.",
        publication.code,
        publication.requiresManualAck ? 409 : 409,
        publication.requiresManualAck
          ? {
              requiresManualAck: true,
              manualAckCopy: MANUAL_DURATION_ACK_COPY,
            }
          : undefined
      );
    }
  }

  const moderatedAt = new Date().toISOString();
  const updatePayloads: Record<string, unknown>[] = [
    {
      status: nextStatus,
      moderated_at: moderatedAt,
      moderated_by: user.id,
      ...(nextStatus === "removed"
        ? {
            removed_at: moderatedAt,
            removed_by_user_id: user.id,
            removal_source: "administrator",
          }
        : {}),
    },
    {
      status: nextStatus,
      moderated_at: moderatedAt,
      ...(nextStatus === "removed" ? { removed_at: moderatedAt } : {}),
    },
    { status: nextStatus },
  ];

  let persistedStatus: string | null = null;
  let lastUpdateError: string | null = null;

  for (const updatePayload of updatePayloads) {
    const { data, error } = await adminClient
      .from("prayer_video_responses")
      .update(updatePayload)
      .eq("id", responseId)
      .select("id, status")
      .maybeSingle();

    if (!error && data?.status === nextStatus) {
      persistedStatus = data.status;
      break;
    }

    if (error) {
      lastUpdateError = error.message;
      if (!/column|schema|does not exist|could not find/i.test(error.message)) {
        console.error("Moderate response: update failed:", error);
        return fail(
          "Could not update the response in the database.",
          "update_failed",
          500
        );
      }
      continue;
    }

    lastUpdateError = "update_matched_no_rows";
  }

  const { data: verifiedRow, error: verifyError } = await adminClient
    .from("prayer_video_responses")
    .select("status, removed_at")
    .eq("id", responseId)
    .maybeSingle();

  if (verifyError || !verifiedRow) {
    console.error("Moderate response: verification read failed:", verifyError);
    return fail("Could not verify the moderation update.", "verify_failed", 500);
  }

  if (verifiedRow.status !== nextStatus) {
    console.error("Moderate response: status mismatch after update", {
      responseId,
      expected: nextStatus,
      actual: verifiedRow.status,
      lastUpdateError,
      persistedStatus,
    });
    return fail(
      "The response status did not update in the database. Refresh Admin and try again.",
      "status_mismatch",
      500
    );
  }

  return Response.json({
    ok: true,
    responseId,
    status: nextStatus,
    durationVerificationStatus: response.duration_verification_status ?? "unavailable",
  });
}
