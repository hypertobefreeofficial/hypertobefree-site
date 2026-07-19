import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidateLoadedFeedEligibility } from "../community-feed/revalidateLoadedFeed";
import { storyDedupeKey } from "../community-feed/provenance";
import type { FeedStoryDisplay } from "../community-feed/enrichFeedItems";
import { resetDemoContentSchemaCapabilitiesCache } from "./eligibility";

const mockFrom = vi.fn();
const eqCalls: Array<[string, unknown]> = [];

vi.mock("../supabaseClient", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock("./eligibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./eligibility")>();
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

function queryResult(data: unknown) {
  const builder: Record<string, unknown> = {};
  const terminal = Promise.resolve({ data, error: null });
  builder.select = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.eq = vi.fn((column: string, value: unknown) => {
    eqCalls.push([column, value]);
    return builder;
  });
  builder.maybeSingle = vi.fn(() => terminal);
  builder.then = terminal.then.bind(terminal);
  builder.catch = terminal.catch.bind(terminal);
  return builder;
}

describe("demo revalidation isolation", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    eqCalls.length = 0;
    resetDemoContentSchemaCapabilitiesCache();
  });

  it("requires is_demo=false during revalidation and removes stories filtered out as demo", async () => {
    const loaded: FeedStoryDisplay[] = [
      {
        kind: "story",
        dedupeKey: storyDedupeKey("story-1"),
        id: "story-1",
        user_id: "author-1",
        name: "Author",
        location: null,
        story_type: "Prayer Request",
        story_text: "Please pray",
        overlay_text: null,
        overlay_x: null,
        overlay_y: null,
        caption_style: null,
        caption_font: null,
        caption_background: null,
        caption_template: null,
        caption_color: null,
        caption_size: null,
        caption_align: null,
        video_template: null,
        htbf_watermark_enabled: null,
        silhouette_watermark_enabled: null,
        shared_htbf_intro_enabled: null,
        image_url: null,
        signed_image_url: null,
        video_url: null,
        signed_video_url: null,
        thumbnail_url: null,
        signed_thumbnail_url: null,
        status: "approved",
        created_at: "2026-07-18T20:00:00.000Z",
        prayer_status: "active",
        answered_at: null,
        answered_text: null,
        creation_mode: null,
        ai_suggestions: null,
        reaction_counts: {
          amen: 0,
          praise_god: 0,
          encouraged: 0,
          praying: 0,
        },
        user_reactions: [],
      },
    ];

    mockFrom.mockReturnValueOnce(queryResult([]));

    const result = await revalidateLoadedFeedEligibility(
      loaded,
      { storyIds: ["story-1"], responseIds: [] },
      {
        blockedUserIds: new Set(),
        removedAtFilterAvailable: true,
        demoIsolationActive: true,
      }
    );

    expect(eqCalls).toContainEqual(["is_demo", false]);
    expect(result.removalKeys.has(storyDedupeKey("story-1"))).toBe(true);
  });
});
