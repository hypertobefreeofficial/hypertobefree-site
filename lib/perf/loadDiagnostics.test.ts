import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLoadTraceId,
  isLoadDiagnosticsEnabled,
  logLoadDiagnostic,
  measureLoad,
} from "./loadDiagnostics";

describe("loadDiagnostics", () => {
  const originalEnv = process.env.NEXT_PUBLIC_HTBF_LOAD_DIAGNOSTICS;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_HTBF_LOAD_DIAGNOSTICS;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_HTBF_LOAD_DIAGNOSTICS;
    } else {
      process.env.NEXT_PUBLIC_HTBF_LOAD_DIAGNOSTICS = originalEnv;
    }
  });

  it("is disabled by default", () => {
    expect(isLoadDiagnosticsEnabled()).toBe(false);
  });

  it("enables only when the env flag is set", () => {
    process.env.NEXT_PUBLIC_HTBF_LOAD_DIAGNOSTICS = "1";
    expect(isLoadDiagnosticsEnabled()).toBe(true);
  });

  it("logs only aggregate timing and counts", () => {
    process.env.NEXT_PUBLIC_HTBF_LOAD_DIAGNOSTICS = "1";
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logLoadDiagnostic({
      traceId: createLoadTraceId("test"),
      loader: "feed",
      phase: "enrich",
      durationMs: 12,
      recordsFetched: 40,
      signOperations: 18,
      dbQueries: 3,
    });

    expect(info).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(info.mock.calls[0]?.[0]));
    expect(payload.kind).toBe("htbf_load_diagnostic");
    expect(payload.recordsFetched).toBe(40);
    expect(JSON.stringify(payload)).not.toMatch(/Bearer|sk-|signedUrl|story_text|email/i);
  });

  it("does not log when diagnostics are disabled", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await measureLoad("search", "initial", createLoadTraceId("search"), async () => "ok", {
      recordsFetched: 10,
    });

    expect(info).not.toHaveBeenCalled();
  });
});
