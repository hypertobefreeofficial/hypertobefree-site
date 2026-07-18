const PRODUCTION_HOST_PATTERNS = [
  "hypertobefree.com",
  "www.hypertobefree.com",
];

export const LOAD_TEST_MARKER = "htbf_loadtest";
export const LOAD_TEST_CREATION_MODE = "loadtest";

export function requireStagingEnvironment() {
  if (__ENV.HTBF_LOAD_TEST_ENV !== "staging") {
    throw new Error(
      'Refusing to run: set HTBF_LOAD_TEST_ENV=staging exactly.'
    );
  }
}

export function requireBaseUrl() {
  const baseUrl = (__ENV.HTBF_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("Refusing to run: HTBF_BASE_URL is required.");
  }

  let hostname = "";
  try {
    hostname = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    throw new Error("Refusing to run: HTBF_BASE_URL must be a valid URL.");
  }

  for (const pattern of PRODUCTION_HOST_PATTERNS) {
    if (hostname === pattern || hostname.endsWith(`.${pattern}`)) {
      throw new Error(
        `Refusing to run: HTBF_BASE_URL hostname "${hostname}" matches production HTBF domain.`
      );
    }
  }

  if (!hostname.includes("vercel.app") && !hostname.includes("localhost")) {
    console.warn(
      `Warning: HTBF_BASE_URL hostname "${hostname}" is not a known staging pattern. Verify manually before running.`
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

  return { supabaseUrl, anonKey, projectRef: hostname.split(".")[0] };
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
  requireStagingEnvironment();
  const baseUrl = requireBaseUrl();
  const supabase = requireSupabaseConfig();
  const users = requireTestUsers();

  if (options.requireMutations) {
    requireMutationsEnabled();
  }

  return { baseUrl, supabase, users };
}
