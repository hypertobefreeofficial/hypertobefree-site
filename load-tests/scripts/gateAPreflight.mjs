/**
 * Shared Gate A preflight checks for local smoke and baseline runs.
 */

import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import {
  assertEnvFileIsGitignored,
  assertRequiredK6Env,
  assertRequiredStagingEnv,
  assertStagingAnonKeyAccepted,
  getConfiguredLocalPort,
  loadStagingEnvFile,
  redactEnvSummary,
} from "./stagingGuards.mjs";
import {
  buildAuthSignInHeaders,
  maxAuthAttempts,
  shouldAbortAuthImmediately,
  shouldRetryAuth,
} from "./gateAAuthPolicy.mjs";
import {
  classifySupabaseAuthError,
  createGateAAdminClient,
  sanitizeLogPayload,
  syncOneSyntheticUserPassword,
} from "./gateAAuth.mjs";

export function resolveK6Binary() {
  if (existsSync("/opt/homebrew/bin/k6")) return "/opt/homebrew/bin/k6";
  try {
    return execSync("command -v k6", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function gitignored(repoRoot, targetPath) {
  try {
    execSync(`git check-ignore -q "${targetPath}"`, { cwd: repoRoot, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function trackedUnrelatedChanges(repoRoot) {
  const out = execSync("git diff --name-only", { cwd: repoRoot, encoding: "utf8" }).trim();
  return out
    ? out.split("\n").filter(
        (p) => p && !p.startsWith("load-tests/") && p !== ".gitignore"
      )
    : [];
}

function parsePool(csv) {
  return csv
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().startsWith("email,"))
    .map((line) => {
      const comma = line.indexOf(",");
      return {
        email: line.slice(0, comma).trim(),
        password: line.slice(comma + 1).trim(),
      };
    })
    .filter((row) => row.email && row.password);
}

async function signInOnce(env, email, password, { captureSession = false } = {}) {
  const url = `${env.supabaseUrl}/auth/v1/token?grant_type=password`;
  const headers = buildAuthSignInHeaders(env.anonKey);
  const body = JSON.stringify({ email, password });
  let lastCategory = "authentication_failed";

  for (let attempt = 1; attempt <= maxAuthAttempts(); attempt += 1) {
    let res;
    try {
      res = await fetch(url, { method: "POST", headers, body });
    } catch {
      lastCategory = "network_error";
      if (!shouldRetryAuth(0, attempt)) break;
      continue;
    }

    let json = {};
    try {
      json = await res.json();
    } catch {}

    if (res.status === 200 && json.access_token) {
      return {
        ok: true,
        category: null,
        session: captureSession ? { accessToken: json.access_token } : undefined,
      };
    }

    const classified = classifySupabaseAuthError(
      res.status >= 400
        ? {
            code: json.error_code,
            message: json.msg || json.error_description || json.error || "",
          }
        : null
    );
    lastCategory = classified.category;

    if (res.status === 429) {
      lastCategory = "rate_limited";
      break;
    }

    if (
      shouldAbortAuthImmediately(res.status) ||
      ["invalid_credentials", "invalid_api_key", "email_not_confirmed", "user_banned"].includes(
        classified.category
      )
    ) {
      break;
    }

    if (res.status === 200 && !json.access_token) {
      lastCategory = "missing_access_token";
      break;
    }

    if (!shouldRetryAuth(res.status, attempt)) break;
  }

  return { ok: false, category: lastCategory };
}

export async function runGateAPreflight({
  repoRoot,
  envFile,
  requireLocalServer = false,
  requireAllUsersAuth = false,
  captureAuthSessions = false,
  authSignInDelayMs = 0,
}) {
  if (!loadStagingEnvFile(envFile)) {
    throw new Error("Missing staging environment file.");
  }

  const poolFile = resolve(
    repoRoot,
    (process.env.HTBF_TEST_USER_POOL_FILE || "./load-tests/k6/fixtures/users.pool.local.csv").replace(
      /^\.\//,
      ""
    )
  );
  const resultsDir = resolve(repoRoot, "load-tests/k6/results");

  const checks = {
    load_test_env_local_staging: process.env.HTBF_LOAD_TEST_ENV === "local-staging",
    base_url_local: process.env.HTBF_BASE_URL === "http://127.0.0.1:3100",
    local_test_port_3100: process.env.HTBF_LOCAL_TEST_PORT === "3100",
    supabase_ref_matches: false,
    anon_aliases_match:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === process.env.HTBF_SUPABASE_ANON_KEY,
    service_role_aliases_match:
      process.env.SUPABASE_SERVICE_ROLE_KEY === process.env.HTBF_SUPABASE_SERVICE_ROLE_KEY,
    user_pool_exists: existsSync(poolFile),
    user_pool_gitignored: gitignored(repoRoot, poolFile),
    results_dir_gitignored: gitignored(repoRoot, resultsDir),
    env_file_gitignored: false,
    k6_available: Boolean(resolveK6Binary()),
    no_tracked_unrelated_changes: trackedUnrelatedChanges(repoRoot).length === 0,
    anon_key_accepted: false,
    local_server_healthy: !requireLocalServer,
    all_users_authenticated: !requireAllUsersAuth,
  };

  try {
    assertEnvFileIsGitignored(envFile, repoRoot);
    checks.env_file_gitignored = true;
  } catch {
    checks.env_file_gitignored = false;
  }

  try {
    const url = new URL(process.env.HTBF_SUPABASE_URL);
    checks.supabase_ref_matches =
      url.hostname === `${process.env.HTBF_STAGING_PROJECT_REF?.trim()}.supabase.co`;
  } catch {}

  const k6Env = assertRequiredK6Env();
  await assertStagingAnonKeyAccepted(k6Env.supabaseUrl, k6Env.anonKey);
  checks.anon_key_accepted = true;

  if (requireLocalServer) {
    const target = `${k6Env.baseUrl.replace(/\/+$/, "")}/feed`;
    const response = await fetch(target, { redirect: "manual" });
    checks.local_server_healthy = response.status >= 200 && response.status < 500;
  }

  let authSweep = null;
  let authSessions = null;
  if (requireAllUsersAuth) {
    const stagingEnv = assertRequiredStagingEnv();
    const admin = createGateAAdminClient(stagingEnv.supabaseUrl, stagingEnv.serviceRoleKey);
    const pool = parsePool(readFileSync(poolFile, "utf8"));
    const failureCategories = {};
    const capturedSessions = [];
    let successful = 0;
    let failed = 0;
    let repairs = 0;
    let auth429Count = 0;
    let preflightAuthRequests = 0;

    for (const row of pool) {
      preflightAuthRequests += 1;
      let result = await signInOnce(stagingEnv, row.email, row.password, {
        captureSession: captureAuthSessions,
      });
      if (!result.ok && result.category === "invalid_credentials") {
        await syncOneSyntheticUserPassword(admin, row.email, row.password);
        repairs += 1;
        preflightAuthRequests += 1;
        result = await signInOnce(stagingEnv, row.email, row.password, {
          captureSession: captureAuthSessions,
        });
      }

      if (result.ok) {
        successful += 1;
        if (captureAuthSessions && result.session?.accessToken) {
          capturedSessions.push(result.session);
        }
      } else {
        failed += 1;
        if (result.category === "rate_limited") auth429Count += 1;
        failureCategories[result.category] = (failureCategories[result.category] || 0) + 1;
      }

      if (authSignInDelayMs > 0) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, authSignInDelayMs));
      }
    }

    authSweep = {
      usersChecked: pool.length,
      successfulSignIns: successful,
      failedSignIns: failed,
      failureCategories,
      passwordRepairs: repairs,
      preflightAuthRequests,
      auth429Count,
    };

    if (captureAuthSessions) {
      authSessions =
        successful >= pool.length && capturedSessions.length === pool.length
          ? capturedSessions
          : null;
    }

    checks.all_users_authenticated = successful >= 10 && auth429Count === 0;
  }

  const pass = Object.values(checks).every(Boolean);

  return {
    pass,
    checks,
    k6Env,
    envSummary: redactEnvSummary(k6Env),
    authSweep: authSweep ? sanitizeLogPayload(authSweep) : null,
    authSessions,
    k6Binary: resolveK6Binary(),
    localPort: getConfiguredLocalPort(),
  };
}
