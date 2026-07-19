/**
 * Parse k6 summary exports for Gate A local runs.
 * Supports k6 v2 flat metric objects and legacy `.values` wrappers.
 */

export function readTrendMetric(summary, name) {
  const metric = summary?.metrics?.[name];
  if (!metric) return null;
  if (metric.values && typeof metric.values === "object") return metric.values;
  return metric;
}

export function readCounterMetric(summary, name) {
  const metric = summary?.metrics?.[name];
  if (!metric) return null;
  if (typeof metric.values?.count === "number") return metric.values.count;
  if (typeof metric.count === "number") return metric.count;
  if (typeof metric.value === "number") return metric.value;
  return null;
}

export function readRateMetric(summary, name) {
  const metric = summary?.metrics?.[name];
  if (!metric) return null;
  if (typeof metric.values?.rate === "number") return metric.values.rate;
  if (typeof metric.rate === "number") return metric.rate;
  if (typeof metric.value === "number") return metric.value;
  return null;
}

function percentile(trend, key) {
  if (!trend) return null;
  return trend[key] ?? trend[`p(${key.replace("p", "")})`] ?? null;
}

export function buildGateAResultsReport(summary) {
  const httpDuration = readTrendMetric(summary, "http_req_duration");
  const feed = readTrendMetric(summary, "htbf_feed_duration");
  const prayer = readTrendMetric(summary, "htbf_prayer_duration");
  const search = readTrendMetric(summary, "htbf_search_duration");
  const videoFeed = readTrendMetric(summary, "htbf_video_feed_duration");
  const checks = summary?.metrics?.checks;
  const httpFailed = summary?.metrics?.http_req_failed;

  const checksRate =
    typeof checks?.value === "number"
      ? checks.value
      : typeof checks?.values?.rate === "number"
        ? checks.values.rate
        : null;

  const failureRate =
    typeof httpFailed?.value === "number"
      ? httpFailed.value
      : typeof httpFailed?.values?.rate === "number"
        ? httpFailed.values.rate
        : null;

  return {
    totalRequests: readCounterMetric(summary, "http_reqs"),
    requestsPerSecond: readRateMetric(summary, "http_reqs"),
    iterationsPerSecond: readRateMetric(summary, "iterations"),
    httpFailureRate: failureRate,
    httpP50Ms: httpDuration?.med ?? httpDuration?.["p(50)"] ?? null,
    httpP95Ms: httpDuration?.["p(95)"] ?? null,
    httpP99Ms: httpDuration?.["p(99)"] ?? null,
    feedP95Ms: feed?.["p(95)"] ?? null,
    feedP99Ms: feed?.["p(99)"] ?? null,
    prayerP95Ms: prayer?.["p(95)"] ?? null,
    prayerP99Ms: prayer?.["p(99)"] ?? null,
    searchP95Ms: search?.["p(95)"] ?? null,
    searchP99Ms: search?.["p(99)"] ?? null,
    videoFeedP95Ms: videoFeed?.["p(95)"] ?? null,
    videoFeedP99Ms: videoFeed?.["p(99)"] ?? null,
    checksPassRate: checksRate,
    authRequestCount: readCounterMetric(summary, "htbf_auth_requests"),
    http4xxCount: readCounterMetric(summary, "htbf_http_4xx"),
    http5xxCount: readCounterMetric(summary, "htbf_http_5xx"),
  };
}

export function printGateAResultsReport(summaryPath, readFileSync, { scenarioLabel, processSample } = {}) {
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const report = buildGateAResultsReport(summary);

  console.log(`\n=== Gate A local ${scenarioLabel || "run"} results ===`);
  console.log(JSON.stringify({ ...report, processSample: processSample ?? null }, null, 2));
  console.log(
    "\nLimitations: This measures local application and Supabase staging behavior only."
  );
  console.log(
    "It does NOT measure Vercel Functions, Vercel networking, CDN, scaling, or hosted concurrency."
  );
  console.log("It does NOT certify production capacity.");
  console.log(
    "Local Gate A tests HTBF code and Supabase staging only. It does not certify Vercel or production concurrency capacity."
  );

  return report;
}
