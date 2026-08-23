import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkMultiWindowRateLimit,
  checkPrayerRateLimit,
  getPrayerRateLimitCountForTests,
  rateLimitKey,
  resetRateLimitBucketsForTests,
} from "./prayerRateLimit";

describe("checkMultiWindowRateLimit", () => {
  beforeEach(() => {
    resetRateLimitBucketsForTests();
  });

  it("allows requests within all windows", () => {
    const result = checkMultiWindowRateLimit("user-a", {
      windows: [
        { limit: 2, windowMs: 60_000 },
        { limit: 5, windowMs: 86_400_000 },
      ],
    });
    expect(result.allowed).toBe(true);
  });

  it("consumes exactly one slot in each window per successful request", () => {
    const key = rateLimitKey("quota-user", "shape_story");
    const hourly = { limit: 10, windowMs: 3_600_000 };
    const daily = { limit: 30, windowMs: 86_400_000 };

    expect(checkMultiWindowRateLimit(key, { windows: [hourly, daily] }).allowed).toBe(
      true
    );

    expect(getPrayerRateLimitCountForTests(key, hourly)).toBe(1);
    expect(getPrayerRateLimitCountForTests(key, daily)).toBe(1);
  });

  it("returns 429 when hourly window is exceeded", () => {
    const config = {
      windows: [
        { limit: 2, windowMs: 60_000 },
        { limit: 100, windowMs: 86_400_000 },
      ],
    };

    expect(checkMultiWindowRateLimit("hourly-user", config).allowed).toBe(true);
    expect(checkMultiWindowRateLimit("hourly-user", config).allowed).toBe(true);
    const blocked = checkMultiWindowRateLimit("hourly-user", config);
    expect(blocked.allowed).toBe(false);
    if (blocked.allowed === false) {
      expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(blocked.windowMs).toBe(60_000);
    }
  });

  it("returns 429 when daily window is exceeded", () => {
    const config = {
      windows: [
        { limit: 100, windowMs: 60_000 },
        { limit: 2, windowMs: 86_400_000 },
      ],
    };

    expect(checkMultiWindowRateLimit("daily-user", config).allowed).toBe(true);
    expect(checkMultiWindowRateLimit("daily-user", config).allowed).toBe(true);
    const blocked = checkMultiWindowRateLimit("daily-user", config);
    expect(blocked.allowed).toBe(false);
    if (blocked.allowed === false) {
      expect(blocked.windowMs).toBe(86_400_000);
    }
  });

  it("uses the longest Retry-After when both windows are exceeded", () => {
    const key = "both-limits-user";
    const hourly = { limit: 1, windowMs: 3_600_000 };
    const daily = { limit: 1, windowMs: 86_400_000 };

    expect(checkMultiWindowRateLimit(key, { windows: [hourly, daily] }).allowed).toBe(
      true
    );

    const blocked = checkMultiWindowRateLimit(key, { windows: [hourly, daily] });
    expect(blocked.allowed).toBe(false);
    if (blocked.allowed === false) {
      expect(blocked.windowMs).toBe(86_400_000);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(3_600);
    }
  });

  it("does not increment counters when any window blocks", () => {
    const config = {
      windows: [{ limit: 1, windowMs: 60_000 }],
    };

    expect(checkMultiWindowRateLimit("no-increment", config).allowed).toBe(true);
    const blocked = checkMultiWindowRateLimit("no-increment", config);
    expect(blocked.allowed).toBe(false);
    expect(getPrayerRateLimitCountForTests("no-increment", config.windows[0])).toBe(
      1
    );
  });

  it("isolates quotas per user", () => {
    const config = {
      windows: [{ limit: 1, windowMs: 60_000 }],
    };

    expect(checkMultiWindowRateLimit("user-one", config).allowed).toBe(true);
    expect(checkMultiWindowRateLimit("user-two", config).allowed).toBe(true);
    expect(checkMultiWindowRateLimit("user-one", config).allowed).toBe(false);
    expect(checkMultiWindowRateLimit("user-two", config).allowed).toBe(false);
  });

  it("isolates quotas per endpoint namespace", () => {
    const hourly = { limit: 1, windowMs: 60_000 };
    const config = { windows: [hourly] };
    const shapeKey = rateLimitKey("shared-user", "shape_story");
    const rewriteKey = rateLimitKey("shared-user", "creator_studio_rewrite_layer");

    expect(checkMultiWindowRateLimit(shapeKey, config).allowed).toBe(true);
    expect(checkMultiWindowRateLimit(shapeKey, config).allowed).toBe(false);

    expect(checkMultiWindowRateLimit(rewriteKey, config).allowed).toBe(true);
    expect(checkMultiWindowRateLimit(rewriteKey, config).allowed).toBe(false);
  });

  it("resets hourly counters after the window expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T12:00:00.000Z"));

    const config = { windows: [{ limit: 1, windowMs: 3_600_000 }] };
    expect(checkMultiWindowRateLimit("window-user", config).allowed).toBe(true);
    expect(checkMultiWindowRateLimit("window-user", config).allowed).toBe(false);

    vi.setSystemTime(new Date("2026-08-22T13:00:01.000Z"));
    expect(checkMultiWindowRateLimit("window-user", config).allowed).toBe(true);

    vi.useRealTimers();
  });

  it("handles rapid sequential requests without exceeding limit within one instance", () => {
    const config = { windows: [{ limit: 3, windowMs: 60_000 }] };
    let allowed = 0;
    let blocked = 0;

    for (let index = 0; index < 5; index += 1) {
      const result = checkMultiWindowRateLimit("rapid-user", config);
      if (result.allowed) {
        allowed += 1;
      } else {
        blocked += 1;
      }
    }

    expect(allowed).toBe(3);
    expect(blocked).toBe(2);
    expect(getPrayerRateLimitCountForTests("rapid-user", config.windows[0])).toBe(3);
  });
});

describe("checkPrayerRateLimit legacy single-window path", () => {
  beforeEach(() => {
    resetRateLimitBucketsForTests();
  });

  it("allows the first request for a user", () => {
    expect(
      checkPrayerRateLimit("moderate:user-1", {
        limit: 30,
        windowMs: 3_600_000,
      }).allowed
    ).toBe(true);
  });
});
