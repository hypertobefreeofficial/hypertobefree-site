import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  INBOX_MEDIA_SIGNED_URL_TTL_SECONDS,
  readJourneyInboxMediaMessageId,
  rejectArbitraryStoragePathRequest,
  resolveJourneyInboxMediaAccess,
} from "./journeyInboxMedia";

function createAdminClient(options: {
  lookup: { data: unknown; error?: { message: string } | null };
  signResult?: { data?: { signedUrl: string | null }; error?: { message: string } | null };
}) {
  const maybeSingle = vi.fn(async () => options.lookup);
  const eqId = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq: eqId }));
  const from = vi.fn((table: string) => {
    if (table === "inbox_messages") {
      return { select };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    from,
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(async () => options.signResult ?? { data: null, error: null }),
      })),
    },
    __mocks: { from, select, eqId, maybeSingle },
  } as unknown as SupabaseClient & {
    __mocks: {
      from: ReturnType<typeof vi.fn>;
      select: ReturnType<typeof vi.fn>;
      eqId: ReturnType<typeof vi.fn>;
      maybeSingle: ReturnType<typeof vi.fn>;
    };
  };
}

describe("journey inbox media authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the inbox row does not exist", async () => {
    const adminClient = createAdminClient({
      lookup: { data: null, error: null },
    });

    const result = await resolveJourneyInboxMediaAccess({
      adminClient,
      userId: "user-b",
      messageId: "message-missing",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.code).toBe("message_not_found");
    }
  });

  it("returns 404 when an unrelated user requests another user's messageId", async () => {
    const adminClient = createAdminClient({
      lookup: {
        data: {
          id: "message-recipient",
          video_url:
            "journey-private-media/user-b/thread-1/7d8b2f2e-1d44-4a6a-9a6a-1b2c3d4e5f60.mp4",
          user_id: "user-b",
          sender_user_id: "user-a",
          hidden_at: null,
        },
      },
      signResult: { data: { signedUrl: "https://signed.example/private.mp4?token=abc" } },
    });

    const result = await resolveJourneyInboxMediaAccess({
      adminClient,
      userId: "user-c",
      messageId: "message-recipient",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.code).toBe("message_not_found");
    }
    expect(adminClient.storage.from).not.toHaveBeenCalled();
  });

  it("does not grant access from service-role lookup alone; user_id equality is required", async () => {
    const adminClient = createAdminClient({
      lookup: {
        data: {
          id: "message-recipient",
          video_url:
            "journey-private-media/user-b/thread-1/7d8b2f2e-1d44-4a6a-9a6a-1b2c3d4e5f60.mp4",
          user_id: "user-b",
          sender_user_id: "user-a",
          hidden_at: null,
        },
      },
      signResult: { data: { signedUrl: "https://signed.example/private.mp4?token=abc" } },
    });

    const denied = await resolveJourneyInboxMediaAccess({
      adminClient,
      userId: "user-c",
      messageId: "message-recipient",
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.code).toBe("message_not_found");
    }

    const allowed = await resolveJourneyInboxMediaAccess({
      adminClient,
      userId: "user-b",
      messageId: "message-recipient",
    });
    expect(allowed.ok).toBe(true);

    const mocks = (adminClient as { __mocks: { eqId: ReturnType<typeof vi.fn> } }).__mocks;
    expect(mocks.eqId).toHaveBeenCalledWith("id", "message-recipient");
    expect(mocks.eqId).not.toHaveBeenCalledWith("user_id", expect.anything());
  });

  it("issues a signed URL for the recipient copy owner", async () => {
    const adminClient = createAdminClient({
      lookup: {
        data: {
          id: "message-recipient",
          video_url:
            "journey-private-media/user-b/thread-1/7d8b2f2e-1d44-4a6a-9a6a-1b2c3d4e5f60.mp4",
          user_id: "user-b",
          sender_user_id: "user-a",
          hidden_at: null,
        },
      },
      signResult: { data: { signedUrl: "https://signed.example/private.mp4?token=abc" } },
    });

    const result = await resolveJourneyInboxMediaAccess({
      adminClient,
      userId: "user-b",
      messageId: "message-recipient",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signedUrl).toContain("signed.example");
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    }

    expect(adminClient.storage.from).toHaveBeenCalledWith("journey-private-media");
  });

  it("allows the sender copy owner to access shared private media", async () => {
    const sharedReference =
      "journey-private-media/user-a/thread-1/7d8b2f2e-1d44-4a6a-9a6a-1b2c3d4e5f60.mp4";
    const adminClient = createAdminClient({
      lookup: {
        data: {
          id: "message-sender",
          video_url: sharedReference,
          user_id: "user-a",
          sender_user_id: "user-a",
          hidden_at: null,
        },
      },
      signResult: { data: { signedUrl: "https://signed.example/private.mp4?token=def" } },
    });

    const result = await resolveJourneyInboxMediaAccess({
      adminClient,
      userId: "user-a",
      messageId: "message-sender",
    });

    expect(result.ok).toBe(true);
  });

  it("rejects HTTPS video_url references for authorized owners", async () => {
    const adminClient = createAdminClient({
      lookup: {
        data: {
          id: "message-https",
          video_url: "https://example.com/video.mov",
          user_id: "user-b",
          sender_user_id: "user-a",
          hidden_at: null,
        },
      },
      signResult: { data: { signedUrl: "https://signed.example/private.mp4?token=abc" } },
    });

    const result = await resolveJourneyInboxMediaAccess({
      adminClient,
      userId: "user-b",
      messageId: "message-https",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.code).toBe("unsupported_media_reference");
    }
    expect(adminClient.storage.from).not.toHaveBeenCalled();
  });

  it("rejects hidden messages", async () => {
    const adminClient = createAdminClient({
      lookup: {
        data: {
          id: "message-hidden",
          video_url: "journey-private-media/user-a/thread-1/object.mp4",
          user_id: "user-a",
          sender_user_id: "user-a",
          hidden_at: "2026-01-01T00:00:00.000Z",
        },
      },
    });

    const result = await resolveJourneyInboxMediaAccess({
      adminClient,
      userId: "user-a",
      messageId: "message-hidden",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe("message_hidden");
    }
  });

  it("does not accept arbitrary storage path query parameters", () => {
    expect(
      rejectArbitraryStoragePathRequest(
        new Request("https://htbf.test/api/journey/inbox/media?path=secret.mp4")
      )
    ).toBe(true);
    expect(
      rejectArbitraryStoragePathRequest(
        new Request(
          "https://htbf.test/api/journey/inbox/media?messageId=message-1"
        )
      )
    ).toBe(false);
  });

  it("reads messageId from the media route query string", () => {
    expect(
      readJourneyInboxMediaMessageId(
        new Request(
          "https://htbf.test/api/journey/inbox/media?messageId=abc-123"
        )
      )
    ).toBe("abc-123");
  });

  it("uses a 15-minute signed URL TTL", () => {
    expect(INBOX_MEDIA_SIGNED_URL_TTL_SECONDS).toBe(900);
  });
});
