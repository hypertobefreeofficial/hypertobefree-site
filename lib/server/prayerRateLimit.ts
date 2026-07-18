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

export function checkPrayerRateLimit(
  key: string,
  config: PrayerRateLimitConfig
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  const bucketKey = `${key}:${config.limit}:${config.windowMs}`;
  const existing = buckets.get(bucketKey);

  if (!existing || now >= existing.resetAt) {
    buckets.set(bucketKey, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true };
  }

  if (existing.count >= config.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000)
      ),
    };
  }

  existing.count += 1;
  return { allowed: true };
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
