import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMobileNavRefreshDebouncer,
  shouldApplyMobileNavFetchResult,
} from "./mobileNavBadgeRefresh";

describe("mobileNavBadgeRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts only matching generation and user", () => {
    expect(
      shouldApplyMobileNavFetchResult({
        generation: 2,
        activeGeneration: 2,
        userId: "user-a",
        activeUserId: "user-a",
      })
    ).toBe(true);

    expect(
      shouldApplyMobileNavFetchResult({
        generation: 1,
        activeGeneration: 2,
        userId: "user-a",
        activeUserId: "user-a",
      })
    ).toBe(false);

    expect(
      shouldApplyMobileNavFetchResult({
        generation: 2,
        activeGeneration: 2,
        userId: "user-a",
        activeUserId: "user-b",
      })
    ).toBe(false);
  });

  it("debounces rapid refresh events into one fire", () => {
    const onFire = vi.fn();
    const debouncer = createMobileNavRefreshDebouncer(400, onFire);

    debouncer.schedule();
    debouncer.schedule();
    debouncer.schedule();

    expect(onFire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(399);
    expect(onFire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(debouncer.getFireCount()).toBe(1);
  });

  it("cancels pending refresh timers", () => {
    const onFire = vi.fn();
    const debouncer = createMobileNavRefreshDebouncer(400, onFire);

    debouncer.schedule();
    debouncer.cancel();

    vi.advanceTimersByTime(500);
    expect(onFire).not.toHaveBeenCalled();
    expect(debouncer.getPendingTimeoutId()).toBeNull();
  });
});
