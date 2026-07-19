import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyGenuinePublicDemoFilter,
  DemoContentSchemaProbeError,
  getDemoContentSchemaCapabilities,
  getDemoContentTableProbeCacheForTests,
  isExplicitDemoFlag,
  isGenuinePublicDemoRecord,
  recordMatchesLoaderMode,
  resetDemoContentSchemaCapabilitiesCache,
  shouldIgnoreGenuinePublicRealtimeIngress,
  shouldIgnoreGenuinePublicRealtimeRecord,
} from "./eligibility";

const mockFrom = vi.fn();
let probeCallCount = 0;

vi.mock("../supabaseClient", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

function probeResult(error: { message: string } | null) {
  probeCallCount += 1;
  const builder: Record<string, unknown> = {};
  const terminal = Promise.resolve({ error });
  builder.select = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.then = terminal.then.bind(terminal);
  builder.catch = terminal.catch.bind(terminal);
  return builder;
}

describe("demo-content eligibility", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    probeCallCount = 0;
    resetDemoContentSchemaCapabilitiesCache();
  });

  it("treats only explicit true as demo", () => {
    expect(isExplicitDemoFlag(true)).toBe(true);
    expect(isExplicitDemoFlag(false)).toBe(false);
    expect(isExplicitDemoFlag(null)).toBe(false);
    expect(isExplicitDemoFlag(undefined)).toBe(false);
  });

  it("includes only genuine records for genuine_public mode", () => {
    expect(isGenuinePublicDemoRecord(false)).toBe(true);
    expect(isGenuinePublicDemoRecord(true)).toBe(false);
    expect(recordMatchesLoaderMode({ is_demo: false }, "genuine_public")).toBe(
      true
    );
    expect(recordMatchesLoaderMode({ is_demo: true }, "genuine_public")).toBe(
      false
    );
    expect(recordMatchesLoaderMode({ is_demo: true }, "controlled_demo")).toBe(
      true
    );
  });

  it("applies database filter only when column exists", () => {
    const capabilities = {
      stories: { hasIsDemo: true },
      prayerVideoResponses: { hasIsDemo: true },
      storyReactions: { hasIsDemo: true },
      prayerWrittenResponses: { hasIsDemo: false },
      savedContent: { hasIsDemo: false },
      prayerFollows: { hasIsDemo: false },
      storyVideoReplies: { hasIsDemo: false },
      genuinePublicIsolationActive: true,
    };

    const applied = applyGenuinePublicDemoFilter(
      {
        eq: vi.fn(function (this: unknown, column: string, value: boolean) {
          expect(column).toBe("is_demo");
          expect(value).toBe(false);
          return this;
        }),
      },
      "stories",
      capabilities
    );
    expect(applied).toBeTruthy();

    const skippedQuery = {
      eq: vi.fn(() => ({ unexpected: true })),
    };
    const skipped = applyGenuinePublicDemoFilter(
      skippedQuery,
      "stories",
      {
        ...capabilities,
        stories: { hasIsDemo: false },
        genuinePublicIsolationActive: false,
      }
    );
    expect(skipped).toBe(skippedQuery);
    expect(skippedQuery.eq).not.toHaveBeenCalled();
  });

  it("always applies is_demo=false when schema capability is present", () => {
    const eq = vi.fn(function (this: unknown) {
      return this;
    });
    applyGenuinePublicDemoFilter(
      { eq },
      "stories",
      {
        stories: { hasIsDemo: true },
        prayerVideoResponses: { hasIsDemo: true },
        storyReactions: { hasIsDemo: true },
        prayerWrittenResponses: { hasIsDemo: true },
        savedContent: { hasIsDemo: true },
        prayerFollows: { hasIsDemo: true },
        storyVideoReplies: { hasIsDemo: true },
        genuinePublicIsolationActive: true,
      }
    );
    expect(eq).toHaveBeenCalledWith("is_demo", false);
  });

  it("ignores only explicit demo rows during sync eligibility checks", () => {
    expect(
      shouldIgnoreGenuinePublicRealtimeRecord(
        { is_demo: true },
        { genuinePublicIsolationActive: true }
      )
    ).toBe(true);
    expect(
      shouldIgnoreGenuinePublicRealtimeRecord(
        { is_demo: false },
        { genuinePublicIsolationActive: true }
      )
    ).toBe(false);
    expect(
      shouldIgnoreGenuinePublicRealtimeRecord(
        {},
        { genuinePublicIsolationActive: true }
      )
    ).toBe(false);
  });

  it("fails closed on INSERT ingress when demo status is uncertain", () => {
    expect(
      shouldIgnoreGenuinePublicRealtimeIngress(
        { is_demo: true },
        { genuinePublicIsolationActive: true },
        { eventType: "INSERT" }
      )
    ).toBe(true);
    expect(
      shouldIgnoreGenuinePublicRealtimeIngress(
        { is_demo: false },
        { genuinePublicIsolationActive: true },
        { eventType: "INSERT" }
      )
    ).toBe(false);
    expect(
      shouldIgnoreGenuinePublicRealtimeIngress(
        {},
        { genuinePublicIsolationActive: true },
        { eventType: "INSERT" }
      )
    ).toBe(true);
    expect(
      shouldIgnoreGenuinePublicRealtimeIngress(
        {},
        { genuinePublicIsolationActive: true },
        { eventType: "UPDATE" }
      )
    ).toBe(false);
  });

  it("permits pre-schema fallback only for positively identified missing columns", async () => {
    mockFrom.mockImplementation(() =>
      probeResult({ message: "column is_demo does not exist" })
    );

    const capabilities = await getDemoContentSchemaCapabilities();
    expect(capabilities.stories.hasIsDemo).toBe(false);
    expect(capabilities.genuinePublicIsolationActive).toBe(false);
    expect(getDemoContentTableProbeCacheForTests().get("stories")).toBe("missing");
    expect(probeCallCount).toBe(7);
  });

  it("propagates unrelated probe errors instead of disabling isolation", async () => {
    mockFrom.mockImplementation(() =>
      probeResult({ message: "JWT expired" })
    );

    await expect(getDemoContentSchemaCapabilities()).rejects.toBeInstanceOf(
      DemoContentSchemaProbeError
    );
    expect(getDemoContentTableProbeCacheForTests().size).toBe(0);
  });

  it("reuses successful per-table probe results for the process lifetime", async () => {
    mockFrom.mockImplementation(() => probeResult(null));

    await getDemoContentSchemaCapabilities();
    const firstPassCalls = probeCallCount;

    await getDemoContentSchemaCapabilities();
    expect(probeCallCount).toBe(firstPassCalls);
    expect(getDemoContentTableProbeCacheForTests().get("stories")).toBe("present");
  });
});
