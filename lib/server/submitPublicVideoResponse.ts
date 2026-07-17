import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicVideoEligibility } from "../prayer-connect/eligibility";
import { moderatePublicContent } from "./moderatePublicContent";
import { areUsersBlocked } from "./prayerBlocking";
import { resolveResponseContextFromStory } from "../responses/publicVideoResponseContext";
import {
  PRAYER_MEDIA_LIMITS,
  validateUploadedThumbnailObject,
  validateUploadedVideoObject,
} from "./prayerMediaValidation";

export type PublicVideoResponseSourceType = "prayer" | "feed";

export type SourceStoryRow = {
  id: string;
  user_id: string | null;
  story_type: string | null;
  story_text: string | null;
  status: string | null;
  prayer_status: string | null;
  topics: string[] | null;
};

export type SubmitPublicVideoResponseInput = {
  sourceType: PublicVideoResponseSourceType;
  sourcePostId: string;
  responseVideoUrl: string;
  responseThumbnailUrl?: string | null;
  responderUserId: string;
};

export type SubmitPublicVideoResponseFailure = {
  ok: false;
  error: string;
  code: string;
  status: number;
};

export type SubmitPublicVideoResponseSuccess = {
  ok: true;
  responseId: string;
  status: "submitted";
  sourceType: PublicVideoResponseSourceType;
  sourcePostId: string;
  sourceAuthorUserId: string;
};

export type SubmitPublicVideoResponseResult =
  | SubmitPublicVideoResponseSuccess
  | SubmitPublicVideoResponseFailure;

function failure(
  error: string,
  code: string,
  status: number
): SubmitPublicVideoResponseFailure {
  return { ok: false, error, code, status };
}

export function inferPublicVideoSourceType(
  story: Pick<SourceStoryRow, "story_type">
): PublicVideoResponseSourceType {
  return (story.story_type?.toLowerCase().includes("prayer") ?? false)
    ? "prayer"
    : "feed";
}

export function classifySourceForPublicVideoResponse(input: {
  source: SourceStoryRow | null;
  sourceType: PublicVideoResponseSourceType;
}): SubmitPublicVideoResponseFailure | null {
  const { source, sourceType } = input;

  if (!source) {
    return failure(
      "This post is not available for public responses.",
      "source_not_found",
      404
    );
  }

  const inferredType = inferPublicVideoSourceType(source);
  if (inferredType !== sourceType) {
    return failure(
      "This post is not available for public responses.",
      "source_type_mismatch",
      400
    );
  }

  if (source.status !== "approved") {
    return failure(
      "This post is not available for public responses.",
      "source_unapproved",
      400
    );
  }

  return null;
}

