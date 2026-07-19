import { describe, expect, it, vi, beforeEach } from "vitest";

const eqCalls: Array<[string, unknown]> = [];
const inCalls: Array<[string, unknown]> = [];

const builder: Record<string, unknown> = {};
const terminal = Promise.resolve({
  data: [
    { story_id: "story-1", user_id: "user-1", reaction_type: "amen", is_demo: false },
    { story_id: "story-1", user_id: "user-2", reaction_type: "praying", is_demo: true },
  ],
  error: null,
});

builder.select = vi.fn(() => builder);
builder.eq = vi.fn((column: string, value: unknown) => {
  eqCalls.push([column, value]);
  return builder;
});
builder.in = vi.fn((column: string, value: unknown) => {
  inCalls.push([column, value]);
  return builder;
});
builder.then = terminal.then.bind(terminal);
builder.catch = terminal.catch.bind(terminal);

vi.mock("../supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => builder),
  },
}));

vi.mock("../demo-content/eligibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../demo-content/eligibility")>();
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

describe("patchVideoFeedReactionCountsForStory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eqCalls.length = 0;
  });

  it("returns null for empty story id", async () => {
    const { patchVideoFeedReactionCountsForStory } = await import(
      "./patchVideoFeedReactionCounts"
    );
    await expect(
      patchVideoFeedReactionCountsForStory("", "user-1")
    ).resolves.toBeNull();
  });

  it("queries genuine reactions only and excludes demo rows from counts", async () => {
    const { patchVideoFeedReactionCountsForStory } = await import(
      "./patchVideoFeedReactionCounts"
    );
    const patch = await patchVideoFeedReactionCountsForStory(
      "story-1",
      "user-1"
    );

    expect(builder.select).toHaveBeenCalledWith(
      "story_id, user_id, reaction_type, is_demo"
    );
    expect(eqCalls).toContainEqual(["story_id", "story-1"]);
    expect(eqCalls).toContainEqual(["is_demo", false]);
    expect(patch).toEqual({
      reaction_counts: {
        amen: 1,
        praise_god: 0,
        encouraged: 0,
        praying: 0,
      },
      user_reactions: ["amen"],
    });
  });
});
