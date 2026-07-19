#!/usr/bin/env node
/**
 * Gate A read-only smoke runner (10 VUs / 5 minutes).
 * Targets a local production build on 127.0.0.1 connected to htbf-staging only.
 */

import { spawnSync, execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertRequiredK6Env,
  getConfiguredLocalPort,
  loadStagingEnvFile,
  redactEnvSummary,
} from "./stagingGuards.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const ENV_FILE = resolve(ROOT, "load-tests/k6/.env.staging.local");
const SCENARIO = resolve(ROOT, "load-tests/k6/scenarios/smoke-10.js");
const RESULTS_DIR = resolve(ROOT, "load-tests/k6/results");

function resolveK6Binary() {
  try {
    return execSync("command -v k6", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

async function assertLocalAppHealthy(baseUrl) {
  const target = `${baseUrl.replace(/\/+$/, "")}/feed`;
  const response = await fetch(target, { redirect: "manual" });
  if (response.status < 200 || response.status >= 500) {
    throw new Error(
      `Local application is not healthy at ${target} (HTTP ${response.status}). Start it with: node load-tests/scripts/start-local-staging.mjs`
    );
  }
}

function readMetric(summary, names) {
  for (const name of names) {
    const metric = summary.metrics?.[name];
    if (metric?.values) return metric.values;
  }
  return null;
}

function printResultsReport(summaryPath) {
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const httpReqs = summary.metrics?.http_reqs?.values;
  const httpFailed = summary.metrics?.http_req_failed?.values;
  const httpDuration = summary.metrics?.http_req_duration?.values;
  const checks = summary.metrics?.checks?.values;

  const feedP95 =
    readMetric(summary, ["feed_duration", "feed_p95"])?.["p(95)"] ??
    readMetric(summary, ["group_duration{group:::Feed}"])?.["p(95)"];
  const prayerP95 =
    readMetric(summary, ["prayer_duration", "prayer_p95"])?.["p(95)"] ??
    readMetric(summary, ["group_duration{group:::Prayer}"])?.["p(95)"];
  const searchP95 =
    readMetric(summary, ["search_duration", "search_p95"])?.["p(95)"] ??
    readMetric(summary, ["group_duration{group:::Search}"])?.["p(95)"];

  console.log("\n=== Gate A local smoke results ===");
  console.log(
    JSON.stringify(
      {
        totalRequests: httpReqs?.count ?? null,
        failureRate: httpFailed?.rate ?? null,
        p50Ms: httpDuration?.["p(50)"] ?? null,
        p95Ms: httpDuration?.["p(95)"] ?? null,
        p99Ms: httpDuration?.["p(99)"] ?? null,
        feedP95Ms: feedP95 ?? null,
        prayerP95Ms: prayerP95 ?? null,
        searchP95Ms: searchP95 ?? null,
        checksRate: checks?.rate ?? null,
        supabaseApiErrors: "Inspect k6 output and Supabase staging dashboard",
        localNextJsErrors: "Inspect local server stdout during the run",
        macResourceNotes:
          "Optional: observe Activity Monitor CPU/memory for node during the run",
      },
      null,
      2
    )
  );

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
}

if (!loadStagingEnvFile(ENV_FILE)) {
  console.error(
    `Missing ${ENV_FILE}. Copy load-tests/k6/.env.staging.local.example and fill staging-only values.`
  );
  process.exit(1);
}

process.env.HTBF_ALLOW_MUTATIONS = "0";

let env;
try {
  env = assertRequiredK6Env();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

console.log("Gate A local smoke — environment summary:");
console.log(JSON.stringify(redactEnvSummary(env), null, 2));

const k6Bin = resolveK6Binary();
if (!k6Bin) {
  console.error("k6 is not installed. Install with: brew install k6");
  process.exit(1);
}

try {
  await assertLocalAppHealthy(env.baseUrl);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

mkdirSync(RESULTS_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const summaryFile = resolve(RESULTS_DIR, `smoke-10-${stamp}.json`);

const childEnv = {
  ...process.env,
  HTBF_LOAD_TEST_ENV: "local-staging",
  HTBF_BASE_URL: env.baseUrl,
  HTBF_SUPABASE_URL: env.supabaseUrl,
  HTBF_SUPABASE_ANON_KEY: env.anonKey,
  HTBF_LOCAL_TEST_PORT: String(getConfiguredLocalPort()),
  HTBF_TEST_USER_POOL_FILE:
    process.env.HTBF_TEST_USER_POOL_FILE ||
    "./load-tests/k6/fixtures/users.pool.local.csv",
  HTBF_ALLOW_MUTATIONS: "0",
  HTBF_ABORT_ON_ERROR: process.env.HTBF_ABORT_ON_ERROR || "1",
};

const result = spawnSync(
  k6Bin,
  ["run", "--summary-export", summaryFile, SCENARIO],
  {
    cwd: ROOT,
    env: childEnv,
    stdio: "inherit",
  }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Summary exported to ${summaryFile}`);
printResultsReport(summaryFile);
