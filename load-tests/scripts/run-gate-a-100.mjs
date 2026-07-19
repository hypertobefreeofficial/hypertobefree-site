#!/usr/bin/env node
/**
 * Gate A read-only 100-user runner (100 VUs / 20 minutes).
 * Local-staging only — pre-authenticates 10 synthetic users once, then reuses
 * those sessions across 100 VUs with zero load-phase sign-in requests.
 *
 * Usage:
 *   node load-tests/scripts/run-gate-a-100.mjs --preflight-only
 *   node load-tests/scripts/run-gate-a-100.mjs
 */

import { spawnSync } from "node:child_process";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfiguredLocalPort, loadStagingEnvFile } from "./stagingGuards.mjs";
import { runGateAPreflight } from "./gateAPreflight.mjs";
import { printGateAResultsReport } from "./gateAMetrics.mjs";
import { createGateAProcessSampler } from "./gateAProcessSampler.mjs";
import {
  buildPreauthSessionPoolFromCapturedSessions,
  defaultPreauthSessionsFile,
  writePreauthSessionFile,
} from "./gateASessionPool.mjs";
import {
  gateA100LoadPhaseAuthRequests,
  gateA100PreflightAuthRequests,
} from "./gateAAuthPolicy.mjs";
import { sanitizeLogPayload } from "./gateAAuth.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const ENV_FILE = resolve(ROOT, "load-tests/k6/.env.staging.local");
const SCENARIO = resolve(ROOT, "load-tests/k6/scenarios/gate-a-100.js");
const RESULTS_DIR = resolve(ROOT, "load-tests/k6/results");
const SESSIONS_FILE = defaultPreauthSessionsFile(ROOT);
const preflightOnly = process.argv.includes("--preflight-only");

function sessionsFileGitignored() {
  try {
    execSync(`git check-ignore -q "${SESSIONS_FILE}"`, { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (!loadStagingEnvFile(ENV_FILE)) {
  console.error("Missing staging environment file.");
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
    captureAuthSessions: true,
    authSignInDelayMs: 250,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (!preflight.authSessions || preflight.authSessions.length !== gateA100PreflightAuthRequests()) {
  console.error(
    "Gate A 100-user preflight aborted: missing or incomplete pre-authenticated session pool."
  );
  process.exit(1);
}

if ((preflight.authSweep?.auth429Count || 0) > 0) {
  console.error(
    "Gate A 100-user preflight aborted: Supabase Auth rate limiting (HTTP 429) during preflight authentication."
  );
  process.exit(1);
}

let sessionPool;
try {
  sessionPool = buildPreauthSessionPoolFromCapturedSessions(preflight.authSessions);
  writePreauthSessionFile(SESSIONS_FILE, sessionPool.sessions);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      preflight: {
        pass: preflight.pass,
        checks: preflight.checks,
        envSummary: preflight.envSummary,
        authSweep: preflight.authSweep,
        sessionPool: sanitizeLogPayload({
          preflightAuthRequests: sessionPool.preflightAuthRequests,
          loadPhaseAuthRequests: gateA100LoadPhaseAuthRequests(),
          sessionCount: sessionPool.sessionCount,
          sessionsFileGitignored: sessionsFileGitignored(),
        }),
      },
    },
    null,
    2
  )
);

if (!preflight.pass) {
  process.exit(1);
}

if (preflightOnly) {
  console.log(
    "Gate A 100-user preflight passed. Start the local server, then run without --preflight-only."
  );
  process.exit(0);
}

const k6Bin = preflight.k6Binary;
if (!k6Bin) {
  console.error("k6 is not installed.");
  process.exit(1);
}

mkdirSync(RESULTS_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const summaryFile = resolve(RESULTS_DIR, `gate-a-100-${stamp}.json`);
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
  HTBF_PREAUTH_SESSIONS_FILE: SESSIONS_FILE,
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
  scenarioLabel: "gate-a-100",
  processSample: sampler.getSummary(),
});
