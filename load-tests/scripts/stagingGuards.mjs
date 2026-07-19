/**
 * Shared Gate A guards for local-staging load testing.
 * Never logs secret values.
 *
 * Policy: k6 must not target Vercel. Local Gate A uses a production Next.js build
 * on 127.0.0.1 connected to the htbf-staging Supabase branch only.
 */

import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const PRODUCTION_HOST_PATTERNS = ["hypertobefree.com", "www.hypertobefree.com"];
const VERCEL_HOST_PATTERN = /\.vercel\.app$/i;
export const LOCAL_STAGING_HOSTS = new Set(["127.0.0.1", "localhost"]);
export const LOCAL_STAGING_DEFAULT_PORT = 3100;
export const ALLOWED_LOAD_TEST_ENV = "local-staging";

export const GATE_A_CREATION_MODE = "loadtest";
export const GATE_A_TEXT_MARKER = "[HTBF_GATE_A_LOADTEST]";
export const GATE_A_USER_EMAIL_PATTERN =
  /^loadtest_user_\d{4}@staging\.htbf\.test$/;

export function requireLocalStagingLoadTestEnv() {
  if (process.env.HTBF_LOAD_TEST_ENV !== ALLOWED_LOAD_TEST_ENV) {
    throw new Error(
      `Refusing to continue: set HTBF_LOAD_TEST_ENV=${ALLOWED_LOAD_TEST_ENV} exactly.`
    );
  }
}

export function parseHostname(urlValue, label) {
  try {
    return new URL(urlValue).hostname.toLowerCase();
  } catch {
    throw new Error(`Refusing to continue: ${label} must be a valid URL.`);
  }
}

export function getConfiguredLocalPort() {
  const raw = process.env.HTBF_LOCAL_TEST_PORT?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : LOCAL_STAGING_DEFAULT_PORT;
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(
      "Refusing to continue: HTBF_LOCAL_TEST_PORT must be a valid TCP port."
    );
  }
  return parsed;
}

export function assertBlockedHostedTargets(hostname) {
  for (const pattern of PRODUCTION_HOST_PATTERNS) {
    if (hostname === pattern || hostname.endsWith(`.${pattern}`)) {
      throw new Error(
        `Refusing to continue: hostname "${hostname}" matches production HTBF domain.`
      );
    }
  }

  if (VERCEL_HOST_PATTERN.test(hostname)) {
    throw new Error(
      `Refusing to continue: hostname "${hostname}" is a Vercel deployment. k6 load tests must not target Vercel under the current plan.`
    );
  }
}

export function resolveStagingProjectRef() {
  const projectRef = process.env.HTBF_STAGING_PROJECT_REF?.trim();
  const strict = process.env.HTBF_REQUIRE_STAGING_REF !== "0";

  if (!projectRef) {
    if (strict) {
      throw new Error(
        "Refusing to continue: HTBF_STAGING_PROJECT_REF must be set to the generated Supabase project reference (not the branch display name htbf-staging)."
      );
    }
    return null;
  }

  if (projectRef === "htbf-staging") {
    throw new Error(
      'Refusing to continue: HTBF_STAGING_PROJECT_REF must be the generated Supabase project reference, not the branch display name "htbf-staging".'
    );
  }

  return projectRef;
}

export function assertExactStagingSupabaseUrl(supabaseUrl) {
  const hostname = parseHostname(supabaseUrl, "HTBF_SUPABASE_URL");

  if (!hostname.endsWith(".supabase.co")) {
    throw new Error(
      "Refusing to continue: HTBF_SUPABASE_URL must be a Supabase project URL."
    );
  }

  assertBlockedHostedTargets(hostname);

  const projectRef = resolveStagingProjectRef();
  const hostnameRef = hostname.slice(0, -".supabase.co".length);

  if (projectRef && hostname !== `${projectRef}.supabase.co`) {
    throw new Error(
      `Refusing to continue: HTBF_SUPABASE_URL hostname "${hostname}" must exactly match "${projectRef}.supabase.co".`
    );
  }

  return {
    hostname,
    projectRef: projectRef ?? hostnameRef,
    expectedHostname: projectRef ? `${projectRef}.supabase.co` : hostname,
  };
}

