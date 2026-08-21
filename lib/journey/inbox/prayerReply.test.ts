import { describe, expect, it } from "vitest";
import {
  isLocalInboxMessageId,
  pickPersistedSenderReplyMessage,
} from "./utils";

const persistedVideoReference =
  "journey-private-media/user-a/thread-1/7d8b2f2e-1d44-4a6a-9a6a-1b2c3d4e5f60.mp4";

describe("pickPersistedSenderReplyMessage", () => {
  it("returns the sender copy with a persisted UUID for a private video reply", () => {
    const insertedRows = [
      {
        id: "recipient-row-uuid",
        user_id: "user-b",
        sender_user_id: "user-a",
        title: "Someone replied with a prayer video",
        body: "A believer replied with a prayer video.",
        read: false,
        created_at: "2026-08-21T18:00:00.000Z",
        video_url: persistedVideoReference,
        message_type: "prayer_video_reply",
      },
      {
        id: "sender-row-uuid",
        user_id: "user-a",
        sender_user_id: "user-a",
        title: "You replied with a prayer video",
        body: "A believer replied with a prayer video.",
        read: true,
        created_at: "2026-08-21T18:00:00.000Z",
        video_url: persistedVideoReference,
        message_type: "prayer_video_reply",
      },
    ];

    const senderMessage = pickPersistedSenderReplyMessage(insertedRows, "user-a");

    expect(senderMessage).not.toBeNull();
    expect(senderMessage?.id).toBe("sender-row-uuid");
    expect(isLocalInboxMessageId(senderMessage?.id ?? "")).toBe(false);
    expect(senderMessage?.video_url).toBe(persistedVideoReference);
  });

  it("uses the persisted DB message UUID for playback requests", () => {
    const insertedRows = [
      {
        id: "recipient-row-uuid",
        user_id: "user-b",
        sender_user_id: "user-a",
        title: "Someone replied with a prayer video",
        body: "Video reply",
        read: false,
        created_at: "2026-08-21T18:00:00.000Z",
        video_url: persistedVideoReference,
      },
      {
        id: "7d8b2f2e-1d44-4a6a-9a6a-1b2c3d4e5f60",
        user_id: "user-a",
        sender_user_id: "user-a",
        title: "You replied with a prayer video",
        body: "Video reply",
        read: true,
        created_at: "2026-08-21T18:00:00.000Z",
        video_url: persistedVideoReference,
      },
    ];

    const senderMessage = pickPersistedSenderReplyMessage(insertedRows, "user-a");
    const playbackMessageId = senderMessage?.id ?? "";

    expect(playbackMessageId).toBe("7d8b2f2e-1d44-4a6a-9a6a-1b2c3d4e5f60");
    expect(playbackMessageId.startsWith("local-")).toBe(false);
  });

  it("does not return optimistic local-* IDs", () => {
    const insertedRows = [
      {
        id: "local-1787336890854",
        user_id: "user-a",
        sender_user_id: "user-a",
        title: "You replied with a prayer video",
        body: "Video reply",
        read: true,
        created_at: "2026-08-21T18:00:00.000Z",
        video_url: persistedVideoReference,
      },
    ];

    expect(pickPersistedSenderReplyMessage(insertedRows, "user-a")).toBeNull();
  });

  it("keeps text reply behavior unchanged by returning the persisted sender copy", () => {
    const insertedRows = [
      {
        id: "recipient-text-uuid",
        user_id: "user-b",
        sender_user_id: "user-a",
        title: "Someone replied to your prayer video",
        body: "Praying with you.",
        read: false,
        created_at: "2026-08-21T18:00:00.000Z",
        video_url: null,
        message_type: "prayer_reply",
      },
      {
        id: "sender-text-uuid",
        user_id: "user-a",
        sender_user_id: "user-a",
        title: "You replied with encouragement",
        body: "Praying with you.",
        read: true,
        created_at: "2026-08-21T18:00:00.000Z",
        video_url: null,
        message_type: "prayer_reply",
      },
    ];

    const senderMessage = pickPersistedSenderReplyMessage(insertedRows, "user-a");

    expect(senderMessage).toEqual(insertedRows[1]);
    expect(senderMessage?.message_type).toBe("prayer_reply");
    expect(senderMessage?.video_url).toBeNull();
    expect(isLocalInboxMessageId(senderMessage?.id ?? "")).toBe(false);
  });

  it("returns null when the sender copy is missing", () => {
    expect(
      pickPersistedSenderReplyMessage(
        [
          {
            id: "recipient-only",
            user_id: "user-b",
            sender_user_id: "user-a",
            title: "Someone replied with a prayer video",
            body: "Video reply",
            read: false,
            created_at: "2026-08-21T18:00:00.000Z",
          },
        ],
        "user-a"
      )
    ).toBeNull();
  });
});
