import { describe, expect, it, vi, beforeEach } from "vitest";

const selectMock = vi.fn();
const eqMock = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: selectMock.mockReturnValue({
        eq: eqMock,
      }),
    })),
  },
}));

describe("patchVideoFeedReactionCountsForStory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for empty story id", async () => {
    const { patchVideoFeedReactionCountsForStory } = await import(
      "./patchVideoFeedReactionCounts"
    );
    await expect(
      patchVideoFeedReactionCountsForStory("", "user-1")
    ).resolves.toBeNull();
  });

  it("queries reactions for a single story", async () => {
    eqMock.mockResolvedValue({
      data: [
        { story_id: "story-1", user_id: "user-1", reaction_type: "amen" },
        { story_id: "story-1", user_id: "user-2", reaction_type: "praying" },
      ],
    });

    const { patchVideoFeedReactionCountsForStory } = await import(
      "./patchVideoFeedReactionCounts"
    );
    const patch = await patchVideoFeedReactionCountsForStory(
      "story-1",
      "user-1"
    );

    expect(selectMock).toHaveBeenCalledWith(
      "story_id, user_id, reaction_type"
    );
    expect(eqMock).toHaveBeenCalledWith("story_id", "story-1");
    expect(patch).toEqual({
      reaction_counts: {
        amen: 1,
        praise_god: 0,
        encouraged: 0,
        praying: 1,
      },
      user_reactions: ["amen"],
    });
  });
});