export function assertLocalStagingBaseUrl(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("Refusing to continue: HTBF_BASE_URL must be a valid URL.");
  }

  const hostname = url.hostname.toLowerCase();
  assertBlockedHostedTargets(hostname);

  if (!LOCAL_STAGING_HOSTS.has(hostname)) {
    throw new Error(
      `Refusing to continue: HTBF_BASE_URL hostname "${hostname}" is not a permitted local test host (127.0.0.1 or localhost).`
    );
  }

  const configuredPort = getConfiguredLocalPort();
  const effectivePort = url.port
    ? Number.parseInt(url.port, 10)
    : url.protocol === "https:"
      ? 443
      : 80;

  if (
    effectivePort !== configuredPort &&
    process.env.HTBF_ALLOW_ALT_LOCAL_PORT !== "1"
  ) {
    throw new Error(
      `Refusing to continue: HTBF_BASE_URL must use port ${configuredPort} (or set HTBF_ALLOW_ALT_LOCAL_PORT=1).`
    );
  }

  return { hostname, port: effectivePort, configuredPort };
}

export function assertSyntheticUserEmail(email) {
  if (!GATE_A_USER_EMAIL_PATTERN.test(email)) {
    throw new Error(
      `Refusing to continue: test account "${email}" is not a synthetic @staging.htbf.test load-test user.`
    );
  }
}

export function describeStagingAnonKey(anonKey) {
  const trimmed = anonKey?.trim() || "";
  return {
    present: Boolean(trimmed),
    legacyJwtFormat: trimmed.startsWith("eyJ"),
    length: trimmed.length,
  };
}

export async function assertStagingAnonKeyAccepted(supabaseUrl, anonKey) {
  const meta = describeStagingAnonKey(anonKey);
  if (!meta.present) {
    throw new Error("Missing HTBF_SUPABASE_ANON_KEY.");
  }

  if (!meta.legacyJwtFormat) {
    throw new Error(
      "Refusing to continue: HTBF_SUPABASE_ANON_KEY must be the htbf-staging legacy anon/public JWT (starts with eyJ)."
    );
  }

  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/settings`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });

  if (response.status === 401) {
    throw new Error(
      "Refusing to continue: HTBF_SUPABASE_ANON_KEY was rejected by htbf-staging Auth (invalid API key)."
    );
  }

  if (response.status >= 500) {
    throw new Error(
      "Refusing to continue: htbf-staging Auth settings probe failed with a server error."
    );
  }

  return meta;
}

export function loadStagingEnvFile(path, { overwrite = true } = {}) {
  if (!existsSync(path)) return false;

  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (overwrite || !process.env[key]) {
      process.env[key] = value;
    }
  }

  return true;
}

export function assertEnvFileIsGitignored(envFilePath, repoRoot) {
  try {
    const output = execSync(`git check-ignore -v "${envFilePath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!output) {
      throw new Error("git check-ignore returned no match");
    }
  } catch {
    throw new Error(
      `Refusing to continue: ${envFilePath} is not gitignored. Never commit staging credentials.`
    );
  }
}

export function syncNextPublicSupabaseEnv() {
  const supabaseUrl = process.env.HTBF_SUPABASE_URL?.trim();
  const anonKey = process.env.HTBF_SUPABASE_ANON_KEY?.trim();
  const serviceRoleKey = process.env.HTBF_SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (supabaseUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
  if (anonKey) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey;
  if (serviceRoleKey) process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
}

export function assertRequiredK6Env() {
  requireLocalStagingLoadTestEnv();

  const baseUrl = process.env.HTBF_BASE_URL?.trim();
  const supabaseUrl = process.env.HTBF_SUPABASE_URL?.trim();
  const anonKey = process.env.HTBF_SUPABASE_ANON_KEY?.trim();
  const poolFile = process.env.HTBF_TEST_USER_POOL_FILE?.trim();

  if (!baseUrl) throw new Error("Missing HTBF_BASE_URL.");
  if (!supabaseUrl) throw new Error("Missing HTBF_SUPABASE_URL.");
  if (!anonKey) throw new Error("Missing HTBF_SUPABASE_ANON_KEY.");
  if (!poolFile) throw new Error("Missing HTBF_TEST_USER_POOL_FILE.");
  if (!existsSync(poolFile)) {
    throw new Error(
      `Missing synthetic user pool file at ${poolFile}. Run seed-gate-a-staging.mjs first.`
    );
  }

  if (process.env.HTBF_ALLOW_MUTATIONS === "1") {
    throw new Error(
      "Refusing k6 smoke: HTBF_ALLOW_MUTATIONS must remain 0 for the first local read-only smoke run."
    );
  }

  const base = assertLocalStagingBaseUrl(baseUrl);
  const supabase = assertExactStagingSupabaseUrl(supabaseUrl);

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    supabaseUrl: supabaseUrl.replace(/\/+$/, ""),
    anonKey,
    baseHostname: base.hostname,
    basePort: base.port,
    supabaseProjectRef: supabase.projectRef,
    expectedSupabaseHostname: supabase.expectedHostname,
    poolFile,
  };
}

