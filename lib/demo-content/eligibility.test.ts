import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyGenuinePublicDemoFilter,
  getDemoContentSchemaCapabilities,
  isExplicitDemoFlag,
  isGenuinePublicDemoRecord,
  recordMatchesLoaderMode,
  resetDemoContentSchemaCapabilitiesCache,
  shouldIgnoreGenuinePublicRealtimeIngress,
  shouldIgnoreGenuinePublicRealtimeRecord,
} from "./eligibility";
import { resetDemoContentSchemaReadinessCache } from "./schemaReadiness";

const mockFrom = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

function probeResult(error: { message: string } | null) {
  const builder: Record<string, unknown> = {};
  const terminal = Promise.resolve({ error });
  builder.select = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.then = terminal.then.bind(terminal);
  builder.catch = terminal.catch.bind(terminal);
  return builder;
}

const readyCapabilities = {
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
};

describe("demo-content eligibility", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    resetDemoContentSchemaCapabilitiesCache();
    resetDemoContentSchemaReadinessCache();
  });

  it("treats only explicit true as demo", () => {
    expect(isExplicitDemoFlag(true)).toBe(true);
    expect(isExplicitDemoFlag(false)).toBe(false);
  });

  it("includes only genuine records for genuine_public mode", () => {
    expect(recordMatchesLoaderMode({ is_demo: false }, "genuine_public")).toBe(true);
    expect(recordMatchesLoaderMode({ is_demo: true }, "genuine_public")).toBe(false);
    expect(recordMatchesLoaderMode({ is_demo: true }, "controlled_demo")).toBe(true);
  });

  it("applies database filter only when schema is ready", () => {
    const eq = vi.fn(function (this: unknown) {
      return this;
    });
    applyGenuinePublicDemoFilter({ eq }, "stories", readyCapabilities);
    expect(eq).toHaveBeenCalledWith("is_demo", false);

    const skippedQuery = { eq: vi.fn() };
    applyGenuinePublicDemoFilter(
      skippedQuery,
      "stories",
      {
        ...readyCapabilities,
        state: "pre_schema",
        stories: { hasIsDemo: false },
        genuinePublicIsolationActive: false,
      }
    );
    expect(skippedQuery.eq).not.toHaveBeenCalled();
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
        {},
        { genuinePublicIsolationActive: true }
      )
    ).toBe(false);
  });

  it("fails closed on INSERT ingress when demo status is uncertain", () => {
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

  it("maps ready schema capabilities from readiness probe", async () => {
    mockFrom.mockImplementation(() => probeResult(null));
    const capabilities = await getDemoContentSchemaCapabilities();
    expect(capabilities.state).toBe("ready");
    expect(capabilities.genuinePublicIsolationActive).toBe(true);
  });
});
