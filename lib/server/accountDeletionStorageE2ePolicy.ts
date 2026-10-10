/**
 * Test-only opt-in for real local Supabase Storage API exercises (Phase 4C.7B.1E.2C.3B.3E).
 * Not a production feature flag — do not configure on Vercel Production.
 */

export const ACCOUNT_DELETION_STORAGE_E2E_TEST_ENV_FLAG =
  "HTBF_ACCOUNT_DELETION_STORAGE_E2E_TEST_ENABLED" as const;

export function isAccountDeletionStorageE2eTestEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env[ACCOUNT_DELETION_STORAGE_E2E_TEST_ENV_FLAG] === "true";
}

/** Allowed Supabase API hosts for physical Storage E2E (local CLI default). */
export function isLocalSupabaseProjectUrl(supabaseUrl: string): boolean {
  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (host !== "127.0.0.1" && host !== "localhost") {
      return false;
    }
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    return port === "54321";
  } catch {
    return false;
  }
}

export function assertLocalSupabaseForStorageE2e(
  supabaseUrl: string | undefined
): asserts supabaseUrl is string {
  if (!supabaseUrl) {
    throw new Error("storage_e2e_missing_supabase_url");
  }
  if (!isLocalSupabaseProjectUrl(supabaseUrl)) {
    throw new Error("storage_e2e_refused_non_local_supabase_url");
  }
}

export const ACCOUNT_DELETION_STORAGE_E2E_OPT_IN_NOTE =
  "Real Supabase Storage remove() E2E requires HTBF_ACCOUNT_DELETION_STORAGE_E2E_TEST_ENABLED=true "
  + "and NEXT_PUBLIC_SUPABASE_URL pointing at local Supabase (127.0.0.1:54321 or localhost:54321). "
  + "Never run against Production or remote projects by default.";
