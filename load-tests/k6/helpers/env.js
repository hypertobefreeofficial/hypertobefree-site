const PRODUCTION_HOST_PATTERNS = [
  "hypertobefree.com",
  "www.hypertobefree.com",
];

const VERCEL_HOST_PATTERN = /\.vercel\.app$/i;
const LOCAL_STAGING_HOSTS = new Set(["127.0.0.1", "localhost"]);
const LOCAL_STAGING_DEFAULT_PORT = 3100;
const ALLOWED_LOAD_TEST_ENV = "local-staging";

export const LOAD_TEST_MARKER = "htbf_loadtest";
export const LOAD_TEST_CREATION_MODE = "loadtest";

const HOSTED_SCENARIO_DISABLED_MESSAGE =
  "DISABLED: This scenario targets hosted infrastructure. Vercel-hosted k6 load tests are not permitted on the Hobby plan. Use local-staging smoke-10 against a local production build on 127.0.0.1:3100.";

export function assertHostedScenarioAllowed() {
  throw new Error(HOSTED_SCENARIO_DISABLED_MESSAGE);
}

export function requireLoadTestEnvironment() {
  if (__ENV.HTBF_LOAD_TEST_ENV !== ALLOWED_LOAD_TEST_ENV) {
    throw new Error(
      `Refusing to run: set HTBF_LOAD_TEST_ENV=${ALLOWED_LOAD_TEST_ENV} exactly.`
    );
  }
}

function parsePort(url) {
  if (url.port) return Number.parseInt(url.port, 10);
  return url.protocol === "https:" ? 443 : 80;
}

export function requireBaseUrl() {
  const baseUrl = (__ENV.HTBF_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("Refusing to run: HTBF_BASE_URL is required.");
  }

  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("Refusing to run: HTBF_BASE_URL must be a valid URL.");
  }

  const hostname = url.hostname.toLowerCase();

  for (const pattern of PRODUCTION_HOST_PATTERNS) {
    if (hostname === pattern || hostname.endsWith(`.${pattern}`)) {
      throw new Error(
        `Refusing to run: HTBF_BASE_URL hostname "${hostname}" matches production HTBF domain.`
      );
    }
  }

  if (VERCEL_HOST_PATTERN.test(hostname)) {
    throw new Error(
      `Refusing to run: HTBF_BASE_URL hostname "${hostname}" is a Vercel deployment.`
    );
  }

  if (!LOCAL_STAGING_HOSTS.has(hostname)) {
    throw new Error(
      `Refusing to run: HTBF_BASE_URL must target 127.0.0.1 or localhost for local-staging mode.`
    );
  }

  const configuredPort = Number.parseInt(
    (__ENV.HTBF_LOCAL_TEST_PORT || `${LOCAL_STAGING_DEFAULT_PORT}`).trim(),
    10
  );
  const effectivePort = parsePort(url);

  if (
    effectivePort !== configuredPort &&
    __ENV.HTBF_ALLOW_ALT_LOCAL_PORT !== "1"
  ) {
    throw new Error(
      `Refusing to run: HTBF_BASE_URL must use port ${configuredPort}.`
    );
  }

  return baseUrl;
}

export function requireSupabaseConfig() {
  const supabaseUrl = (__ENV.HTBF_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anonKey = (__ENV.HTBF_SUPABASE_ANON_KEY || "").trim();

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Refusing to run: HTBF_SUPABASE_URL and HTBF_SUPABASE_ANON_KEY are required."
    );
  }

  let hostname = "";
  try {
    hostname = new URL(supabaseUrl).hostname.toLowerCase();
  } catch {
    throw new Error("Refusing to run: HTBF_SUPABASE_URL must be a valid URL.");
  }

  if (!hostname.endsWith(".supabase.co")) {
    throw new Error("Refusing to run: HTBF_SUPABASE_URL must be a Supabase URL.");
  }

  const projectRef = (__ENV.HTBF_STAGING_PROJECT_REF || "").trim();
  if (!projectRef) {
    throw new Error(
      "Refusing to run: HTBF_STAGING_PROJECT_REF must be set to the generated Supabase project reference."
    );
  }

  if (projectRef === "htbf-staging") {
    throw new Error(
      'Refusing to run: HTBF_STAGING_PROJECT_REF must not be the branch display name "htbf-staging".'
    );
  }

  if (hostname !== `${projectRef}.supabase.co`) {
    throw new Error(
      `Refusing to run: HTBF_SUPABASE_URL must exactly match ${projectRef}.supabase.co.`
    );
  }

  return { supabaseUrl, anonKey, projectRef };
}

export function requireTestUsers() {
  const poolFile = (__ENV.HTBF_TEST_USER_POOL_FILE || "").trim();
  const email = (__ENV.HTBF_TEST_USER_EMAIL || "").trim();
  const password = (__ENV.HTBF_TEST_USER_PASSWORD || "").trim();

  if (poolFile) {
    return { mode: "pool", poolFile };
  }

  if (email && password) {
    if (email.includes("@hypertobefree.com") || !email.includes("@staging.")) {
      throw new Error(
        "Refusing to run: use synthetic staging accounts such as loadtest_user_0001@staging.htbf.test only."
      );
    }
    return { mode: "single", email, password };
  }

  throw new Error(
    "Refusing to run: provide HTBF_TEST_USER_POOL_FILE or HTBF_TEST_USER_EMAIL + HTBF_TEST_USER_PASSWORD."
  );
}

export function requireMutationsEnabled() {
  if (__ENV.HTBF_ALLOW_MUTATIONS !== "1") {
    throw new Error(
      "Refusing to run mutation scenario: set HTBF_ALLOW_MUTATIONS=1 explicitly."
    );
  }
}

export function openAiCallsEnabled() {
  return __ENV.HTBF_ALLOW_OPENAI === "1";
}

export function assertAllRuntimeGuards(options = {}) {
  requireLoadTestEnvironment();
  const baseUrl = requireBaseUrl();
  const supabase = requireSupabaseConfig();
  const users = requireTestUsers();

  if (options.requireMutations) {
    requireMutationsEnabled();
  }

  return { baseUrl, supabase, users };
}

/** @deprecated */
export function requireStagingEnvironment() {
  requireLoadTestEnvironment();
}
