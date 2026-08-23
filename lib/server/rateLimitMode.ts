export const AI_RATE_LIMIT_MODE_ENV = "AI_RATE_LIMIT_MODE";
export const UPSTASH_REDIS_REST_URL_ENV = "UPSTASH_REDIS_REST_URL";
export const UPSTASH_REDIS_REST_TOKEN_ENV = "UPSTASH_REDIS_REST_TOKEN";
export const RATE_LIMIT_KEY_SALT_ENV = "RATE_LIMIT_KEY_SALT";

export type AiRateLimitMode = "local_only" | "shadow" | "enforce";

export function parseAiRateLimitMode(raw?: string): AiRateLimitMode {
  const value = raw?.trim().toLowerCase();
  if (value === "shadow") return "shadow";
  if (value === "enforce") return "enforce";
  return "local_only";
}

export function readAiRateLimitMode(): AiRateLimitMode {
  return parseAiRateLimitMode(process.env[AI_RATE_LIMIT_MODE_ENV]);
}

/**
 * Phase 4B.1: enforce is scaffolded but not active — behaves as local_only.
 */
export function readEffectiveAiRateLimitMode(): "local_only" | "shadow" {
  if (readAiRateLimitMode() === "shadow") {
    return "shadow";
  }

  return "local_only";
}

export function readUpstashRedisConfig():
  | { url: string; token: string }
  | null {
  const url = process.env[UPSTASH_REDIS_REST_URL_ENV]?.trim();
  const token = process.env[UPSTASH_REDIS_REST_TOKEN_ENV]?.trim();

  if (!url || !token) {
    return null;
  }

  return { url, token };
}

export function readRateLimitKeySalt(): string | null {
  const salt = process.env[RATE_LIMIT_KEY_SALT_ENV]?.trim();
  return salt || null;
}

export function isShadowRateLimitConfigReady(): boolean {
  return Boolean(readUpstashRedisConfig() && readRateLimitKeySalt());
}
