import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  INBOX_MEDIA_SIGNED_URL_TTL_SECONDS,
  readJourneyInboxMediaMessageId,
  rejectArbitraryStoragePathRequest,
  resolveJourneyInboxMediaAccess,
} from "./journeyInboxMedia";

function createUserClient(result: {
  data: unknown;
  error?: { message: string } | null;
}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => result),
          })),
        })),
      })),
    })),
  } as unknown as SupabaseClient;
}

function createAdminClient(signResult: {
  data?: { signedUrl: string | null };
  error?: { message: string } | null;
}) {
  return {
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(async () => signResult),
      })),
    },
  } as unknown as SupabaseClient;
}

describe("journey inbox media authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the authenticated user does not own the inbox row", async () => {
    const userClient = createUserClient({ data: null, error: null });
    const adminClient = createAdminClient({ data: { signedUrl: "unused" } });

    const result = await resolveJourneyInboxMediaAccess({
      userClient,
      adminClient,
      userId: "user-c",
      messageId: "message-1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.code).toBe("message_not_found");
    }
  });

  it("issues a signed URL for authorized private media references", async () => {
    const userClient = createUserClient({
      data: {
        id: "message-recipient",
        video_url:
          "journey-private-media/user-b/thread-1/7d8b2f2e-1d44-4a6a-9a6a-1b2c3d4e5f60.mp4",
        user_id: "user-b",
        sender_user_id: "user-a",
        hidden_at: null,
      },
    });
    const adminClient = createAdminClient({
      data: { signedUrl: "https://signed.example/private.mp4?token=abc" },
    });

    const result = await resolveJourneyInboxMediaAccess({
      userClient,
      adminClient,
      userId: "user-b",
      messageId: "message-recipient",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signedUrl).toContain("signed.example");
      expect(result.legacy).toBe(false);
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    }

    expect(adminClient.storage.from).toHaveBeenCalledWith(
      "journey-private-media"
    );
  });

  it("allows authorized senders to access the shared private media via their own row", async () => {
    const sharedReference =
      "journey-private-media/user-a/thread-1/7d8b2f2e-1d44-4a6a-9a6a-1b2c3d4e5f60.mp4";
    const userClient = createUserClient({
      data: {
        id: "message-sender",
        video_url: sharedReference,
        user_id: "user-a",
        sender_user_id: "user-a",
        hidden_at: null,
      },
    });
    const adminClient = createAdminClient({
      data: { signedUrl: "https://signed.example/private.mp4?token=def" },
    });

    const result = await resolveJourneyInboxMediaAccess({
      userClient,
      adminClient,
      userId: "user-a",
      messageId: "message-sender",
    });

    expect(result.ok).toBe(true);
  });

  it("returns legacy public URLs for pre-migration inbox videos", async () => {
    const legacyUrl =
      "https://example.supabase.co/storage/v1/object/public/story-videos/prayer-videos/story-1/reply-user.mp4";
    const userClient = createUserClient({
      data: {
        id: "message-legacy",
        video_url: legacyUrl,
        user_id: "user-b",
        sender_user_id: "user-a",
        hidden_at: null,
      },
    });
    const adminClient = createAdminClient({ data: { signedUrl: "unused" } });

    const result = await resolveJourneyInboxMediaAccess({
      userClient,
      adminClient,
      userId: "user-b",
      messageId: "message-legacy",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.legacy).toBe(true);
      expect(result.signedUrl).toBe(legacyUrl);
    }
    expect(adminClient.storage.from).not.toHaveBeenCalled();
  });

  it("rejects hidden messages", async () => {
    const userClient = createUserClient({
      data: {
        id: "message-hidden",
        video_url: "journey-private-media/user-a/thread-1/object.mp4",
        user_id: "user-a",
        sender_user_id: "user-a",
        hidden_at: "2026-01-01T00:00:00.000Z",
      },
    });
    const adminClient = createAdminClient({ data: { signedUrl: "unused" } });

    const result = await resolveJourneyInboxMediaAccess({
      userClient,
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
