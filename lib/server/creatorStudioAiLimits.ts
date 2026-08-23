/**
 * Phase 4A application-level AI cost guards for Creator Studio routes.
 *
 * Limits use the in-process prayerRateLimit buckets (lib/server/prayerRateLimit.ts).
 * They are NOT distributed across Vercel instances — temporary first-layer protection.
 * Phase 4B must replace/augment with distributed rate limiting (Redis/KV or edge).
 */

import {
  checkMultiWindowRateLimit,
  CREATOR_STUDIO_AI_RATE_LIMITS,
  getPrayerRateLimitCountForTests,
  rateLimitKey,
  rateLimitResponse,
  type CreatorStudioAiEndpoint,
} from "./prayerRateLimit";
import { hashUserIdForLog, logAiSafetyEvent } from "./aiSafetyLog";

export const CREATOR_STUDIO_CHAT_OPENAI_TIMEOUT_MS = 15_000;
export const CREATOR_STUDIO_IMAGE_OPENAI_TIMEOUT_MS = 45_000;

/** Default story-shaping JSON is compact (titles, caption, topics). */
export const SHAPE_STORY_DEFAULT_MAX_OUTPUT_TOKENS = 2_048;

/**
 * Creator Studio mode returns 6 structured designs with many string fields.
 * 8192 allows valid JSON while capping runaway completions vs model defaults.
 */
export const SHAPE_STORY_CREATOR_STUDIO_MAX_OUTPUT_TOKENS = 8_192;

/** Single rewrite or 5 short alternatives. */
export const CREATOR_STUDIO_REWRITE_MAX_OUTPUT_TOKENS = 1_024;

export const SHAPE_STORY_MAX_PROMPT_CHARS = 4_000;
export const SHAPE_STORY_MAX_DRAFT_TEXT_CHARS = 12_000;
export const SHAPE_STORY_MAX_PROMPT_ANSWER_CHARS = 2_000;
export const SHAPE_STORY_MAX_PROMPT_ANSWERS = 20;

export const CREATOR_STUDIO_REWRITE_MAX_CURRENT_TEXT_CHARS = 4_000;
export const CREATOR_STUDIO_REWRITE_MAX_LAYER_CHARS = 64;
export const CREATOR_STUDIO_REWRITE_MAX_CONTEXT_KEY_CHARS = 64;
export const CREATOR_STUDIO_REWRITE_MAX_CONTEXT_FIELD_CHARS = 500;

export const CREATOR_STUDIO_IMAGE_MAX_USER_PROMPT_CHARS = 2_000;
export const CREATOR_STUDIO_IMAGE_MAX_DESIGN_FIELD_CHARS = 500;
export const CREATOR_STUDIO_IMAGE_MAX_COLOR_PALETTE_ITEMS = 6;
export const CREATOR_STUDIO_IMAGE_MAX_CONSTRUCTED_PROMPT_CHARS = 8_000;

export function enforceCreatorStudioAiRateLimit(options: {
  userId: string;
  endpoint: CreatorStudioAiEndpoint;
}): Response | null {
  if (!options.userId.trim()) {
    return Response.json(
      {
        ok: false,
        error: "Unauthorized.",
        code: "unauthorized",
      },
      { status: 401 }
    );
  }

  const config = CREATOR_STUDIO_AI_RATE_LIMITS[options.endpoint];
  const key = rateLimitKey(options.userId, options.endpoint);
  const result = checkMultiWindowRateLimit(key, config);

  if (result.allowed === false) {
    logAiSafetyEvent({
      eventType: "rate_limit_rejected",
      endpoint: options.endpoint,
      userIdHash: hashUserIdForLog(options.userId),
      limitWindowMs: result.windowMs,
      reachedProvider: false,
    });
    return rateLimitResponse(result.retryAfterSeconds);
  }

  return null;
}

export function readCreatorStudioAiQuotaCounts(options: {
  userId: string;
  endpoint: CreatorStudioAiEndpoint;
}) {
  const key = rateLimitKey(options.userId, options.endpoint);
  const windows = CREATOR_STUDIO_AI_RATE_LIMITS[options.endpoint].windows;

  return windows.map((windowConfig) => ({
    windowMs: windowConfig.windowMs,
    count: getPrayerRateLimitCountForTests(key, windowConfig),
  }));
}

export function inputRejectedResponse(options: {
  endpoint: string;
  userId: string;
  error: string;
  code?: string;
  field?: string;
}) {
  logAiSafetyEvent({
    eventType: "input_rejected",
    endpoint: options.endpoint,
    userIdHash: hashUserIdForLog(options.userId),
    field: options.field,
    reachedProvider: false,
  });

  return Response.json(
    {
      ok: false,
      error: options.error,
      code: options.code ?? "payload_too_large",
    },
    { status: 400 }
  );
}
