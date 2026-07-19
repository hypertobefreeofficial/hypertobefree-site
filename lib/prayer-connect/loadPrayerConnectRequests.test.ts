import { describe, expect, it } from "vitest";
import {
  PRAYER_CONNECT_INITIAL_FETCH_LIMIT,
  PRAYER_CONNECT_MAX_ACCUMULATED,
  PRAYER_CONNECT_PAGE_FETCH_LIMIT,
} from "./loadPrayerConnectRequests";

describe("Prayer connect fetch limits", () => {
  it("uses a smaller initial fetch than the previous 300-row default", () => {
    expect(PRAYER_CONNECT_INITIAL_FETCH_LIMIT).toBeLessThan(300);
    expect(PRAYER_CONNECT_PAGE_FETCH_LIMIT).toBe(PRAYER_CONNECT_INITIAL_FETCH_LIMIT);
  });

  it("keeps an explicit accumulation cap", () => {
    expect(PRAYER_CONNECT_MAX_ACCUMULATED).toBe(300);
  });
});
