import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createInitialPrivateVideoPrayerReply,
  createJourneyThreadReply,
  deriveReplyRecipientUserId,
  parseValidatedPrivateMediaObjectPath,
  senderParticipatesInParentMessage,
  validateReplyPrivateMediaReference,
} from "./journeyInboxReply";
import { resolveJourneyInboxMediaAccess } from "./journeyInboxMedia";

const privateVideoReference =
  "journey-private-media/user-a/thread-1/7d8b2f2e-1d44-4a6a-9a6a-1b2c3d4e5f60.mp4";

const parentMessage = {
  id: "parent-message",
  user_id: "user-a",
  sender_user_id: "user-b",
  thread_id: "thread-1",
  story_id: "story-1",
  prayer_request_id: "story-1",
  hidden_at: null,
};

function createAdminClient(options: {
  parent?: typeof parentMessage | null;
  parentError?: { message: string } | null;
  story?: { id: string; user_id: string } | null;
  blockedRows?: Array<{ blocker_user_id: string }>;
  insertRows?: Array<Record<string, unknown>>;
  insertError?: { message: string } | null;
}) {
  const maybeSingle = vi.fn(async () => ({
    data: options.parent ?? null,
    error: options.parentError ?? null,
  }));
  const eqId = vi.fn(() => ({ maybeSingle }));
  const parentSelect = vi.fn(() => ({ eq: eqId }));

  const storyMaybeSingle = vi.fn(async () => ({
    data: options.story ?? null,
    error: null,
  }));
  const storyEq = vi.fn(() => ({ maybeSingle: storyMaybeSingle }));
  const storySelect = vi.fn(() => ({ eq: storyEq }));

  const blockedLimit = vi.fn(async () => ({
    data: options.blockedRows ?? [],
    error: null,
  }));
  const blockedOr = vi.fn(() => ({ limit: blockedLimit }));
  const blockedSelect = vi.fn(() => ({ or: blockedOr }));

  const insertSelect = vi.fn(async () => ({
    data: options.insertRows ?? [],
    error: options.insertError ?? null,
  }));
  const insert = vi.fn(() => ({ select: insertSelect }));

  const from = vi.fn((table: string) => {
    if (table === "inbox_messages") {
      return { select: parentSelect, insert };
    }
    if (table === "stories") {
      return { select: storySelect };
    }
    if (table === "blocked_users") {
      return { select: blockedSelect };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    from,
    storage: { from: vi.fn() },
    __mocks: { from, insert, parentSelect, storySelect },
  } as unknown as SupabaseClient & {
    __mocks: {
      insert: ReturnType<typeof vi.fn>;
    };
  };
}

function createMediaAdminClient(lookup: Record<string, unknown> | null) {
  const maybeSingle = vi.fn(async () => ({ data: lookup, error: null }));
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
        createSignedUrl: vi.fn(async () => ({
          data: { signedUrl: "https://signed.example/private.mp4?token=abc" },
          error: null,
        })),
      })),
    },
  } as unknown as SupabaseClient;
}

