import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryRateLimitBackend } from "./inMemoryRateLimitBackend";
import type { RateLimitCheckInput } from "./rateLimitTypes";

const hourly = { limit: 2, windowMs: 3_600_000 };
const daily = { limit: 3, windowMs: 86_400_000 };

function baseInput(
  overrides: Partial<RateLimitCheckInput> = {}
): RateLimitCheckInput {
  return {
    keyPrefix: "test",
    namespace: "shape_story",
    subject: "user-123",
    windows: [hourly, daily],
    ...overrides,
  };
}

describe("InMemoryRateLimitBackend", () => {
  let backend: InMemoryRateLimitBackend;

  beforeEach(() => {
    backend = new InMemoryRateLimitBackend();
  });

  it("increments both hourly and daily windows together on allow", async () => {
    const input = baseInput();
    const result = await backend.checkAndConsume(input);

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.counts).toEqual([1, 1]);
    }

    expect(backend.readCountForTests(input, hourly)).toBe(1);
    expect(backend.readCountForTests(input, daily)).toBe(1);
  });

  it("does not increment hourly when daily window is already blocked", async () => {
    const wideHourly = { limit: 10, windowMs: 3_600_000 };
    const tightDaily = { limit: 2, windowMs: 86_400_000 };
    const input = baseInput({ windows: [wideHourly, tightDaily] });

    await backend.checkAndConsume(input);
    await backend.checkAndConsume(input);
    const blocked = await backend.checkAndConsume(input);

    expect(blocked.allowed).toBe(false);
    expect(backend.readCountForTests(input, wideHourly)).toBe(2);
    expect(backend.readCountForTests(input, tightDaily)).toBe(2);
  });

  it("does not increment daily when hourly window is already blocked", async () => {
    const input = baseInput({ windows: [hourly] });

    await backend.checkAndConsume(input);
    await backend.checkAndConsume(input);
    const blocked = await backend.checkAndConsume(input);

    expect(blocked.allowed).toBe(false);
    expect(backend.readCountForTests(input, hourly)).toBe(2);
  });

  it("returns the longest Retry-After when multiple windows are blocked", async () => {
    const tightHourly = { limit: 1, windowMs: 3_600_000 };
    const tightDaily = { limit: 1, windowMs: 86_400_000 };
    const input = baseInput({ windows: [tightHourly, tightDaily] });

    await backend.checkAndConsume(input);
    const blocked = await backend.checkAndConsume(input);

    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(blocked.blockedWindowMs).toBe(tightDaily.windowMs);
    }
  });

  it("isolates endpoint namespaces", async () => {
    const shapeInput = baseInput({ namespace: "shape_story" });
    const rewriteInput = baseInput({ namespace: "creator_studio_rewrite_layer" });

    await backend.checkAndConsume(shapeInput);
    await backend.checkAndConsume(shapeInput);

    const shapeBlocked = await backend.checkAndConsume(shapeInput);
    const rewriteAllowed = await backend.checkAndConsume(rewriteInput);

    expect(shapeBlocked.allowed).toBe(false);
    expect(rewriteAllowed.allowed).toBe(true);
  });
});
