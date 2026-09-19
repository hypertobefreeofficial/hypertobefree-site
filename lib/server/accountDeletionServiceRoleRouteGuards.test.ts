import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as journeyReplyPost } from "../../app/api/journey/inbox/reply/route";
import { POST as moderatePrayerVideoResponsePost } from "../../app/api/moderate-prayer-video-response/route";
import { POST as submitContentReportPost } from "../../app/api/submit-content-report/route";
import { POST as removePrayerVideoResponsePost } from "../../app/api/remove-prayer-video-response/route";
import { handlePublicVideoResponseRequest } from "./publicVideoResponseRequest";
import { ACCOUNT_DELETION_IN_PROGRESS_CODE } from "./accountDeletionActorWriteGuard";

const mockAuthenticate = vi.fn();
const mockCreateJourneyThreadReply = vi.fn();
const mockAssertWriteGuard = vi.fn();
const mockAssertPrayerTargets = vi.fn();
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
    assertPrayerVideoResponseMutationTargetsNotFrozen: (...args: unknown[]) =>
      mockAssertPrayerTargets(...args),
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
const RESPONDER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STORY_OWNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ADMIN_USER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const UNRELATED = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

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

function jsonRequest(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function setupRemoveAdminMocks(options: {
  responseUserId: string | null;
  storyOwnerUserId: string | null;
}) {
  mockGetUser.mockResolvedValue({
    data: { user: { id: ADMIN_USER } },
    error: null,
  });
  mockRpc.mockResolvedValue({ data: true });

  const responseSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "resp-1",
          story_id: "story-1",
          user_id: options.responseUserId,
          status: "approved",
          removed_at: null,
        },
        error: null,
      }),
    }),
  });
  const storySelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "story-1", user_id: options.storyOwnerUserId },
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
      return { select: responseSelect, update };
    }
    if (table === "stories") {
      return { select: storySelect };
    }
    return { select: responseSelect };
  });

  return { update };
}

