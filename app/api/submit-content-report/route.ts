import { createClient } from "@supabase/supabase-js";
import {
  parseSupabaseStorageUrl,
  STORY_VIDEO_BUCKET,
} from "../../../lib/server/prayerMediaValidation";
import {
  buildContentReportInsertPayload,
  getContentReportColumns,
} from "../../../lib/server/contentReportSchema";
import { classifyContentReportInsertError } from "../../../lib/server/classifyContentReportInsertError";
import {
  isPrayerStoryReportTargetUnavailable,
  isVideoResponseReport,
  mergeVideoResponseParentStoryContext,
  type ContentReportStoryRecord,
} from "../../../lib/server/contentReportTarget";
import {
  checkPrayerRateLimit,
  PRAYER_RATE_LIMITS,
  rateLimitKey,
  rateLimitResponse,
} from "../../../lib/server/prayerRateLimit";

const ALLOWED_REASONS = new Set([
  "harassment_bullying",
  "sexual_content",
  "hate_abusive",
  "threats_dangerous",
  "spam_scam",
  "impersonation",
  "privacy_concern",
  "self_harm",
  "other",
  // Legacy Feed / video-feed values still accepted by production tables.
  "inappropriate",
  "harassment_hate",
  "violence_harmful",
  "spam",
]);

const ALLOWED_CONTENT_TYPES = new Set([
  "prayer_request",
  "video_response",
  "written_response",
  "profile",
]);

