import type { Factor, SupabaseClient } from "@supabase/supabase-js";
import { shouldUseLoggedInShell } from "../navigation/loggedInShellRoutes";

export const MFA_RETURN_TO_STORAGE_KEY = "htbf_mfa_return_to";
export const MFA_DEFAULT_RETURN_TO = "/feed";

export type MfaAssuranceState = {
  currentLevel: string | null;
  nextLevel: string | null;
};

export const MFA_GUARD_EXCLUDED_ROUTES = [
  "/login",
  "/mfa-challenge",
  "/forgot-password",
  "/reset-password",
  "/forgot-username",
  "/signup",
] as const;

export const MFA_INVALID_CODE_MESSAGE =
  "The verification code was not accepted. Check your authenticator app and try again.";

export const MFA_SESSION_EXPIRED_MESSAGE =
  "Your verification session expired. Please sign in again.";

export const MFA_NO_VERIFIED_FACTOR_MESSAGE =
  "We could not find an active authenticator for this account. Sign out and try again, or contact HTBF support if you need help.";

export const MFA_RATE_LIMIT_MESSAGE =
  "Too many attempts. Please wait a moment and try again.";

export function isSafeMfaReturnPath(
  path: string | null | undefined
): path is string {
  if (!path || typeof path !== "string") {
    return false;
  }

  const trimmed = path.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return false;
  }

  const lower = trimmed.toLowerCase();
  if (
    lower.includes("http://") ||
    lower.includes("https://") ||
    lower.startsWith("javascript:") ||
    lower.startsWith("data:")
  ) {
    return false;
  }

  return true;
}

export function resolveMfaReturnPath(
  path: string | null | undefined,
  fallback: string = MFA_DEFAULT_RETURN_TO
): string {
  return isSafeMfaReturnPath(path) ? path.trim() : fallback;
}

export function requiresMfaChallenge(state: MfaAssuranceState): boolean {
  return state.nextLevel === "aal2" && state.currentLevel !== "aal2";
}

export function isMfaChallengeComplete(state: MfaAssuranceState): boolean {
  return state.currentLevel === "aal2";
}

export function shouldEnforceMfaChallenge(
  pathname: string | null | undefined
): boolean {
  if (!pathname || !shouldUseLoggedInShell(pathname)) {
    return false;
  }

  return !MFA_GUARD_EXCLUDED_ROUTES.includes(
    pathname as (typeof MFA_GUARD_EXCLUDED_ROUTES)[number]
  );
}

export function saveMfaReturnPath(
  path: string,
  storage?: Pick<Storage, "setItem">
): void {
  const safePath = resolveMfaReturnPath(path);
  storage?.setItem(MFA_RETURN_TO_STORAGE_KEY, safePath);
}

export function peekMfaReturnPath(
  storage?: Pick<Storage, "getItem">,
  fallback: string = MFA_DEFAULT_RETURN_TO
): string {
  const raw = storage?.getItem(MFA_RETURN_TO_STORAGE_KEY);
  return resolveMfaReturnPath(raw, fallback);
}

export function consumeMfaReturnPath(
  storage?: Pick<Storage, "getItem" | "removeItem">,
  fallback: string = MFA_DEFAULT_RETURN_TO
): string {
  const raw = storage?.getItem(MFA_RETURN_TO_STORAGE_KEY) ?? null;
  storage?.removeItem(MFA_RETURN_TO_STORAGE_KEY);
  return resolveMfaReturnPath(raw, fallback);
}

export function selectVerifiedTotpFactor(
  factors: { totp?: Factor[] } | null | undefined
): Factor | null {
  const verifiedFactors = factors?.totp ?? [];
  if (verifiedFactors.length === 0) {
    return null;
  }

  return verifiedFactors[0] ?? null;
}

export function formatMfaVerifyError(error: unknown): string {
  const message =
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message.toLowerCase()
      : "";

  if (
    message.includes("session") ||
    message.includes("jwt") ||
    message.includes("not authenticated") ||
    message.includes("expired")
  ) {
    return MFA_SESSION_EXPIRED_MESSAGE;
  }

  if (message.includes("rate") || message.includes("too many")) {
    return MFA_RATE_LIMIT_MESSAGE;
  }

  return MFA_INVALID_CODE_MESSAGE;
}

export function isMfaSessionExpiredError(error: unknown): boolean {
  return formatMfaVerifyError(error) === MFA_SESSION_EXPIRED_MESSAGE;
}

export async function readMfaAssuranceState(
  client: SupabaseClient
): Promise<MfaAssuranceState | null> {
  const { data, error } =
    await client.auth.mfa.getAuthenticatorAssuranceLevel();

  if (error || !data) {
    return null;
  }

  return {
    currentLevel: data.currentLevel,
    nextLevel: data.nextLevel,
  };
}

export type MfaTotpVerifyResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      sessionExpired: boolean;
    };

export async function verifyMfaTotpCode(
  client: SupabaseClient,
  factorId: string,
  code: string
): Promise<MfaTotpVerifyResult> {
  const trimmedCode = code.trim();
  const challenge = await client.auth.mfa.challenge({ factorId });

  if (challenge.error) {
    return {
      ok: false,
      message: formatMfaVerifyError(challenge.error),
      sessionExpired: isMfaSessionExpiredError(challenge.error),
    };
  }

  const verify = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: trimmedCode,
  });

  if (verify.error) {
    return {
      ok: false,
      message: formatMfaVerifyError(verify.error),
      sessionExpired: isMfaSessionExpiredError(verify.error),
    };
  }

  return { ok: true };
}

export async function signOutLocalFromMfaChallenge(
  client: SupabaseClient,
  storage?: Pick<Storage, "removeItem">
): Promise<void> {
  storage?.removeItem(MFA_RETURN_TO_STORAGE_KEY);
  await client.auth.signOut({ scope: "local" });
}
