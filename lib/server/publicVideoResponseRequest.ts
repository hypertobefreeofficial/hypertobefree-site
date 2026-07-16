import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  checkPrayerRateLimit,
  PRAYER_RATE_LIMITS,
  rateLimitKey,
  rateLimitResponse,
} from "./prayerRateLimit";
import {
  inferPublicVideoSourceType,
  submitPublicVideoResponse,
  type PublicVideoResponseSourceType,
  type SubmitPublicVideoResponseResult,
} from "./submitPublicVideoResponse";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

export function fail(error: string, code: string, status: number) {
  return Response.json({ ok: false, error, code }, { status });
}

export type HandlePublicVideoResponseRequestOptions = {
  request: Request;
  defaultSourceType?: PublicVideoResponseSourceType;
  legacyPrayerStoryIdField?: boolean;
  unauthenticatedMessage?: string;
};

export async function handlePublicVideoResponseRequest(
  options: HandlePublicVideoResponseRequestOptions
): Promise<Response> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return fail(
      "Public video response submission is unavailable right now.",
      "service_unavailable",
      503
    );
  }

  const accessToken = readBearerToken(options.request);
  if (!accessToken) {
    return fail(
      options.unauthenticatedMessage ??
        "Please sign in to send a public video response.",
      "unauthorized",
      401
    );
  }

  let body: unknown;
  try {
    body = await options.request.json();
  } catch {
    return fail("Invalid request body.", "invalid_body", 400);
  }

  if (!isRecord(body)) {
    return fail("Invalid request body.", "invalid_body", 400);
  }

  const responseVideoUrl =
    typeof body.response_video_url === "string"
      ? body.response_video_url.trim()
      : "";
  const responseThumbnailUrl =
    typeof body.response_thumbnail_url === "string"
      ? body.response_thumbnail_url.trim()
      : "";

  let sourceType = options.defaultSourceType ?? null;
  let sourcePostId = "";

  if (typeof body.source_type === "string") {
    const normalized = body.source_type.trim().toLowerCase();
    if (normalized === "prayer" || normalized === "feed") {
      sourceType = normalized;
    } else {
      return fail("Invalid source type.", "invalid_source_type", 400);
    }
  }

  if (typeof body.source_post_id === "string") {
    sourcePostId = body.source_post_id.trim();
  }

  if (options.legacyPrayerStoryIdField) {
    const legacyId =
      typeof body.prayer_story_id === "string" ? body.prayer_story_id.trim() : "";
    if (!sourcePostId && legacyId) {
      sourcePostId = legacyId;
    }
  }

  if (!sourcePostId || !responseVideoUrl) {
    return fail(
      options.legacyPrayerStoryIdField
        ? "Prayer ID and response video are required."
        : "Source post ID and response video are required.",
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
    return fail(
      options.unauthenticatedMessage ??
        "Please sign in to send a public video response.",
      "unauthorized",
      401
    );
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

  if (!sourceType) {
    const { data: sourceRow, error: sourceLookupError } = await adminClient
      .from("stories")
      .select("story_type")
      .eq("id", sourcePostId)
      .maybeSingle();

    if (sourceLookupError || !sourceRow) {
      return fail(
        "This post is not available for public responses.",
        "source_not_found",
        404
      );
    }

    sourceType = inferPublicVideoSourceType(
      sourceRow as { story_type: string | null }
    );
  }

  const result = await submitPublicVideoResponse(adminClient, {
    sourceType,
    sourcePostId,
    responseVideoUrl,
    responseThumbnailUrl: responseThumbnailUrl || null,
    responderUserId: user.id,
  });

  return toPublicVideoResponseHttp(result);
}

function toPublicVideoResponseHttp(
  result: SubmitPublicVideoResponseResult
): Response {
  if (result.ok !== true) {
    return fail(result.error, result.code, result.status);
  }

  return Response.json({
    ok: true,
    responseId: result.responseId,
    status: result.status,
    sourceType: result.sourceType,
    sourcePostId: result.sourcePostId,
  });
}
