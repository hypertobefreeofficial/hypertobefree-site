import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCommunityFeedItems } from "./aggregateFeedItems";
import { resetCommunityFeedSchemaCapabilitiesCache } from "./schemaCapabilities";
import { buildStory, buildVideoResponse } from "./testFixtures";

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

  for (const method of ["select", "eq", "is", "order", "limit", "lt", "in", "or"]) {
    builder[method] = vi.fn(() => builder);
  }

  builder.then = terminal.then.bind(terminal);
  builder.catch = terminal.catch.bind(terminal);
  return builder;
}

describe("loadCommunityFeedItems integration-style", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    resetCommunityFeedSchemaCapabilitiesCache();
  });

  it("merges eligible stories and responses with parent context attached", async () => {
    const story = buildStory({ id: "story-a" });
    const parent = buildStory({ id: "parent-b", story_text: "Help me" });
    const response = buildVideoResponse({ id: "resp-b", story_id: "parent-b" });

    mockFrom
      .mockReturnValueOnce(queryResult([story]))
      .mockReturnValueOnce(queryResult([response]))
      .mockReturnValueOnce(queryResult([parent]));

    const result = await loadCommunityFeedItems({
      limit: 40,
      blockedUserIds: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.items).toHaveLength(2);
    expect(new Set(result.items.map((item) => item.dedupeKey)).size).toBe(2);

    const responseItem = result.items.find(
      (item) => item.canonicalType === "prayer_video_response"
    );
    expect(responseItem?.parentCanonicalId).toBe("parent-b");
    expect(responseItem?.originSurface).toBe("public_video_response");
  });

  it("omits blocked responders and blocked parent authors from merged page", async () => {
    const visibleParent = buildStory({
      id: "parent-visible",
      user_id: "parent-visible-user",
    });
    const blockedParent = buildStory({
      id: "parent-blocked",
      user_id: "blocked-parent-user",
    });

    mockFrom
      .mockReturnValueOnce(queryResult([]))
      .mockReturnValueOnce(
        queryResult([
          buildVideoResponse({
            id: "resp-blocked-responder",
            story_id: "parent-visible",
            user_id: "blocked-responder",
          }),
          buildVideoResponse({
            id: "resp-blocked-parent",
            story_id: "parent-blocked",
            user_id: "responder-ok",
          }),
        ])
      )
      .mockReturnValueOnce(queryResult([visibleParent, blockedParent]));

    const result = await loadCommunityFeedItems({
      limit: 40,
      blockedUserIds: ["blocked-responder", "blocked-parent-user"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(0);
  });

  it("returns encoded composite cursor for a full page when more source rows remain", async () => {
    const stories = Array.from({ length: 55 }, (_, index) =>
      buildStory({
        id: `story-${index}`,
        created_at: new Date(Date.UTC(2026, 6, 14, 12, 0, 55 - index)).toISOString(),
      })
    );

    mockFrom
      .mockReturnValueOnce(queryResult(stories.slice(0, 50)))
      .mockReturnValueOnce(queryResult([]));

    const result = await loadCommunityFeedItems({ limit: 40, blockedUserIds: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(40);
    expect(result.nextCursor).toBeTruthy();
    expect(result.nextCursor).not.toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("excludes orphan responses without eligible parents", async () => {
    mockFrom
      .mockReturnValueOnce(queryResult([]))
      .mockReturnValueOnce(
        queryResult([
          buildVideoResponse({ id: "orphan-resp", story_id: "missing-parent" }),
        ])
      )
      .mockReturnValueOnce(queryResult([]));

    const result = await loadCommunityFeedItems({ limit: 40, blockedUserIds: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(0);
  });

  it("includes approved public video responses once in the merged feed", async () => {
    const parent = buildStory({ id: "parent-1", story_text: "Help me" });
    const approvedResponse = buildVideoResponse({
      id: "approved-resp",
      story_id: "parent-1",
      status: "approved",
    });

    mockFrom
      .mockReturnValueOnce(queryResult([]))
      .mockReturnValueOnce(queryResult([approvedResponse]))
      .mockReturnValueOnce(queryResult([parent]));

    const result = await loadCommunityFeedItems({ limit: 40, blockedUserIds: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const responseItems = result.items.filter(
      (item) => item.canonicalType === "prayer_video_response"
    );
    expect(responseItems).toHaveLength(1);
    expect(responseItems[0]?.canonicalId).toBe("approved-resp");
  });
});
