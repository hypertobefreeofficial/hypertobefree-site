/**
 * Lightweight in-process rate limiter for Prayer API routes.
 * Resets on cold starts (serverless). Sufficient to throttle abuse per instance;
 * production should add edge/WAF or Redis-backed limits for global enforcement.
 */

import { defaultInMemoryRateLimitBackend } from "./inMemoryRateLimitBackend";
import type { RateLimitCheckInput } from "./rateLimitTypes";

export type PrayerRateLimitConfig = {
  /** Max requests allowed within the window. */
  limit: number;
  /** Window size in milliseconds. */
  windowMs: number;
};

export const PRAYER_RATE_LIMITS = {
  submitVideoResponse: { limit: 10, windowMs: 60 * 60 * 1000 },
  removeVideoResponse: { limit: 30, windowMs: 60 * 60 * 1000 },
  submitReport: { limit: 20, windowMs: 60 * 60 * 1000 },
  moderateResponse: { limit: 60, windowMs: 60 * 60 * 1000 },
  /** Story/prayer text moderation via OpenAI — per authenticated user. */
  moderateStory: { limit: 30, windowMs: 60 * 60 * 1000 },
  /** IP fallback when identity cannot be resolved (should not happen on auth routes). */
  moderateStoryIp: { limit: 60, windowMs: 60 * 60 * 1000 },
  /** Admin-only account deletion dry-run preview — per authenticated admin. */
  accountDeletionDryRun: { limit: 30, windowMs: 60 * 1000 },
  /** Admin-only account deletion execution gate — per authenticated admin. */
  accountDeletionExecute: { limit: 5, windowMs: 60 * 60 * 1000 },
} as const satisfies Record<string, PrayerRateLimitConfig>;

export type MultiWindowRateLimitConfig = {
  windows: readonly PrayerRateLimitConfig[];
};

export type CreatorStudioAiEndpoint =
  | "generate_creator_studio_image"
  | "shape_story"
  | "creator_studio_rewrite_layer";

/**
 * Phase 4A Creator Studio AI limits (in-process only — see creatorStudioAiLimits.ts).
 * Phase 4B: replace with distributed enforcement.
 */
export const CREATOR_STUDIO_AI_RATE_LIMITS = {
  generate_creator_studio_image: {
    windows: [
      { limit: 3, windowMs: 60 * 60 * 1000 },
      { limit: 10, windowMs: 24 * 60 * 60 * 1000 },
    ],
  },
  shape_story: {
    windows: [
      { limit: 10, windowMs: 60 * 60 * 1000 },
      { limit: 30, windowMs: 24 * 60 * 60 * 1000 },
    ],
  },
  creator_studio_rewrite_layer: {
    windows: [
      { limit: 20, windowMs: 60 * 60 * 1000 },
      { limit: 75, windowMs: 24 * 60 * 60 * 1000 },
    ],
  },
} as const satisfies Record<
  CreatorStudioAiEndpoint,
  MultiWindowRateLimitConfig
>;

const LEGACY_LOCAL_KEY_PREFIX = "local";
const LEGACY_LOCAL_NAMESPACE = "legacy";

function legacyRateLimitInput(
  key: string,
  windows: readonly PrayerRateLimitConfig[]
): RateLimitCheckInput {
  return {
    keyPrefix: LEGACY_LOCAL_KEY_PREFIX,
    namespace: LEGACY_LOCAL_NAMESPACE,
    subject: key,
    windows,
  };
}

export function checkPrayerRateLimit(
  key: string,
  config: PrayerRateLimitConfig
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const result = defaultInMemoryRateLimitBackend.checkAndConsumeSync(
    legacyRateLimitInput(key, [config])
  );

  if (result.allowed === false) {
    return {
      allowed: false,
      retryAfterSeconds: result.retryAfterSeconds,
    };
  }

  return { allowed: true };
}

export function checkMultiWindowRateLimit(
  key: string,
  config: MultiWindowRateLimitConfig
):
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; windowMs: number } {
  const result = defaultInMemoryRateLimitBackend.checkAndConsumeSync(
    legacyRateLimitInput(key, config.windows)
  );

  if (result.allowed === false) {
    return {
      allowed: false,
      retryAfterSeconds: result.retryAfterSeconds,
      windowMs: result.blockedWindowMs,
    };
  }

  return { allowed: true };
}

/** Test helper — clears in-process buckets between cases. */
export function resetRateLimitBucketsForTests() {
  defaultInMemoryRateLimitBackend.resetForTests();
}

/** Test helper — reads active in-window count for an endpoint quota key. */
export function getPrayerRateLimitCountForTests(
  key: string,
  config: PrayerRateLimitConfig,
  now = Date.now()
) {
  return defaultInMemoryRateLimitBackend.readCountForTests(
    legacyRateLimitInput(key, [config]),
    config,
    now
  );
}

export function rateLimitKey(userId: string, action: string) {
  return `${action}:${userId}`;
}

export function rateLimitResponse(retryAfterSeconds: number) {
  return Response.json(
    {
      ok: false,
      error: "Too many requests. Please wait and try again.",
      code: "rate_limited",
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    }
  );
}
