import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as journeyReplyPost } from "../../app/api/journey/inbox/reply/route";
import { POST as submitContentReportPost } from "../../app/api/submit-content-report/route";
import { POST as removePrayerVideoResponsePost } from "../../app/api/remove-prayer-video-response/route";
import { handlePublicVideoResponseRequest } from "./publicVideoResponseRequest";
import { ACCOUNT_DELETION_IN_PROGRESS_CODE } from "./accountDeletionActorWriteGuard";

const mockAuthenticate = vi.fn();
const mockCreateJourneyThreadReply = vi.fn();
const mockAssertWriteGuard = vi.fn();
const mockCreateGuardDeps = vi.fn(() => ({ mocked: true }));
const mockGetUser = vi.fn();
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("./authenticateSupabaseRequest", () => ({
  authenticateSupabaseRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));

vi.mock("./journeyInboxReply", () => ({
  createJourneyThreadReply: (...args: unknown[]) =>
    mockCreateJourneyThreadReply(...args),
}));

vi.mock("./accountDeletionActorWriteGuard", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./accountDeletionActorWriteGuard")>();
  return {
    ...actual,
    assertAccountDeletionActorCanWrite: (...args: unknown[]) =>
      mockAssertWriteGuard(...args),
    createAccountDeletionActorWriteGuardDeps: (...args: unknown[]) =>
      mockCreateGuardDeps(...args),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  })),
}));

const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function blockedGuard() {
  return {
    blocked: true as const,
    reason: "deletion_in_progress" as const,
    code: ACCOUNT_DELETION_IN_PROGRESS_CODE,
  };
}

function allowedGuard() {
  return { blocked: false as const };
}

describe("service-role route actor write guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    mockAuthenticate.mockResolvedValue({
      ok: true,
      context: { user: { id: ACTOR }, accessToken: "token" },
    });
    mockAssertWriteGuard.mockResolvedValue(allowedGuard());
    mockCreateJourneyThreadReply.mockResolvedValue({
      ok: true,
      senderMessage: { id: "msg-1" },
    });
  });

  it("blocks journey inbox reply before mutation helper runs", async () => {
    mockAssertWriteGuard.mockResolvedValueOnce(blockedGuard());

    const response = await journeyReplyPost(
      new Request("https://htbf.test/api/journey/inbox/reply", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parentMessageId: "parent-1",
          body: "hello",
          replyMode: "text",
        }),
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: ACCOUNT_DELETION_IN_PROGRESS_CODE,
    });
    expect(mockCreateJourneyThreadReply).not.toHaveBeenCalled();
    expect(mockAssertWriteGuard).toHaveBeenCalledWith(
      ACTOR,
      expect.anything()
    );
  });

  it("blocks submit-content-report before insert path using authenticated actor", async () => {
    mockAssertWriteGuard.mockResolvedValueOnce(blockedGuard());
    mockGetUser.mockResolvedValue({
      data: { user: { id: ACTOR } },
      error: null,
    });

    const response = await submitContentReportPost(
      new Request("https://htbf.test/api/submit-content-report", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content_type: "profile",
          reason: "spam",
          reported_user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        }),
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: ACCOUNT_DELETION_IN_PROGRESS_CODE,
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("allows admin moderation removal without actor write guard", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "admin-user" } },
      error: null,
    });
    mockRpc.mockResolvedValue({ data: true });

    const select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi
          .fn()
          .mockResolvedValueOnce({
            data: {
              id: "resp-1",
              story_id: "story-1",
              user_id: "other-user",
              status: "approved",
              removed_at: null,
            },
            error: null,
          })
          .mockResolvedValueOnce({
            data: { id: "story-1", user_id: "another-user" },
            error: null,
          }),
      }),
    });
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "prayer_video_responses") {
        return { select, update };
      }
      if (table === "stories") {
        return { select };
      }
      return { select };
    });

    const response = await removePrayerVideoResponsePost(
      new Request("https://htbf.test/api/remove-prayer-video-response", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ response_id: "resp-1" }),
      })
    );

    expect(response.status).toBe(200);
    expect(mockAssertWriteGuard).not.toHaveBeenCalled();
  });

  it("blocks public video response submission before submit helper runs", async () => {
    mockAssertWriteGuard.mockResolvedValueOnce(blockedGuard());
    mockGetUser.mockResolvedValue({
      data: { user: { id: ACTOR } },
      error: null,
    });

    const response = await handlePublicVideoResponseRequest({
      request: new Request("https://htbf.test/api/responses/public-video", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source_type: "prayer",
          source_post_id: "story-1",
          response_video_url: "https://example.supabase.co/storage/v1/object/public/story-videos/a.mp4",
        }),
      }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: ACCOUNT_DELETION_IN_PROGRESS_CODE,
    });
  });
});
