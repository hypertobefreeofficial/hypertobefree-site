import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DemoContentSchemaDriftError,
  DemoContentSchemaProbeError,
  assertDemoSchemaReadyForSeeding,
  getDemoContentSchemaReadiness,
  getDemoContentTableProbeCacheForTests,
  resetDemoContentSchemaReadinessCache,
  REQUIRED_DEMO_SCHEMA_TABLES,
} from "./schemaReadiness";
import {
  applyGenuinePublicDemoFilter,
  getDemoContentSchemaCapabilities,
  resetDemoContentSchemaCapabilitiesCache,
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

describe("demo schema readiness", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    probeCallCount = 0;
    resetDemoContentSchemaReadinessCache();
    resetDemoContentSchemaCapabilitiesCache();
  });

  it("returns pre_schema when every required table is missing is_demo", async () => {
    mockFrom.mockImplementation(() =>
      probeResult({ message: "column is_demo does not exist" })
    );

    const readiness = await getDemoContentSchemaReadiness();
    expect(readiness.state).toBe("pre_schema");
    expect(readiness.genuinePublicIsolationActive).toBe(false);
    expect(probeCallCount).toBe(REQUIRED_DEMO_SCHEMA_TABLES.length);
  });

  it("returns ready when every required table has is_demo", async () => {
    mockFrom.mockImplementation(() => probeResult(null));

    const readiness = await getDemoContentSchemaReadiness();
    expect(readiness.state).toBe("ready");
    expect(readiness.genuinePublicIsolationActive).toBe(true);
    expect(readiness.tables.stories.hasIsDemo).toBe(true);
    expect(readiness.tables.content_reports.hasIsDemo).toBe(true);
  });

  it("throws schema_drift when only some tables have is_demo", async () => {
    let callIndex = 0;
    mockFrom.mockImplementation(() => {
      callIndex += 1;
      return probeResult(
        callIndex === 1 ? null : { message: "column is_demo does not exist" }
      );
    });

    await expect(getDemoContentSchemaReadiness()).rejects.toBeInstanceOf(
      DemoContentSchemaDriftError
    );
    expect(getDemoContentTableProbeCacheForTests().size).toBe(
      REQUIRED_DEMO_SCHEMA_TABLES.length
    );
  });

  it("propagates unrelated probe errors", async () => {
    mockFrom.mockImplementation(() => probeResult({ message: "JWT expired" }));

    await expect(getDemoContentSchemaReadiness()).rejects.toBeInstanceOf(
      DemoContentSchemaProbeError
    );
    expect(getDemoContentTableProbeCacheForTests().size).toBe(0);
  });

  it("reuses cached ready state without re-probing", async () => {
    mockFrom.mockImplementation(() => probeResult(null));

    await getDemoContentSchemaReadiness();
    const firstPassCalls = probeCallCount;

    await getDemoContentSchemaReadiness();
    expect(probeCallCount).toBe(firstPassCalls);
  });

  it("requires ready state before seeding", async () => {
    mockFrom.mockImplementation(() =>
      probeResult({ message: "column is_demo does not exist" })
    );

    await expect(assertDemoSchemaReadyForSeeding()).rejects.toThrow(
      /requires schema state "ready"/
    );
  });

  it("never runs unfiltered queries once schema is ready", async () => {
    mockFrom.mockImplementation(() => probeResult(null));
    const capabilities = await getDemoContentSchemaCapabilities();
    const eq = vi.fn(function (this: unknown) {
      return this;
    });

    applyGenuinePublicDemoFilter({ eq }, "stories", capabilities);
    expect(eq).toHaveBeenCalledWith("is_demo", false);
  });
});
