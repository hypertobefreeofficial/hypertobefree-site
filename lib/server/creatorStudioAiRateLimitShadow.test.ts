import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AI_RATE_LIMIT_MODE_ENV,
  RATE_LIMIT_KEY_SALT_ENV,
  UPSTASH_REDIS_REST_TOKEN_ENV,
  UPSTASH_REDIS_REST_URL_ENV,
} from "./rateLimitMode";
import { resetRateLimitBucketsForTests } from "./prayerRateLimit";
import {
  classifyShadowRateLimitOutcome,
  logShadowRateLimitOutcome,
  observeCreatorStudioAiShadowRateLimit,
  resetShadowRateLimitBackendForTests,
  setShadowRateLimitEvalClientFactoryForTests,
} from "./creatorStudioAiRateLimitShadow";

describe("creatorStudioAiRateLimitShadow", () => {
  beforeEach(() => {
    resetRateLimitBucketsForTests();
    resetShadowRateLimitBackendForTests();
    delete process.env[AI_RATE_LIMIT_MODE_ENV];
    delete process.env[UPSTASH_REDIS_REST_URL_ENV];
    delete process.env[UPSTASH_REDIS_REST_TOKEN_ENV];
    delete process.env[RATE_LIMIT_KEY_SALT_ENV];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("classifies all local/distributed comparison outcomes", () => {
    expect(
      classifyShadowRateLimitOutcome({
        localAllowed: true,
        distributedAllowed: true,
      })
    ).toBe("local_allow_distributed_allow");
    expect(
      classifyShadowRateLimitOutcome({
        localAllowed: true,
        distributedAllowed: false,
      })
    ).toBe("local_allow_distributed_block");
    expect(
      classifyShadowRateLimitOutcome({
        localAllowed: false,
        distributedAllowed: true,
      })
    ).toBe("local_block_distributed_allow");
    expect(
      classifyShadowRateLimitOutcome({
        localAllowed: false,
        distributedAllowed: false,
      })
    ).toBe("local_block_distributed_block");
  });

  it("does nothing in local_only mode", async () => {
    const evalMock = vi.fn();
    setShadowRateLimitEvalClientFactoryForTests(() => ({ eval: evalMock }));

    observeCreatorStudioAiShadowRateLimit({
      userId: "user-1",
      endpoint: "shape_story",
      localAllowed: true,
      windows: [{ limit: 10, windowMs: 3_600_000 }],
    });

    await Promise.resolve();
    expect(evalMock).not.toHaveBeenCalled();
  });

  it("logs distributed_unavailable when shadow mode lacks Redis config", async () => {
    process.env[AI_RATE_LIMIT_MODE_ENV] = "shadow";
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    observeCreatorStudioAiShadowRateLimit({
      userId: "user-1",
      endpoint: "shape_story",
      localAllowed: true,
      windows: [{ limit: 10, windowMs: 3_600_000 }],
    });

    await Promise.resolve();
    expect(infoSpy).toHaveBeenCalled();
    const payload = infoSpy.mock.calls.at(-1)?.[1] as { outcome?: string };
    expect(payload.outcome).toBe("distributed_unavailable");
  });

  it("never blocks users when distributed shadow rejects", async () => {
    process.env[AI_RATE_LIMIT_MODE_ENV] = "shadow";
    process.env[UPSTASH_REDIS_REST_URL_ENV] = "https://example.upstash.io";
    process.env[UPSTASH_REDIS_REST_TOKEN_ENV] = "token";
    process.env[RATE_LIMIT_KEY_SALT_ENV] = "salt";

    setShadowRateLimitEvalClientFactoryForTests(() => ({
      eval: vi.fn(async () => [0, 3600]),
    }));

    const { enforceCreatorStudioAiRateLimit } = await import(
      "./creatorStudioAiLimits"
    );

    expect(
      enforceCreatorStudioAiRateLimit({
        userId: "user-1",
        endpoint: "shape_story",
      })
    ).toBeNull();

    await Promise.resolve();
  });

  it("does not log raw user IDs in shadow logs", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const userId = "11111111-2222-3333-4444-555555555555";

    logShadowRateLimitOutcome({
      outcome: "local_allow_distributed_allow",
      endpoint: "shape_story",
      userId,
      localAllowed: true,
      distributed: { allowed: true, retryAfterSeconds: 0, counts: [1, 1] },
    });

    const serialized = JSON.stringify(infoSpy.mock.calls.at(-1));
    expect(serialized).not.toContain(userId);
    expect(serialized).toContain("userIdHash");
  });
});