export function assertLocalStagingBuildEnv() {
  requireLocalStagingLoadTestEnv();

  const baseUrl = process.env.HTBF_BASE_URL?.trim();
  const supabaseUrl = process.env.HTBF_SUPABASE_URL?.trim();
  const anonKey = process.env.HTBF_SUPABASE_ANON_KEY?.trim();

  if (!baseUrl) throw new Error("Missing HTBF_BASE_URL.");
  if (!supabaseUrl) throw new Error("Missing HTBF_SUPABASE_URL.");
  if (!anonKey) throw new Error("Missing HTBF_SUPABASE_ANON_KEY.");

  const base = assertLocalStagingBaseUrl(baseUrl);
  const supabase = assertExactStagingSupabaseUrl(supabaseUrl);
  syncNextPublicSupabaseEnv();

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    supabaseUrl: supabaseUrl.replace(/\/+$/, ""),
    anonKey,
    baseHostname: base.hostname,
    basePort: base.port,
    supabaseProjectRef: supabase.projectRef,
    expectedSupabaseHostname: supabase.expectedHostname,
  };
}

export function assertRequiredStagingEnv() {
  requireLocalStagingLoadTestEnv();

  const baseUrl = process.env.HTBF_BASE_URL?.trim();
  const supabaseUrl = process.env.HTBF_SUPABASE_URL?.trim();
  const anonKey = process.env.HTBF_SUPABASE_ANON_KEY?.trim();
  const serviceRoleKey = process.env.HTBF_SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!baseUrl) throw new Error("Missing HTBF_BASE_URL.");
  if (!supabaseUrl) throw new Error("Missing HTBF_SUPABASE_URL.");
  if (!anonKey) throw new Error("Missing HTBF_SUPABASE_ANON_KEY.");
  if (!serviceRoleKey) {
    throw new Error(
      "Missing HTBF_SUPABASE_SERVICE_ROLE_KEY (required for seed/cleanup only)."
    );
  }

  const base = assertLocalStagingBaseUrl(baseUrl);
  const supabase = assertExactStagingSupabaseUrl(supabaseUrl);

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    supabaseUrl: supabaseUrl.replace(/\/+$/, ""),
    anonKey,
    serviceRoleKey,
    baseHostname: base.hostname,
    basePort: base.port,
    supabaseProjectRef: supabase.projectRef,
    expectedSupabaseHostname: supabase.expectedHostname,
  };
}

export function redactEnvSummary(env) {
  return {
    HTBF_LOAD_TEST_ENV: process.env.HTBF_LOAD_TEST_ENV,
    HTBF_BASE_URL: env.baseUrl,
    HTBF_BASE_HOSTNAME: env.baseHostname,
    HTBF_BASE_PORT: env.basePort,
    HTBF_SUPABASE_HOSTNAME: parseHostname(env.supabaseUrl, "HTBF_SUPABASE_URL"),
    HTBF_SUPABASE_PROJECT_REF: env.supabaseProjectRef,
    HTBF_STAGING_PROJECT_REF: process.env.HTBF_STAGING_PROJECT_REF,
    HTBF_ALLOW_MUTATIONS: process.env.HTBF_ALLOW_MUTATIONS || "0",
  };
}

/** @deprecated Use requireLocalStagingLoadTestEnv */
export function requireStagingLoadTestEnv() {
  requireLocalStagingLoadTestEnv();
}

/** @deprecated Use assertExactStagingSupabaseUrl */
export function assertStagingSupabaseUrl(supabaseUrl) {
  return assertExactStagingSupabaseUrl(supabaseUrl);
}

/** @deprecated Use assertLocalStagingBaseUrl */
export function assertSafeBaseUrl(baseUrl) {
  return assertLocalStagingBaseUrl(baseUrl);
}
