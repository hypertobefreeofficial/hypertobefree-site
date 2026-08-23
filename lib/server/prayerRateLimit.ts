/**
 * Lightweight in-process rate limiter for Prayer API routes.
 * Resets on cold starts (serverless). Sufficient to throttle abuse per instance;
 * production should add edge/WAF or Redis-backed limits for global enforcement.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

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
} as const satisfies Record<string, PrayerRateLimitConfig>;

function bucketKeyFor(key: string, config: PrayerRateLimitConfig) {
  return `${key}:${config.limit}:${config.windowMs}`;
}

function maybeRemoveExpiredBucket(
  bucketKey: string,
  existing: Bucket | undefined,
  now: number
) {
  if (existing && now >= existing.resetAt) {
    buckets.delete(bucketKey);
  }
}

function peekPrayerRateLimit(
  key: string,
  config: PrayerRateLimitConfig,
  now = Date.now()
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const bucketKey = bucketKeyFor(key, config);
  const existing = buckets.get(bucketKey);
  maybeRemoveExpiredBucket(bucketKey, existing, now);
  const active = buckets.get(bucketKey);

  if (!active) {
    return { allowed: true };
  }

  if (active.count >= config.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((active.resetAt - now) / 1000)
      ),
    };
  }

  return { allowed: true };
}

function incrementPrayerRateLimit(
  key: string,
  config: PrayerRateLimitConfig,
  now = Date.now()
) {
  const bucketKey = bucketKeyFor(key, config);
  const existing = buckets.get(bucketKey);
  maybeRemoveExpiredBucket(bucketKey, existing, now);
  const active = buckets.get(bucketKey);

  if (!active) {
    buckets.set(bucketKey, { count: 1, resetAt: now + config.windowMs });
    return;
  }

  active.count += 1;
}

export function checkPrayerRateLimit(
  key: string,
  config: PrayerRateLimitConfig
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const peek = peekPrayerRateLimit(key, config);
  if (peek.allowed === false) {
    return peek;
  }

  incrementPrayerRateLimit(key, config);
  return { allowed: true };
}

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

export function checkMultiWindowRateLimit(
  key: string,
  config: MultiWindowRateLimitConfig
):
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; windowMs: number } {
  const now = Date.now();
  let blocked:
    | { retryAfterSeconds: number; windowMs: number }
    | null = null;

  for (const windowConfig of config.windows) {
    const peek = peekPrayerRateLimit(key, windowConfig, now);
    if (peek.allowed === false) {
      if (
        !blocked ||
        peek.retryAfterSeconds > blocked.retryAfterSeconds
      ) {
        blocked = {
          retryAfterSeconds: peek.retryAfterSeconds,
          windowMs: windowConfig.windowMs,
        };
      }
    }
  }

  if (blocked) {
    return { allowed: false, ...blocked };
  }

  for (const windowConfig of config.windows) {
    incrementPrayerRateLimit(key, windowConfig, now);
  }

  return { allowed: true };
}

/** Test helper — clears in-process buckets between cases. */
export function resetRateLimitBucketsForTests() {
  buckets.clear();
}

/** Test helper — reads active in-window count for an endpoint quota key. */
export function getPrayerRateLimitCountForTests(
  key: string,
  config: PrayerRateLimitConfig,
  now = Date.now()
) {
  const bucketKey = bucketKeyFor(key, config);
  const existing = buckets.get(bucketKey);
  if (!existing || now >= existing.resetAt) {
    return 0;
  }
  return existing.count;
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
