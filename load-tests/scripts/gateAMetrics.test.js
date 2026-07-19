import { describe, expect, it } from "vitest";
import { buildGateAResultsReport, readTrendMetric } from "./gateAMetrics.mjs";

describe("Gate A metrics parsing", () => {
  it("reads k6 v2 flat trend metrics", () => {
    const summary = {
      metrics: {
        http_req_duration: {
          med: 81.8,
          "p(95)": 107.2,
          "p(99)": 145.6,
        },
        htbf_video_feed_duration: {
          "p(95)": 99.5,
          "p(99)": 120.1,
        },
        http_reqs: { count: 604, rate: 1.96 },
        iterations: { count: 512, rate: 1.66 },
        checks: { value: 1 },
        http_req_failed: { value: 0 },
        htbf_auth_requests: { count: 10 },
        htbf_http_4xx: { count: 0 },
        htbf_http_5xx: { count: 0 },
      },
    };

    const report = buildGateAResultsReport(summary);
    expect(report.totalRequests).toBe(604);
    expect(report.httpP50Ms).toBe(81.8);
    expect(report.httpP95Ms).toBe(107.2);
    expect(report.httpP99Ms).toBe(145.6);
    expect(report.videoFeedP95Ms).toBe(99.5);
    expect(report.videoFeedP99Ms).toBe(120.1);
    expect(report.checksPassRate).toBe(1);
    expect(report.authRequestCount).toBe(10);
    expect(report.http4xxCount).toBe(0);
    expect(report.http5xxCount).toBe(0);
  });

  it("supports legacy `.values` wrappers", () => {
    const summary = {
      metrics: {
        htbf_feed_duration: {
          values: {
            "p(95)": 102,
            "p(99)": 130,
          },
        },
      },
    };

    expect(readTrendMetric(summary, "htbf_feed_duration")?.["p(95)"]).toBe(102);
  });
});