export async function submitPublicVideoResponse(
  adminClient: SupabaseClient,
  input: SubmitPublicVideoResponseInput
): Promise<SubmitPublicVideoResponseResult> {
  const {
    sourceType,
    sourcePostId,
    responseVideoUrl,
    responseThumbnailUrl,
    responderUserId,
  } = input;

  if (!sourcePostId || !responseVideoUrl) {
    return failure(
      "Source post ID and response video are required.",
      "missing_fields",
      400
    );
  }

  const { data: sourceData, error: sourceError } = await adminClient
    .from("stories")
    .select("id, user_id, story_type, story_text, status, prayer_status, topics")
    .eq("id", sourcePostId)
    .maybeSingle();

  if (sourceError) {
    console.error("Public video response: source load failed:", sourceError);
    return failure("Could not load the source post.", "source_load_failed", 500);
  }

  const source = sourceData as SourceStoryRow | null;
  const sourceValidation = classifySourceForPublicVideoResponse({
    source,
    sourceType,
  });
  if (sourceValidation) {
    return sourceValidation;
  }

  // Source is approved and matches requested type.
  const approvedSource = source as SourceStoryRow;

  if (!approvedSource.user_id || approvedSource.user_id === responderUserId) {
    return failure(
      sourceType === "prayer"
        ? "You cannot submit a public response to your own prayer."
        : "You cannot submit a public response to your own post.",
      "self_response",
      400
    );
  }

  const prayerStatus =
    approvedSource.prayer_status === "answered"
      ? "answered"
      : approvedSource.prayer_status === "paused"
        ? "paused"
        : "active";

  const eligibility =
    sourceType === "feed"
      ? { canPublicVideo: true, reason: null }
      : getPublicVideoEligibility({
          topics: approvedSource.topics ?? [],
          prayerStatus,
          requestApproved: true,
        });

  if (!eligibility.canPublicVideo) {
    return failure(
      eligibility.reason ??
        (sourceType === "prayer"
          ? "This prayer request is no longer accepting public responses."
          : "This post is no longer accepting public responses."),
      "not_accepting",
      409
    );
  }

  if (
    await areUsersBlocked(adminClient, responderUserId, approvedSource.user_id)
  ) {
    return failure(
      sourceType === "prayer"
        ? "You cannot respond to this prayer."
        : "You cannot respond to this post.",
      "blocked",
      403
    );
  }

  const { data: duplicateByStory, error: duplicateStoryError } = await adminClient
    .from("prayer_video_responses")
    .select("id, status, removed_at")
    .eq("story_id", sourcePostId)
    .eq("user_id", responderUserId)
    .limit(1)
    .maybeSingle();

  if (duplicateStoryError) {
    console.error(
      "Public video response: duplicate check failed:",
      duplicateStoryError
    );
    return failure(
      "Could not verify submission eligibility.",
      "duplicate_check_failed",
      500
    );
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
    return failure(
      sourceType === "prayer"
        ? "You already submitted a video response for this prayer."
        : "You already submitted a video response for this post.",
      "duplicate_submission",
      409
    );
  }

  const { data: duplicateByUrl, error: duplicateUrlError } = await adminClient
    .from("prayer_video_responses")
    .select("id, status, removed_at")
    .eq("user_id", responderUserId)
    .eq("video_url", responseVideoUrl)
    .limit(1)
    .maybeSingle();

  if (duplicateUrlError) {
    console.error(
      "Public video response: video URL duplicate check failed:",
      duplicateUrlError
    );
    return failure(
      "Could not verify submission eligibility.",
      "duplicate_check_failed",
      500
    );
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
    return failure("This video was already submitted.", "duplicate_video", 409);
  }

  const mediaCheck = await validateUploadedVideoObject({
    adminClient,
    videoUrl: responseVideoUrl,
    ownerUserId: responderUserId,
    maxBytes: PRAYER_MEDIA_LIMITS.maxVideoBytes,
  });

  if (mediaCheck.ok !== true) {
    return failure(mediaCheck.error, mediaCheck.code, 400);
  }

  let validatedThumbnailUrl: string | null = null;
  if (responseThumbnailUrl) {
    const thumbnailCheck = await validateUploadedThumbnailObject({
      adminClient,
      imagePathOrUrl: responseThumbnailUrl,
      ownerUserId: responderUserId,
      maxBytes: PRAYER_MEDIA_LIMITS.maxImageBytes,
    });

    if (thumbnailCheck.ok !== true) {
      return failure(thumbnailCheck.error, thumbnailCheck.code, 400);
    }

    validatedThumbnailUrl = responseThumbnailUrl;
  }

  const responseContext = resolveResponseContextFromStory(approvedSource);

  const insertPayload: Record<string, unknown> = {
    story_id: sourcePostId,
    user_id: responderUserId,
    video_url: responseVideoUrl,
    body: null,
    status: "submitted",
    duration_verification_status: "unavailable",
    response_context: responseContext,
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
    if (
      insertError &&
      /duration_verification_status|thumbnail_url|response_context|ai_/i.test(
        insertError.message
      )
    ) {
      const legacyPayload = { ...insertPayload };
      delete legacyPayload.duration_verification_status;
      delete legacyPayload.thumbnail_url;
      delete legacyPayload.response_context;
      delete legacyPayload.ai_review_status;
      delete legacyPayload.ai_risk_level;
      delete legacyPayload.ai_suggested_action;
      delete legacyPayload.ai_summary;
      delete legacyPayload.ai_flags;

      const { data: legacyInsert, error: legacyError } = await adminClient
        .from("prayer_video_responses")
        .insert(legacyPayload)
        .select("id")
        .single();

      if (!legacyError && legacyInsert?.id) {
        return {
          ok: true,
          responseId: String(legacyInsert.id),
          status: "submitted",
          sourceType,
          sourcePostId,
          sourceAuthorUserId: approvedSource.user_id,
        };
      }
    }

    console.error("Public video response insert failed:", {
      message: insertError?.message ?? null,
      code: insertError?.code ?? null,
      details: insertError?.details ?? null,
      hint: insertError?.hint ?? null,
    });
    return failure(
      sourceType === "prayer"
        ? "Could not save your video prayer. Please try again."
        : "Could not save your video response. Please try again.",
      "insert_failed",
      500
    );
  }

  const responseId = String(insertedData.id);

  try {
    const moderation = await moderatePublicContent({
      storyType: approvedSource.story_type ?? sourceType,
      storyText: [
        approvedSource.story_text?.trim() || "No parent caption was provided.",
        "Public video response submitted.",
      ].join("\n"),
      hasVideo: true,
      hasPhoto: Boolean(validatedThumbnailUrl),
    });

    const aiUpdate: Record<string, unknown> = {
      ai_review_status: moderation.aiReviewStatus,
      ai_risk_level: moderation.aiRiskLevel,
      ai_suggested_action: moderation.aiSuggestedAction,
      ai_summary: moderation.aiSummary,
      ai_flags: moderation.aiFlags,
    };

    const { error: aiError } = await adminClient
      .from("prayer_video_responses")
      .update(aiUpdate)
      .eq("id", responseId);

    if (aiError && !/ai_/i.test(aiError.message)) {
      console.error("Public video response AI metadata update failed:", aiError);
    }
  } catch (error) {
    console.error("Public video response AI moderation failed:", error);
  }

  return {
    ok: true,
    responseId,
    status: "submitted",
    sourceType,
    sourcePostId,
    sourceAuthorUserId: approvedSource.user_id,
  };
}
