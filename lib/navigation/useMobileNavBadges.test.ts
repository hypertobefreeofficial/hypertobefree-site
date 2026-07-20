import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockOn,
  mockSubscribe,
  mockChannelBuilder,
  mockChannel,
  mockRemoveChannel,
} = vi.hoisted(() => {
  const mockOn = vi.fn();
  const mockSubscribe = vi.fn();
  const mockChannelBuilder = {
    on: mockOn,
    subscribe: mockSubscribe,
  };

  mockOn.mockReturnValue(mockChannelBuilder);
  mockSubscribe.mockReturnValue({ id: "mobile-nav-badges-user-123" });

  const mockChannel = vi.fn(() => mockChannelBuilder);
  const mockRemoveChannel = vi.fn();

  return {
    mockOn,
    mockSubscribe,
    mockChannelBuilder,
    mockChannel,
    mockRemoveChannel,
  };
});

vi.mock("../supabaseClient", () => ({
  supabase: {
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

import { createMobileNavBadgeRealtimeChannel } from "./useMobileNavBadges";

describe("useMobileNavBadges subscription helpers", () => {
  beforeEach(() => {
    mockChannel.mockClear();
    mockOn.mockClear();
    mockSubscribe.mockClear();
    mockOn.mockReturnValue(mockChannelBuilder);
  });

  it("creates one user-scoped channel with inbox and reply listeners", () => {
    const scheduleRefresh = vi.fn();

    createMobileNavBadgeRealtimeChannel("user-123", scheduleRefresh);

    expect(mockChannel).toHaveBeenCalledTimes(1);
    expect(mockChannel).toHaveBeenCalledWith("mobile-nav-badges-user-123");
    expect(mockOn).toHaveBeenCalledTimes(2);
    expect(mockOn.mock.calls[0]?.[1]).toMatchObject({
      table: "inbox_messages",
      filter: "user_id=eq.user-123",
    });
    expect(mockOn.mock.calls[1]?.[1]).toMatchObject({
      table: "story_video_replies",
      filter: "recipient_user_id=eq.user-123",
    });
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
  });
});

describe("mobile nav badge implementation safety", () => {
  it("does not use setInterval in badge modules", () => {
    const files = [
      "lib/navigation/useMobileNavBadges.ts",
      "lib/navigation/mobileNavBadgeCounts.ts",
      "lib/navigation/mobileNavBadgeRefresh.ts",
      "components/LoggedInBottomNav.tsx",
    ];

    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source.includes("setInterval")).toBe(false);
    }
  });
});