function setupModerateAdminMocks(options: {
  responseUserId: string | null;
  storyOwnerUserId: string | null;
}) {
  mockGetUser.mockResolvedValue({
    data: { user: { id: ADMIN_USER } },
    error: null,
  });
  mockRpc.mockResolvedValue({ data: true });

  const responseRow = {
    id: "resp-1",
    user_id: options.responseUserId,
    story_id: "story-1",
    status: "approved",
    duration_verification_status: "verified",
    duration_seconds: 30,
    removed_at: null,
  };

  const responseSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi
        .fn()
        .mockResolvedValueOnce({ data: responseRow, error: null })
        .mockResolvedValueOnce({
          data: { status: "rejected", removed_at: null },
          error: null,
        }),
    }),
  });

  const storySelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "story-1", user_id: options.storyOwnerUserId },
        error: null,
      }),
    }),
  });

  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: "resp-1", status: "rejected" },
          error: null,
        }),
      }),
    }),
  });

  mockFrom.mockImplementation((table: string) => {
    if (table === "prayer_video_responses") {
      return { select: responseSelect, update };
    }
    if (table === "stories") {
      return { select: storySelect };
    }
    return { select: responseSelect };
  });

  return { update };
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
    mockAssertPrayerTargets.mockResolvedValue(allowedGuard());
    mockCreateJourneyThreadReply.mockResolvedValue({
      ok: true,
      senderMessage: { id: "msg-1" },
    });
  });

  it("blocks journey inbox reply before mutation helper runs", async () => {
    mockAssertWriteGuard.mockResolvedValueOnce(blockedGuard());

    const response = await journeyReplyPost(
      jsonRequest("https://htbf.test/api/journey/inbox/reply", {
        parentMessageId: "parent-1",
        body: "hello",
        replyMode: "text",
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: ACCOUNT_DELETION_IN_PROGRESS_CODE,
    });
    expect(mockCreateJourneyThreadReply).not.toHaveBeenCalled();
    expect(mockAssertWriteGuard).toHaveBeenCalledWith(ACTOR, expect.anything());
  });

  it("blocks submit-content-report before insert path using authenticated actor", async () => {
    mockAssertWriteGuard.mockResolvedValueOnce(blockedGuard());
    mockGetUser.mockResolvedValue({
      data: { user: { id: ACTOR } },
      error: null,
    });

    const response = await submitContentReportPost(
      jsonRequest("https://htbf.test/api/submit-content-report", {
        content_type: "profile",
        reason: "spam",
        reported_user_id: UNRELATED,
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: ACCOUNT_DELETION_IN_PROGRESS_CODE,
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("blocks public video response submission before submit helper runs", async () => {
    mockAssertWriteGuard.mockResolvedValueOnce(blockedGuard());
    mockGetUser.mockResolvedValue({
      data: { user: { id: ACTOR } },
      error: null,
    });

    const response = await handlePublicVideoResponseRequest({
      request: jsonRequest("https://htbf.test/api/responses/public-video", {
        source_type: "prayer",
        source_post_id: "story-1",
        response_video_url:
          "https://example.supabase.co/storage/v1/object/public/story-videos/a.mp4",
      }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: ACCOUNT_DELETION_IN_PROGRESS_CODE,
    });
  });
});

describe("prayer video response target guards (3B.2C)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    mockAssertPrayerTargets.mockResolvedValue(allowedGuard());
    mockAssertWriteGuard.mockResolvedValue(allowedGuard());
  });

  describe("moderate-prayer-video-response", () => {
    it("MOD-A: allows when responder and story owner are not deleting", async () => {
      const { update } = setupModerateAdminMocks({
        responseUserId: RESPONDER,
        storyOwnerUserId: STORY_OWNER,
      });

      const response = await moderatePrayerVideoResponsePost(
        jsonRequest("https://htbf.test/api/moderate-prayer-video-response", {
          response_id: "resp-1",
          next_status: "rejected",
        })
      );

      expect(response.status).toBe(200);
      expect(mockAssertPrayerTargets).toHaveBeenCalledWith({
        responseUserId: RESPONDER,
        storyOwnerUserId: STORY_OWNER,
        deps: expect.anything(),
      });
      expect(update).toHaveBeenCalled();
    });

    it("MOD-B: blocks when responder is deletion_in_progress on survivor story", async () => {
      setupModerateAdminMocks({
        responseUserId: RESPONDER,
        storyOwnerUserId: STORY_OWNER,
      });
      mockAssertPrayerTargets.mockResolvedValueOnce(blockedGuard());

      const response = await moderatePrayerVideoResponsePost(
        jsonRequest("https://htbf.test/api/moderate-prayer-video-response", {
          response_id: "resp-1",
          next_status: "rejected",
        })
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        code: ACCOUNT_DELETION_IN_PROGRESS_CODE,
      });
    });

    it("MOD-C/D: target guard invoked for story owner and responder paths", async () => {
      setupModerateAdminMocks({
        responseUserId: STORY_OWNER,
        storyOwnerUserId: STORY_OWNER,
      });

      await moderatePrayerVideoResponsePost(
        jsonRequest("https://htbf.test/api/moderate-prayer-video-response", {
          response_id: "resp-1",
          next_status: "rejected",
        })
      );

      expect(mockAssertPrayerTargets).toHaveBeenCalledWith({
        responseUserId: STORY_OWNER,
        storyOwnerUserId: STORY_OWNER,
        deps: expect.anything(),
      });
    });

    it("MOD-F/G: null responder and story owner skip guard without crash", async () => {
      const { update } = setupModerateAdminMocks({
        responseUserId: null,
        storyOwnerUserId: null,
      });

      const response = await moderatePrayerVideoResponsePost(
        jsonRequest("https://htbf.test/api/moderate-prayer-video-response", {
          response_id: "resp-1",
          next_status: "rejected",
        })
      );

      expect(response.status).toBe(200);
      expect(mockAssertPrayerTargets).toHaveBeenCalledWith({
        responseUserId: null,
        storyOwnerUserId: null,
        deps: expect.anything(),
      });
      expect(update).toHaveBeenCalled();
    });
  });

  describe("remove-prayer-video-response admin branch", () => {
    it("REM-I: allows admin removal when targets are not deleting", async () => {
      const { update } = setupRemoveAdminMocks({
        responseUserId: RESPONDER,
        storyOwnerUserId: STORY_OWNER,
      });

      const response = await removePrayerVideoResponsePost(
        jsonRequest("https://htbf.test/api/remove-prayer-video-response", {
          response_id: "resp-1",
        })
      );

      expect(response.status).toBe(200);
      expect(mockAssertWriteGuard).not.toHaveBeenCalled();
      expect(mockAssertPrayerTargets).toHaveBeenCalledWith({
        responseUserId: RESPONDER,
        storyOwnerUserId: STORY_OWNER,
        deps: expect.anything(),
      });
      expect(update).toHaveBeenCalled();
    });

    it("REM-J/K/L: blocks admin removal when target guard fails", async () => {
      setupRemoveAdminMocks({
        responseUserId: RESPONDER,
        storyOwnerUserId: STORY_OWNER,
      });
      mockAssertPrayerTargets.mockResolvedValueOnce(blockedGuard());

      const response = await removePrayerVideoResponsePost(
        jsonRequest("https://htbf.test/api/remove-prayer-video-response", {
          response_id: "resp-1",
        })
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        code: ACCOUNT_DELETION_IN_PROGRESS_CODE,
      });
    });

    it("REM-N: author path still uses actor write guard only", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: RESPONDER } },
        error: null,
      });
      mockRpc.mockResolvedValue({ data: false });

      const responseSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "resp-1",
              story_id: "story-1",
              user_id: RESPONDER,
              status: "approved",
              removed_at: null,
            },
            error: null,
          }),
        }),
      });
      const storySelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: "story-1", user_id: STORY_OWNER },
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
          return { select: responseSelect, update };
        }
        if (table === "stories") {
          return { select: storySelect };
        }
        return { select: responseSelect };
      });

      mockAssertWriteGuard.mockResolvedValueOnce(allowedGuard());

      const response = await removePrayerVideoResponsePost(
        jsonRequest("https://htbf.test/api/remove-prayer-video-response", {
          response_id: "resp-1",
        })
      );

      expect(response.status).toBe(200);
      expect(mockAssertWriteGuard).toHaveBeenCalledWith(RESPONDER, expect.anything());
      expect(mockAssertPrayerTargets).not.toHaveBeenCalled();
    });
  });
});
