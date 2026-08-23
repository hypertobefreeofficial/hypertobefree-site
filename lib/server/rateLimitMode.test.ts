import { afterEach, describe, expect, it } from "vitest";
import {
  AI_RATE_LIMIT_MODE_ENV,
  parseAiRateLimitMode,
  readEffectiveAiRateLimitMode,
  readAiRateLimitMode,
  RATE_LIMIT_KEY_SALT_ENV,
  UPSTASH_REDIS_REST_TOKEN_ENV,
  UPSTASH_REDIS_REST_URL_ENV,
} from "./rateLimitMode";

describe("rateLimitMode", () => {
  afterEach(() => {
    delete process.env[AI_RATE_LIMIT_MODE_ENV];
    delete process.env[UPSTASH_REDIS_REST_URL_ENV];
    delete process.env[UPSTASH_REDIS_REST_TOKEN_ENV];
    delete process.env[RATE_LIMIT_KEY_SALT_ENV];
  });

  it("defaults to local_only when env is missing", () => {
    expect(readAiRateLimitMode()).toBe("local_only");
    expect(readEffectiveAiRateLimitMode()).toBe("local_only");
  });

  it("treats malformed env values as local_only", () => {
    process.env[AI_RATE_LIMIT_MODE_ENV] = "ENFORCED_NOW";
    expect(parseAiRateLimitMode(process.env[AI_RATE_LIMIT_MODE_ENV])).toBe(
      "local_only"
    );
    expect(readEffectiveAiRateLimitMode()).toBe("local_only");
  });

  it("supports shadow mode when explicitly configured", () => {
    process.env[AI_RATE_LIMIT_MODE_ENV] = "shadow";
    expect(readAiRateLimitMode()).toBe("shadow");
    expect(readEffectiveAiRateLimitMode()).toBe("shadow");
  });

  it("does not activate enforce mode in Phase 4B.1", () => {
    process.env[AI_RATE_LIMIT_MODE_ENV] = "enforce";
    expect(readAiRateLimitMode()).toBe("enforce");
    expect(readEffectiveAiRateLimitMode()).toBe("local_only");
  });
});
