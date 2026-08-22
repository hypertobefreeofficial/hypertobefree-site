import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuthenticateSupabaseRequest = vi.fn();
const mockCreateJourneyThreadReply = vi.fn();
const mockCreateInitialPrivateVideoPrayerReply = vi.fn();

vi.mock("./authenticateSupabaseRequest", () => ({
  authenticateSupabaseRequest: (...args: unknown[]) =>
    mockAuthenticateSupabaseRequest(...args),
}));

vi.mock("./journeyInboxReply", () => ({
  createJourneyThreadReply: (...args: unknown[]) =>
    mockCreateJourneyThreadReply(...args),
  createInitialPrivateVideoPrayerReply: (...args: unknown[]) =>
    mockCreateInitialPrivateVideoPrayerReply(...args),
}));

describe("journey inbox reply routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("rejects logged-out thread reply requests before service-role work", async () => {
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: false,
      status: 401,
      code: "unauthorized",
      error: "Please sign in to continue.",
    });

    const { POST } = await import("../../app/api/journey/inbox/reply/route");
    const response = await POST(
      new Request("https://htbf.test/api/journey/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentMessageId: "parent-message",
          replyMode: "text",
          body: "Hello",
        }),
      })
    );

    expect(response.status).toBe(401);
    expect(mockCreateJourneyThreadReply).not.toHaveBeenCalled();
  });

  it("rejects logged-out initial private prayer requests before service-role work", async () => {
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: false,
      status: 401,
      code: "unauthorized",
      error: "Please sign in to continue.",
    });

    const { POST } = await import("../../app/api/journey/inbox/private-prayer/route");
    const response = await POST(
      new Request("https://htbf.test/api/journey/inbox/private-prayer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId: "story-1",
          body: "Prayer",
          videoUrl: "journey-private-media/user-a/thread-1/object.mp4",
        }),
      })
    );

    expect(response.status).toBe(401);
    expect(mockCreateInitialPrivateVideoPrayerReply).not.toHaveBeenCalled();
  });
});
