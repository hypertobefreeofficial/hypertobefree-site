import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadViewerPendingVideoResponsesByStoryIds } from "./loadViewerPendingVideoResponses";

const mockFrom = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock("./schemaCapabilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./schemaCapabilities")>();
  return {
    ...actual,
    getCommunityFeedSchemaCapabilities: vi.fn(async () => ({
      stories: { hasRemovedAt: true, hasThumbnailUrl: true },
      prayerVideoResponses: { hasRemovedAt: true, hasThumbnailUrl: true },
    })),
  };
});

function queryResult(data: unknown) {
  const builder: Record<string, unknown> = {};
  const terminal = Promise.resolve({ data, error: null });

  for (const method of ["select", "eq", "is", "order", "in"]) {
    builder[method] = vi.fn(() => builder);
  }

  builder.then = terminal.then.bind(terminal);
  builder.catch = terminal.catch.bind(terminal);
  return builder;
}

describe("loadViewerPendingVideoResponsesByStoryIds", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("returns pending responses only for the viewing creator", async () => {
    mockFrom.mockReturnValueOnce(
      queryResult([
        {
          id: "pending-1",
          story_id: "story-1",
          status: "submitted",
          thumbnail_url: null,
          created_at: "2026-07-16T00:00:00.000Z",
          ai_review_status: "completed",
        },
      ])
    );

    const grouped = await loadViewerPendingVideoResponsesByStoryIds(
      ["story-1"],
      "creator-1"
    );

    expect(grouped.get("story-1")?.status).toBe("submitted");
    expect(mockFrom).toHaveBeenCalledWith("prayer_video_responses");
    const builder = mockFrom.mock.results[0]?.value as {
      eq: ReturnType<typeof vi.fn>;
    };
    expect(builder.eq).toHaveBeenCalledWith("user_id", "creator-1");
  });

  it("does not surface approved responses as pending cards", async () => {
    mockFrom.mockReturnValueOnce(queryResult([]));

    const grouped = await loadViewerPendingVideoResponsesByStoryIds(
      ["story-1"],
      "creator-1"
    );

    expect(grouped.get("story-1")).toBeNull();
  });

  it("returns null for other viewers when no owned pending row exists", async () => {
    mockFrom.mockReturnValueOnce(queryResult([]));

    const grouped = await loadViewerPendingVideoResponsesByStoryIds(
      ["story-1"],
      "other-viewer"
    );

    expect(grouped.get("story-1")).toBeNull();
  });
});
