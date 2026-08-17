import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUploadPrivateInboxVideo = vi.fn();
const mockAssertUsersNotBlocked = vi.fn();
const mockInsert = vi.fn();

vi.mock("../journey/inbox/privateMedia", () => ({
  uploadPrivateInboxVideo: (...args: unknown[]) =>
    mockUploadPrivateInboxVideo(...args),
}));

vi.mock("../messaging/userBlocking", () => ({
  assertUsersNotBlocked: (...args: unknown[]) =>
    mockAssertUsersNotBlocked(...args),
}));

vi.mock("../supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: mockInsert,
    })),
  },
}));

describe("sendPrivateVideoPrayer private media storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertUsersNotBlocked.mockResolvedValue(undefined);
    mockUploadPrivateInboxVideo.mockResolvedValue(
      "journey-private-media/sender-1/thread-1/object.mp4"
    );
    mockInsert.mockResolvedValue({ error: null });
  });

  it("stores a private media reference instead of a public HTTPS URL", async () => {
    vi.stubGlobal(
      "document",
      {
        createElement: vi.fn(() => {
          const element = {
            preload: "",
            duration: 10,
            onloadedmetadata: null as null | (() => void),
            onerror: null as null | (() => void),
            set src(_value: string) {
              queueMicrotask(() => {
                element.onloadedmetadata?.();
              });
            },
          };
          return element;
        }),
      } as unknown as Document
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const { sendPrivateVideoPrayer } = await import("./privateResponses");
    const file = new File(["video"], "reply.mp4", { type: "video/mp4" });

    await sendPrivateVideoPrayer({
      storyId: "story-1",
      senderUserId: "sender-1",
      recipientUserId: "recipient-1",
      videoFile: file,
      storyTitle: "Prayer title",
    });

    expect(mockUploadPrivateInboxVideo).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: "recipient-1",
        video_url: "journey-private-media/sender-1/thread-1/object.mp4",
      }),
      expect.objectContaining({
        user_id: "sender-1",
        video_url: "journey-private-media/sender-1/thread-1/object.mp4",
      }),
    ]);

    const insertedRows = mockInsert.mock.calls[0]?.[0] as Array<{
      video_url: string;
    }>;
    expect(insertedRows[0]?.video_url).not.toMatch(/^https?:\/\//);
    expect(insertedRows[1]?.video_url).not.toMatch(/^https?:\/\//);
  });
});
