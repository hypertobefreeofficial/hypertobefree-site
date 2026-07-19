import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadMapStories } from "./loadMapStories";

const mockFrom = vi.fn();

vi.mock("../supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock("../demo-content/eligibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../demo-content/eligibility")>();
  return {
    ...actual,
    getDemoContentSchemaCapabilities: vi.fn(async () => ({
      state: "ready" as const,
      profiles: { hasIsDemo: true },
      stories: { hasIsDemo: true },
      prayerVideoResponses: { hasIsDemo: true },
      storyReactions: { hasIsDemo: true },
      prayerWrittenResponses: { hasIsDemo: true },
      savedContent: { hasIsDemo: true },
      prayerFollows: { hasIsDemo: true },
      storyVideoReplies: { hasIsDemo: true },
      contentReports: { hasIsDemo: true },
      genuinePublicIsolationActive: true,
    })),
  };
});

function queryResult(data: unknown, eqCalls?: Array<[string, unknown]>) {
  const builder: Record<string, unknown> = {};
  const terminal = Promise.resolve({ data, error: null });
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn((column: string, value: unknown) => {
    eqCalls?.push([column, value]);
    return builder;
  });
  builder.not = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.then = terminal.then.bind(terminal);
  builder.catch = terminal.catch.bind(terminal);
  return builder;
}

describe("loadMapStories demo isolation", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("applies is_demo=false to story and reaction queries", async () => {
    const storyCalls: Array<[string, unknown]> = [];
    const reactionCalls: Array<[string, unknown]> = [];
    const story = {
      id: "story-1",
      user_id: "user-1",
      name: "Test",
      location: "Austin, TX",
      story_type: "Testimony",
      story_text: "Story",
      image_url: null,
      video_url: null,
      status: "approved",
      prayer_status: null,
      created_at: "2026-07-18T12:00:00.000Z",
      is_demo: false,
    };

    mockFrom
      .mockReturnValueOnce(queryResult([story], storyCalls))
      .mockReturnValueOnce(queryResult([]))
      .mockReturnValueOnce(queryResult([], reactionCalls));

    const result = await loadMapStories();
    expect(result.ok).toBe(true);
    expect(storyCalls.some(([column, value]) => column === "is_demo" && value === false)).toBe(
      true
    );
    expect(
      reactionCalls.some(([column, value]) => column === "is_demo" && value === false)
    ).toBe(true);
  });
});