describe("journey inbox reply authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives the legitimate recipient from the parent message", () => {
    expect(deriveReplyRecipientUserId(parentMessage, "user-a")).toBe("user-b");
    expect(deriveReplyRecipientUserId(parentMessage, "user-b")).toBe("user-a");
    expect(deriveReplyRecipientUserId(parentMessage, "user-c")).toBeNull();
  });

  it("creates sender and recipient copies for an authorized thread reply", async () => {
    const insertedRows = [
      {
        id: "recipient-row",
        user_id: "user-b",
        sender_user_id: "user-a",
        title: "Someone replied with a prayer video",
        body: "A believer replied with a prayer video.",
        read: false,
        created_at: "2026-08-22T00:00:00.000Z",
        category: "prayer",
        message_type: "prayer_video_reply",
        video_url: privateVideoReference,
      },
      {
        id: "sender-row",
        user_id: "user-a",
        sender_user_id: "user-a",
        title: "You replied with a prayer video",
        body: "A believer replied with a prayer video.",
        read: true,
        created_at: "2026-08-22T00:00:00.000Z",
        category: "prayer",
        message_type: "prayer_video_reply",
        video_url: privateVideoReference,
      },
    ];
    const adminClient = createAdminClient({
      parent: parentMessage,
      insertRows: insertedRows,
    });

    const result = await createJourneyThreadReply({
      adminClient,
      senderUserId: "user-a",
      parentMessageId: "parent-message",
      body: "",
      replyMode: "video",
      videoUrl: privateVideoReference,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.senderMessage.id).toBe("sender-row");
      expect(result.recipientMessage.id).toBe("recipient-row");
      expect(result.recipientMessage.user_id).toBe("user-b");
      expect(result.senderMessage.user_id).toBe("user-a");
    }

    const insertPayload = (adminClient as { __mocks: { insert: ReturnType<typeof vi.fn> } })
      .__mocks.insert.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(insertPayload[0]?.user_id).toBe("user-b");
    expect(insertPayload[1]?.user_id).toBe("user-a");
    expect(insertPayload[0]?.sender_user_id).toBe("user-a");
    expect(insertPayload[1]?.sender_user_id).toBe("user-a");
    expect(
      (adminClient as { __mocks: { insert: ReturnType<typeof vi.fn> } }).__mocks
        .insert
    ).toHaveBeenCalledTimes(1);
    expect(insertPayload).toHaveLength(2);
  });

  it("creates text replies through the same authorized server path", async () => {
    const adminClient = createAdminClient({
      parent: parentMessage,
      insertRows: [
        {
          id: "recipient-text",
          user_id: "user-b",
          sender_user_id: "user-a",
          title: "Someone replied to your prayer video",
          body: "Praying with you.",
          read: false,
          created_at: "2026-08-22T00:00:00.000Z",
          category: "prayer",
          message_type: "prayer_reply",
          video_url: null,
        },
        {
          id: "sender-text",
          user_id: "user-a",
          sender_user_id: "user-a",
          title: "You replied with encouragement",
          body: "Praying with you.",
          read: true,
          created_at: "2026-08-22T00:00:00.000Z",
          category: "prayer",
          message_type: "prayer_reply",
          video_url: null,
        },
      ],
    });

    const result = await createJourneyThreadReply({
      adminClient,
      senderUserId: "user-a",
      parentMessageId: "parent-message",
      body: "Praying with you.",
      replyMode: "text",
    });

    expect(result.ok).toBe(true);
  });

  it("rejects arbitrary parent_message_id probing", async () => {
    const adminClient = createAdminClient({ parent: null });

    const result = await createJourneyThreadReply({
      adminClient,
      senderUserId: "user-a",
      parentMessageId: "missing-parent",
      body: "Hello",
      replyMode: "text",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.code).toBe("message_not_found");
    }
  });

  it("rejects replies into a parent the sender does not participate in", async () => {
    const adminClient = createAdminClient({ parent: parentMessage });

    const result = await createJourneyThreadReply({
      adminClient,
      senderUserId: "user-c",
      parentMessageId: "parent-message",
      body: "Hello",
      replyMode: "text",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.code).toBe("message_not_found");
    }
  });

  it("rejects arbitrary journey-private-media path injection", async () => {
    const adminClient = createAdminClient({ parent: parentMessage });
    const forgedReference =
      "journey-private-media/user-c/thread-1/forged-object.mp4";

    const result = await createJourneyThreadReply({
      adminClient,
      senderUserId: "user-a",
      parentMessageId: "parent-message",
      body: "",
      replyMode: "video",
      videoUrl: forgedReference,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unsupported_media_reference");
    }
    expect(
      (adminClient as { __mocks: { insert: ReturnType<typeof vi.fn> } }).__mocks
        .insert
    ).not.toHaveBeenCalled();
  });

  it("rejects HTTPS video references for thread replies", async () => {
    const adminClient = createAdminClient({ parent: parentMessage });

    const result = await createJourneyThreadReply({
      adminClient,
      senderUserId: "user-a",
      parentMessageId: "parent-message",
      body: "",
      replyMode: "video",
      videoUrl: "https://example.com/video.mov",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unsupported_media_reference");
    }
  });

  it("derives the prayer story owner instead of trusting a client recipient", async () => {
    const videoUrl =
      "journey-private-media/user-a/thread-new/11111111-1111-1111-1111-111111111111.mp4";
    const adminClient = createAdminClient({
      story: { id: "story-1", user_id: "user-b" },
      insertRows: [
        {
          id: "recipient-row",
          user_id: "user-b",
          sender_user_id: "user-a",
          title: "Someone sent you a private video prayer",
          body: "Prayer body",
          read: false,
          created_at: "2026-08-22T00:00:00.000Z",
          category: "prayer",
          message_type: "prayer_video_reply",
          video_url: videoUrl,
        },
        {
          id: "sender-row",
          user_id: "user-a",
          sender_user_id: "user-a",
          title: "You sent a private video prayer",
          body: "Prayer body",
          read: true,
          created_at: "2026-08-22T00:00:00.000Z",
          category: "prayer",
          message_type: "prayer_video_reply",
          video_url: videoUrl,
        },
      ],
    });

    const result = await createInitialPrivateVideoPrayerReply({
      adminClient,
      senderUserId: "user-a",
      storyId: "story-1",
      body: "Prayer body",
      videoUrl,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recipientMessage.user_id).toBe("user-b");
    }
  });

  it("rejects blocked relationships before creating inbox copies", async () => {
    const adminClient = createAdminClient({
      parent: parentMessage,
      blockedRows: [{ blocker_user_id: "user-b" }],
    });

    const result = await createJourneyThreadReply({
      adminClient,
      senderUserId: "user-a",
      parentMessageId: "parent-message",
      body: "Hello",
      replyMode: "text",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe("blocked");
    }
    expect(
      (adminClient as { __mocks: { insert: ReturnType<typeof vi.fn> } }).__mocks
        .insert
    ).not.toHaveBeenCalled();
  });

  it("rejects private media uploaded for a different thread", async () => {
    const adminClient = createAdminClient({ parent: parentMessage });
    const otherThreadReference =
      "journey-private-media/user-a/prayer:story-2/7d8b2f2e-1d44-4a6a-9a6a-1b2c3d4e5f60.mp4";

    const result = await createJourneyThreadReply({
      adminClient,
      senderUserId: "user-a",
      parentMessageId: "parent-message",
      body: "",
      replyMode: "video",
      videoUrl: otherThreadReference,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unsupported_media_reference");
    }
  });

  it("rejects malformed and traversal-style private media paths", () => {
    expect(
      parseValidatedPrivateMediaObjectPath(
        "journey-private-media/user-a/thread-1/../thread-1/file.mp4"
      )
    ).toBeNull();
    expect(
      parseValidatedPrivateMediaObjectPath(
        "journey-private-media/user-a/thread-1/file.mp4/extra"
      )
    ).toBeNull();
    expect(
      parseValidatedPrivateMediaObjectPath("https://example.com/video.mp4")
    ).toBeNull();
    expect(
      parseValidatedPrivateMediaObjectPath(
        "journey-private-media/user-a/thread-1/no-extension"
      )
    ).toBeNull();
  });

  it("rejects unrelated story identifiers for initial private video prayers", async () => {
    const videoUrl =
      "journey-private-media/user-a/thread-new/11111111-1111-1111-1111-111111111111.mp4";
    const adminClient = createAdminClient({
      story: null,
      insertRows: [],
    });

    const result = await createInitialPrivateVideoPrayerReply({
      adminClient,
      senderUserId: "user-a",
      storyId: "missing-story",
      body: "Prayer body",
      videoUrl,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("message_not_found");
    }
  });

  it("validates private media references against sender ownership and thread id", () => {
    expect(
      validateReplyPrivateMediaReference({
        videoUrl: privateVideoReference,
        senderUserId: "user-a",
        threadId: "thread-1",
      })
    ).toBe(true);
    expect(
      validateReplyPrivateMediaReference({
        videoUrl: privateVideoReference,
        senderUserId: "user-b",
        threadId: "thread-1",
      })
    ).toBe(false);
    expect(
      validateReplyPrivateMediaReference({
        videoUrl: privateVideoReference,
        senderUserId: "user-a",
        threadId: "wrong-thread",
      })
    ).toBe(false);
  });

  it("keeps authorized private-media playback passing after reply changes", async () => {
    const adminClient = createMediaAdminClient({
      id: "message-recipient",
      video_url: privateVideoReference,
      user_id: "user-b",
      sender_user_id: "user-a",
      hidden_at: null,
    });

    const result = await resolveJourneyInboxMediaAccess({
      adminClient,
      userId: "user-b",
      messageId: "message-recipient",
    });

    expect(result.ok).toBe(true);
  });

  it("keeps cross-account media denial passing after reply changes", async () => {
    const adminClient = createMediaAdminClient({
      id: "message-recipient",
      video_url: privateVideoReference,
      user_id: "user-b",
      sender_user_id: "user-a",
      hidden_at: null,
    });

    const result = await resolveJourneyInboxMediaAccess({
      adminClient,
      userId: "user-c",
      messageId: "message-recipient",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("message_not_found");
    }
  });

  it("documents sender participation checks used before insert", () => {
    expect(senderParticipatesInParentMessage(parentMessage, "user-a")).toBe(true);
    expect(senderParticipatesInParentMessage(parentMessage, "user-b")).toBe(true);
    expect(senderParticipatesInParentMessage(parentMessage, "user-c")).toBe(false);
  });
});
