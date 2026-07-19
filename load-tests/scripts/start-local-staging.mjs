#!/usr/bin/env node
/**
 * Start a local HTBF production build connected to htbf-staging Supabase only.
 * Loads exclusively load-tests/k6/.env.staging.local (gitignored).
 */

import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertEnvFileIsGitignored,
  assertLocalStagingBuildEnv,
  getConfiguredLocalPort,
  loadStagingEnvFile,
  redactEnvSummary,
} from "./stagingGuards.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const ENV_FILE = resolve(ROOT, "load-tests/k6/.env.staging.local");
const HOST = "127.0.0.1";

if (!loadStagingEnvFile(ENV_FILE)) {
  console.error(
    `Missing ${ENV_FILE}. Copy load-tests/k6/.env.staging.local.example first.`
  );
  process.exit(1);
}

try {
  assertEnvFileIsGitignored(ENV_FILE, ROOT);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

let env;
try {
  env = assertLocalStagingBuildEnv();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const port = getConfiguredLocalPort();
const healthUrl = `http://${HOST}:${port}/feed`;

console.log("Local Gate A server — safe environment summary:");
console.log(JSON.stringify(redactEnvSummary(env), null, 2));
console.log(`Building HTBF production bundle for local-staging on ${HOST}:${port}...`);

const build = spawnSync("npm", ["run", "build"], {
  cwd: ROOT,
  env: { ...process.env, NODE_ENV: "production" },
  stdio: "inherit",
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

console.log(`Starting production server at http://${HOST}:${port} ...`);

const server = spawn(
  "npx",
  ["next", "start", "-H", HOST, "-p", String(port)],
  {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  }
);

let stopping = false;

function safeLogChunk(chunk) {
  const text = chunk.toString();
  const lowered = text.toLowerCase();
  if (
    lowered.includes("authorization:") ||
    lowered.includes("service_role") ||
    lowered.includes("eyj")
  ) {
    return;
  }
  process.stdout.write(text);
}

server.stdout?.on("data", safeLogChunk);
server.stderr?.on("data", safeLogChunk);

async function waitForHealthy() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) {
        console.log(`Local server healthy (${response.status}) at ${healthUrl}`);
        console.log(
          "Local Gate A tests HTBF code and Supabase staging only. It does not certify Vercel or production concurrency capacity."
        );
        return;
      }
    } catch {
      // retry until deadline
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
  }

  throw new Error(`Timed out waiting for healthy response from ${healthUrl}`);
}

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`\nReceived ${signal}. Stopping local server...`);
  server.kill("SIGTERM");
  setTimeout(() => server.kill("SIGKILL"), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

server.on("exit", (code) => {
  if (!stopping) {
    console.error(`Local server exited unexpectedly with code ${code ?? "unknown"}`);
    process.exit(code ?? 1);
  }
  process.exit(0);
});

waitForHealthy().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  shutdown("startup-failure");
});
