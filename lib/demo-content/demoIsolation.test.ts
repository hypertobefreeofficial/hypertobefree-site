import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCommunityFeedItems } from "../community-feed/aggregateFeedItems";
import { resetCommunityFeedSchemaCapabilitiesCache } from "../community-feed/schemaCapabilities";
import { buildStory } from "../community-feed/testFixtures";
import { loadPrayerConnectRequests } from "../prayer-connect/loadPrayerConnectRequests";
import { loadPublicResponseCounts } from "../prayer-connect/responseCounts";
import { loadSearchStoriesPage } from "../search/loadSearchStories";
import { resetDemoContentSchemaCapabilitiesCache } from "./eligibility";

const mockFrom = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
  isSupabaseConfigured: vi.fn(() => true),
}));

vi.mock("../community-feed/schemaCapabilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../community-feed/schemaCapabilities")>();
  return {
    ...actual,
    getCommunityFeedSchemaCapabilities: vi.fn(async () => ({
      stories: { hasRemovedAt: true, hasThumbnailUrl: true },
      prayerVideoResponses: { hasRemovedAt: true, hasThumbnailUrl: true },
    })),
  };
});

vi.mock("./eligibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./eligibility")>();
  return {
    ...actual,
    getDemoContentSchemaCapabilities: vi.fn(async () => ({
      stories: { hasIsDemo: true },
      prayerVideoResponses: { hasIsDemo: true },
      storyReactions: { hasIsDemo: true },
      prayerWrittenResponses: { hasIsDemo: true },
      savedContent: { hasIsDemo: true },
      prayerFollows: { hasIsDemo: true },
      storyVideoReplies: { hasIsDemo: true },
      genuinePublicIsolationActive: true,
    })),
  };
});

vi.mock("../prayer-connect/mockMode", () => ({
  isMockPrayerMode: vi.fn(() => false),
}));

vi.mock("../media/storageSignSession", () => ({
  attachResolvedMediaToRequestsWithSession: vi.fn(async (requests: unknown[]) => requests),
  StorageSignSession: class {
    getSignOperationCount() {
      return 0;
    }
  },
}));

function queryResult(data: unknown, calls?: { eq: Array<[string, unknown]> }) {
  const builder: Record<string, unknown> = {};
  const terminal = Promise.resolve({ data, error: null });

  builder.select = vi.fn(() => builder);
  builder.is = vi.fn(() => builder);
  builder.not = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.or = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.eq = vi.fn((column: string, value: unknown) => {
    calls?.eq.push([column, value]);
    return builder;
  });
  builder.then = terminal.then.bind(terminal);
  builder.catch = terminal.catch.bind(terminal);
  return builder;
}

describe("demo public loader isolation", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    resetCommunityFeedSchemaCapabilitiesCache();
    resetDemoContentSchemaCapabilitiesCache();
  });

  it("applies is_demo=false filter to feed story queries before pagination", async () => {
    const storyCalls: Array<[string, unknown]> = [];
    const story = buildStory({ id: "story-a", is_demo: false });

    mockFrom
      .mockReturnValueOnce(queryResult([story], { eq: storyCalls }))
      .mockReturnValueOnce(queryResult([]))
      .mockReturnValueOnce(queryResult([]));

    const result = await loadCommunityFeedItems({
      limit: 40,
      blockedUserIds: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(storyCalls.some(([column, value]) => column === "is_demo" && value === false)).toBe(
      true
    );
  });

  it("applies is_demo=false filter to search queries before pagination", async () => {
    const searchCalls: Array<[string, unknown]> = [];
    const row = {
      id: "story-search",
      user_id: "user-1",
      status: "approved",
      created_at: "2026-07-18T12:00:00.000Z",
      is_demo: false,
    };

    mockFrom.mockReturnValueOnce(queryResult([row], { eq: searchCalls }));

    const result = await loadSearchStoriesPage({ limit: 10 });
    expect(result.ok).toBe(true);
    expect(
      searchCalls.some(([column, value]) => column === "is_demo" && value === false)
    ).toBe(true);
  });

  it("applies is_demo=false filter to prayer connect story queries", async () => {
    const prayerCalls: Array<[string, unknown]> = [];
    const story = {
      id: "prayer-1",
      user_id: "user-1",
      name: "Prayer",
      location: "Austin, TX",
      story_type: "prayer",
      story_text: "Please pray",
      image_url: null,
      video_url: null,
      thumbnail_url: null,
      status: "approved",
      prayer_status: "needs_prayer",
      created_at: "2026-07-18T12:00:00.000Z",
      is_demo: false,
    };

    mockFrom
      .mockReturnValueOnce(queryResult([story], { eq: prayerCalls }))
      .mockReturnValueOnce(queryResult([]))
      .mockReturnValueOnce(queryResult([]))
      .mockReturnValueOnce(queryResult([]));

    const result = await loadPrayerConnectRequests({
      viewerUserId: null,
      limit: 20,
    });

    expect(result.ok).toBe(true);
    expect(
      prayerCalls.some(([column, value]) => column === "is_demo" && value === false)
    ).toBe(true);
  });

  it("excludes demo child records from public video response counts", async () => {
    const countCalls: Array<[string, unknown]> = [];

    mockFrom.mockReturnValueOnce(
      queryResult(
        [
          { story_id: "story-1", is_demo: false },
          { story_id: "story-1", is_demo: true },
        ],
        { eq: countCalls }
      )
    );

    const counts = await loadPublicResponseCounts(["story-1"]);

    expect(
      countCalls.some(([column, value]) => column === "is_demo" && value === false)
    ).toBe(true);
    expect(counts.get("story-1")).toBe(1);
  });
});
