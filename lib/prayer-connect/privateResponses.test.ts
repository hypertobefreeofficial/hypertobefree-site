import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUploadPrivateInboxVideo = vi.fn();
const mockGetSession = vi.fn();
const mockFetch = vi.fn();

vi.mock("../journey/inbox/privateMedia", () => ({
  uploadPrivateInboxVideo: (...args: unknown[]) =>
    mockUploadPrivateInboxVideo(...args),
}));

vi.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

describe("sendPrivateVideoPrayer private media storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadPrivateInboxVideo.mockResolvedValue(
      "journey-private-media/sender-1/thread-1/object.mp4"
    );
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "token-abc" } },
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  it("uses the server private-prayer route instead of direct inbox inserts", async () => {
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
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/journey/inbox/private-prayer",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token-abc",
        }),
      })
    );

    const requestInit = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(requestInit.body));
    expect(payload.storyId).toBe("story-1");
    expect(payload.videoUrl).toBe(
      "journey-private-media/sender-1/thread-1/object.mp4"
    );
    expect(payload).not.toHaveProperty("recipientUserId");
  });
});
