#!/usr/bin/env node
/**
 * Gate A read-only baseline runner (50 VUs / 15 minutes).
 * Prepared for local-staging only — requires a healthy local server and 10-user auth sweep.
 *
 * Usage:
 *   node load-tests/scripts/run-baseline-50.mjs --preflight-only
 *   node load-tests/scripts/run-baseline-50.mjs
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfiguredLocalPort, loadStagingEnvFile, redactEnvSummary } from "./stagingGuards.mjs";
import { runGateAPreflight } from "./gateAPreflight.mjs";
import { printGateAResultsReport } from "./gateAMetrics.mjs";
import { createGateAProcessSampler } from "./gateAProcessSampler.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const ENV_FILE = resolve(ROOT, "load-tests/k6/.env.staging.local");
const SCENARIO = resolve(ROOT, "load-tests/k6/scenarios/baseline-50.js");
const RESULTS_DIR = resolve(ROOT, "load-tests/k6/results");
const preflightOnly = process.argv.includes("--preflight-only");

if (!loadStagingEnvFile(ENV_FILE)) {
  console.error(
    `Missing ${ENV_FILE}. Copy load-tests/k6/.env.staging.local.example and fill staging-only values.`
  );
  process.exit(1);
}

process.env.HTBF_ALLOW_MUTATIONS = "0";

let preflight;
try {
  preflight = await runGateAPreflight({
    repoRoot: ROOT,
    envFile: ENV_FILE,
    requireLocalServer: !preflightOnly,
    requireAllUsersAuth: true,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

console.log(JSON.stringify({
  preflight: {
    pass: preflight.pass,
    checks: preflight.checks,
    envSummary: preflight.envSummary,
    authSweep: preflight.authSweep,
  },
}, null, 2));

if (!preflight.pass) {
  process.exit(1);
}

console.log("Gate A local baseline — environment summary:");
console.log(JSON.stringify(preflight.envSummary, null, 2));

if (preflightOnly) {
  console.log(
    "Baseline preflight passed. Start the local server, then run without --preflight-only when ready."
  );
  process.exit(0);
}

const k6Bin = preflight.k6Binary;
if (!k6Bin) {
  console.error("k6 is not installed. Install with: brew install k6");
  process.exit(1);
}

mkdirSync(RESULTS_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const summaryFile = resolve(RESULTS_DIR, `baseline-50-${stamp}.json`);
const sampler = createGateAProcessSampler({ localPort: getConfiguredLocalPort() });
sampler.start();

const childEnv = {
  ...process.env,
  HTBF_LOAD_TEST_ENV: "local-staging",
  HTBF_BASE_URL: preflight.k6Env.baseUrl,
  HTBF_SUPABASE_URL: preflight.k6Env.supabaseUrl,
  HTBF_SUPABASE_ANON_KEY: preflight.k6Env.anonKey,
  HTBF_STAGING_PROJECT_REF: process.env.HTBF_STAGING_PROJECT_REF,
  HTBF_LOCAL_TEST_PORT: String(getConfiguredLocalPort()),
  HTBF_TEST_USER_POOL_FILE: resolve(
    ROOT,
    (process.env.HTBF_TEST_USER_POOL_FILE || "./load-tests/k6/fixtures/users.pool.local.csv").replace(
      /^\.\//,
      ""
    )
  ),
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

sampler.stop();

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Summary exported to ${summaryFile}`);
printGateAResultsReport(summaryFile, readFileSync, {
  scenarioLabel: "baseline-50",
  processSample: sampler.getSummary(),
});
