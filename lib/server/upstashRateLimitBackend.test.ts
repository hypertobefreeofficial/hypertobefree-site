import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRateLimitRedisKey,
  hashRateLimitSubject,
} from "./rateLimitSubjectHash";
import {
  buildUpstashRateLimitArgs,
  buildUpstashRateLimitKeys,
  createUpstashRateLimitBackend,
  parseUpstashRateLimitEvalResult,
  UPSTASH_RATE_LIMIT_TIMEOUT_MS,
} from "./upstashRateLimitBackend";

const hourly = { limit: 2, windowMs: 3_600_000 };
const daily = { limit: 3, windowMs: 86_400_000 };
const salt = "test-salt-value";
const userId = "11111111-2222-3333-4444-555555555555";

describe("rateLimitSubjectHash", () => {
  it("never embeds raw user UUID in Redis keys", () => {
    const keys = buildUpstashRateLimitKeys({
      salt,
      input: {
        keyPrefix: "shadow",
        namespace: "shape_story",
        subject: userId,
        windows: [hourly, daily],
      },
    });

    for (const key of keys) {
      expect(key).not.toContain(userId);
      expect(key.startsWith("rl:v1:shadow:u:shape_story:")).toBe(true);
    }
  });

  it("never embeds raw IP in Redis keys", () => {
    const ip = "203.0.113.45";
    const subjectHash = hashRateLimitSubject({
      namespace: "shape_story",
      subject: ip,
      salt,
    });
    const key = buildRateLimitRedisKey({
      keyPrefix: "shadow",
      subjectType: "ip",
      namespace: "shape_story",
      subjectHash,
      windowLabel: "1h",
    });

    expect(key).not.toContain(ip);
    expect(key).toContain(":ip:shape_story:");
  });

  it("hashes deterministically and changes when salt changes", () => {
    const first = hashRateLimitSubject({
      namespace: "shape_story",
      subject: userId,
      salt: "salt-a",
    });
    const second = hashRateLimitSubject({
      namespace: "shape_story",
      subject: userId,
      salt: "salt-a",
    });
    const differentSalt = hashRateLimitSubject({
      namespace: "shape_story",
      subject: userId,
      salt: "salt-b",
    });

    expect(first).toBe(second);
    expect(first).not.toBe(differentSalt);
  });
});

describe("UpstashRateLimitBackend", () => {
  it("builds Lua args as limit/TTL pairs per window", () => {
    expect(buildUpstashRateLimitArgs([hourly, daily])).toEqual([
      "2",
      "3600",
      "3",
      "86400",
    ]);
  });

  it("parses allow responses from Lua", () => {
    expect(
      parseUpstashRateLimitEvalResult([1, 0, 1, 1], [hourly, daily])
    ).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
      counts: [1, 1],
    });
  });

  it("parses blocked hourly responses without counts", () => {
    const blocked = parseUpstashRateLimitEvalResult([0, 1800], [hourly, daily]);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBe(1800);
    }
  });

  it("parses blocked daily responses", () => {
    const blocked = parseUpstashRateLimitEvalResult([0, 86400], [hourly, daily]);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBe(86400);
      expect(blocked.blockedWindowMs).toBe(daily.windowMs);
    }
  });

  it("rejects malformed Lua responses", () => {
    expect(() =>
      parseUpstashRateLimitEvalResult(["bad"], [hourly, daily])
    ).toThrow("malformed_rate_limit_response");
  });

  it("increments all windows atomically via eval allow path", async () => {
    const evalMock = vi.fn(async () => [1, 0, 1, 1]);
    const backend = createUpstashRateLimitBackend({
      salt,
      client: { eval: evalMock },
    });

    const result = await backend.checkAndConsume({
      keyPrefix: "shadow",
      namespace: "shape_story",
      subject: userId,
      windows: [hourly, daily],
    });

    expect(result.allowed).toBe(true);
    expect(evalMock).toHaveBeenCalledTimes(1);
    const [script, keys, args] = evalMock.mock.calls[0];
    expect(script).toContain("INCR");
    expect(keys).toHaveLength(2);
    expect(args).toEqual(["2", "3600", "3", "86400"]);
    for (const key of keys) {
      expect(key).not.toContain(userId);
    }
  });

  it("returns blocked without requiring follow-up writes", async () => {
    const evalMock = vi.fn(async () => [0, 3600]);
    const backend = createUpstashRateLimitBackend({
      salt,
      client: { eval: evalMock },
    });

    const result = await backend.checkAndConsume({
      keyPrefix: "shadow",
      namespace: "shape_story",
      subject: userId,
      windows: [hourly, daily],
    });

    expect(result.allowed).toBe(false);
    expect(evalMock).toHaveBeenCalledTimes(1);
  });

  it("times out slow Redis eval without retry loops", async () => {
    vi.useFakeTimers();

    const evalMock = vi.fn(
      () =>
        new Promise(() => {
          // Intentionally never resolves — timeout path should win.
        })
    );
    const backend = createUpstashRateLimitBackend({
      salt,
      client: { eval: evalMock },
      timeoutMs: UPSTASH_RATE_LIMIT_TIMEOUT_MS,
    });

    const pending = backend.checkAndConsume({
      keyPrefix: "shadow",
      namespace: "shape_story",
      subject: userId,
      windows: [hourly],
    });
    const assertion = expect(pending).rejects.toThrow("rate_limit_redis_timeout");

    await vi.advanceTimersByTimeAsync(UPSTASH_RATE_LIMIT_TIMEOUT_MS + 1);
    await assertion;
    expect(evalMock).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