const MAX_DETAILS = 1000;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

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
      "Reporting is unavailable right now.",
      "service_unavailable",
      503
    );
  }

  const accessToken = readBearerToken(request);
  if (!accessToken) {
    return fail("Please sign in to submit a report.", "unauthorized", 401);
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

  const contentType =
    typeof body.content_type === "string" ? body.content_type.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const details =
    typeof body.details === "string" ? body.details.trim().slice(0, MAX_DETAILS) : "";
  const storyId =
    typeof body.story_id === "string" ? body.story_id.trim() : null;
  const responseId =
    typeof body.response_id === "string" ? body.response_id.trim() : null;
  const reportedUserIdFromClient =
    typeof body.reported_user_id === "string"
      ? body.reported_user_id.trim()
      : null;

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return fail("Invalid report type.", "unsupported_content_type", 400);
  }
  if (!ALLOWED_REASONS.has(reason)) {
    return fail("Please choose a valid reason.", "invalid_reason", 400);
  }
  if (!reportedUserIdFromClient && !storyId && !responseId) {
    return fail("Nothing to report was specified.", "missing_target", 400);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(accessToken);

  if (userError || !user) {
    return fail("Please sign in to submit a report.", "unauthorized", 401);
  }

  const rateCheck = checkPrayerRateLimit(
    rateLimitKey(user.id, "submit_report"),
    PRAYER_RATE_LIMITS.submitReport
  );
  if (rateCheck.allowed === false) {
    return rateLimitResponse(rateCheck.retryAfterSeconds);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let resolvedStoryId = storyId;
  // Never trust client-supplied reported_user_id when a story or response target
  // is provided — always derive from server-side lookups below.
  let resolvedReportedUserId: string | null =
    responseId || storyId ? null : reportedUserIdFromClient;
  let contentSnapshot: string | null = null;
  let mediaReference: string | null = null;
  const reportingVideoResponse = isVideoResponseReport(contentType, responseId);

  if (responseId) {
    const { data: responseData, error: responseError } = await adminClient
      .from("prayer_video_responses")
      .select(
        "id, story_id, user_id, body, video_url, status, removed_at, response_context"
      )
      .eq("id", responseId)
      .maybeSingle();

    if (responseError) {
      console.error("Report: response load failed:", responseError);
      return fail("Could not verify the reported response.", "target_not_found", 404);
    }

    const response = responseData as {
      id: string;
      story_id: string;
      user_id: string;
      body: string | null;
      video_url: string | null;
      status: string | null;
      removed_at: string | null;
      response_context: string | null;
    } | null;

    if (!response || response.removed_at || response.status === "removed") {
      return fail(
        "This response is no longer available to report.",
        "invalid_target",
        404
      );
    }

    resolvedStoryId = resolvedStoryId ?? response.story_id;
    resolvedReportedUserId = response.user_id;
    contentSnapshot = response.body?.trim() || null;
    mediaReference = response.video_url ?? null;

    if (response.response_context && !contentSnapshot) {
      contentSnapshot = `response_context:${response.response_context}`;
    }
  }

  if (resolvedStoryId) {
    const { data: storyData, error: storyError } = await adminClient
      .from("stories")
      .select("id, user_id, story_text, video_url, image_url, status, removed_at, story_type")
      .eq("id", resolvedStoryId)
      .maybeSingle();

    if (storyError) {
      console.error("Report: story load failed:", storyError);
      return fail("Could not verify the reported content.", "target_not_found", 404);
    }

    const story = storyData as ContentReportStoryRecord | null;

    if (reportingVideoResponse) {
      const merged = mergeVideoResponseParentStoryContext({
        story,
        contentSnapshot,
        mediaReference,
      });
      resolvedStoryId = merged.resolvedStoryId;
      contentSnapshot = merged.contentSnapshot;
      mediaReference = merged.mediaReference;

      if (!story) {
        console.error(
          "Report: parent story missing for video response",
          responseId
        );
      }
    } else if (isPrayerStoryReportTargetUnavailable(story)) {
      return fail(
        "This prayer is no longer available to report.",
        "invalid_target",
        404
      );
    } else if (story) {
      resolvedReportedUserId = story.user_id;

      if (!contentSnapshot) {
        contentSnapshot = story.story_text?.trim()?.slice(0, 4000) || null;
      }
      if (!mediaReference) {
        mediaReference = story.video_url ?? story.image_url ?? null;
      }
    }
  }

  if (!resolvedReportedUserId) {
    return fail("Could not identify the reported person.", "missing_reported_user", 400);
  }

  if (resolvedReportedUserId === user.id) {
    return fail("You cannot report your own content.", "self_report", 400);
  }

  // Duplicate-safe: same reporter + same target within 24 hours → idempotent success.
  const reportColumns = await getContentReportColumns(adminClient);
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  let duplicateQuery = adminClient
    .from("content_reports")
    .select("id")
    .eq("reporter_user_id", user.id)
    .gte("created_at", since)
    .limit(1);

  if (responseId && reportColumns.has("prayer_video_response_id")) {
    duplicateQuery = duplicateQuery.eq("prayer_video_response_id", responseId);
  } else if (responseId && reportColumns.has("details")) {
    duplicateQuery = duplicateQuery.ilike(
      "details",
      `%[response_id:${responseId}]%`
    );
  } else if (resolvedStoryId && reportColumns.has("story_id")) {
    duplicateQuery = duplicateQuery.eq("story_id", resolvedStoryId);
    if (reportColumns.has("prayer_video_response_id")) {
      duplicateQuery = duplicateQuery.is("prayer_video_response_id", null);
    }
  } else {
    duplicateQuery = duplicateQuery.eq("reported_user_id", resolvedReportedUserId);
    if (reportColumns.has("story_id")) {
      duplicateQuery = duplicateQuery.is("story_id", null);
    }
    if (reportColumns.has("prayer_video_response_id")) {
      duplicateQuery = duplicateQuery.is("prayer_video_response_id", null);
    }
  }

  const { data: existingReport, error: duplicateError } =
    await duplicateQuery.maybeSingle();
  if (duplicateError) {
    console.error("Report: duplicate probe failed (continuing):", {
      code: duplicateError.code,
      message: duplicateError.message,
      responseId,
      resolvedStoryId,
    });
  }
  if (existingReport?.id) {
    return Response.json({
      ok: true,
      reportId: existingReport.id,
      duplicate: true,
    });
  }

  const secureMediaRef = mediaReference
    ? parseSupabaseStorageUrl(mediaReference, STORY_VIDEO_BUCKET)?.path ??
      mediaReference
    : null;

  const payload = buildContentReportInsertPayload({
    columns: reportColumns,
    reporterUserId: user.id,
    reportedUserId: resolvedReportedUserId,
    reason,
    details,
    responseId,
    resolvedStoryId,
    contentType,
    contentSnapshot,
    mediaReference: secureMediaRef,
  });

  console.info("Report: insert attempt", {
    contentType,
    responseId,
    resolvedStoryId,
    reportedUserId: resolvedReportedUserId,
    reporterUserId: user.id,
    columns: Array.from(reportColumns),
    payloadKeys: Object.keys(payload),
  });

  const { data: inserted, error: insertError } = await adminClient
    .from("content_reports")
    .insert(payload)
    .select("id")
    .single();

  if (insertError) {
    const classified = classifyContentReportInsertError(insertError);
    console.error("Report insert failed:", {
      stage: classified.stage,
      code: insertError.code,
      message: insertError.message,
      contentType,
      responseId,
      payloadKeys: Object.keys(payload),
    });
    return fail(classified.error, classified.code, classified.httpStatus);
  }

  return Response.json({
    ok: true,
    reportId: inserted?.id ?? null,
  });
}
