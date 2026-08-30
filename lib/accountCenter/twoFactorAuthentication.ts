import type { Factor, SupabaseClient } from "@supabase/supabase-js";
import {
  formatMfaVerifyError,
  isMfaChallengeComplete,
  readMfaAssuranceState,
  verifyMfaTotpCode,
  type MfaAssuranceState,
} from "../auth/mfaChallenge";

export const TWO_FACTOR_EXPLANATORY_NOTE =
  "Add a time-based one-time password (TOTP) from an authenticator app such as Google Authenticator, Authy, or 1Password. HTBF uses Supabase Auth for enrollment and verification.";

export const TWO_FACTOR_ENROLLMENT_SUCCESS_MESSAGE =
  "Two-factor authentication is now enabled for this account. Supabase may sign out your other HTBF sessions after the first successful verification.";

export const TWO_FACTOR_DISABLED_SUCCESS_MESSAGE =
  "Two-factor authentication was disabled for this account.";

export const TWO_FACTOR_INCOMPLETE_ENROLLMENT_MESSAGE =
  "An authenticator setup was started but never finished. HTBF cannot recover the original QR code or secret. Cancel the incomplete setup, then start again.";

export const TWO_FACTOR_LOST_DEVICE_NOTE =
  "If you lose access to all enrolled authenticator apps, you may need HTBF support to recover your account. Password reset alone does not bypass two-factor authentication.";

export const TWO_FACTOR_MULTIPLE_FACTORS_NOTE =
  "HTBF currently manages your primary authenticator app from this page. If you have additional enrolled factors in Supabase, they remain active until removed individually.";

export const TWO_FACTOR_DISABLE_CONFIRMATION =
  "Disable two-factor authentication? You will only need your password to sign in on this account.";

export type TwoFactorAuthFailureCode =
  | "not_authenticated"
  | "validation_error"
  | "auth_error"
  | "incomplete_enrollment_exists"
  | "insufficient_aal"
  | "factor_not_found";

export type TwoFactorAuthSnapshot = {
  assurance: MfaAssuranceState | null;
  verifiedTotpFactors: Factor[];
  unverifiedTotpFactors: Factor[];
};

export type TotpEnrollmentMaterial = {
  factorId: string;
  qrCode: string;
  secret: string;
  friendlyName?: string;
};

export type TwoFactorOperationResult =
  | { ok: true }
  | { ok: false; code: TwoFactorAuthFailureCode; message: string };

export type BeginTotpEnrollmentResult =
  | { ok: true; enrollment: TotpEnrollmentMaterial }
  | { ok: false; code: TwoFactorAuthFailureCode; message: string };

export type DisableTotpStepUpResult =
  | { ok: true; readyToDisable: true }
  | { ok: false; code: TwoFactorAuthFailureCode; message: string };

function readAuthErrorCode(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code.toLowerCase();
  }

  return "";
}

export function formatTwoFactorAuthError(error: unknown): string {
  const message =
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message.toLowerCase()
      : "";
  const code = readAuthErrorCode(error);

  if (
    message.includes("session") ||
    message.includes("jwt") ||
    message.includes("not authenticated") ||
    code === "session_expired"
  ) {
    return "Your session expired. Please sign in again before managing two-factor authentication.";
  }

  if (code.includes("mfa_totp_enroll_not_enabled")) {
    return "Authenticator enrollment is unavailable right now. Please try again later.";
  }

  if (code.includes("mfa_totp_verify_not_enabled")) {
    return "Authenticator verification is unavailable right now. Please try again later.";
  }

  if (code.includes("insufficient_aal")) {
    return "Verify your authenticator app again before changing two-factor authentication settings.";
  }

  if (code.includes("mfa_factor_not_found")) {
    return "That authenticator factor is no longer available. Refresh this page and try again.";
  }

  if (code.includes("mfa_challenge_expired")) {
    return "That verification code expired. Enter a new code from your authenticator app.";
  }

  if (code.includes("rate") || message.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  if (
    code.includes("mfa_verification_failed") ||
    code.includes("mfa_verification_rejected") ||
    message.includes("invalid")
  ) {
    return "The verification code was not accepted. Check your authenticator app and try again.";
  }

  return "Could not update two-factor authentication right now. Please try again.";
}

export function listUnverifiedTotpFactors(allFactors: Factor[] | undefined): Factor[] {
  return (allFactors ?? []).filter(
    (factor) => factor.factor_type === "totp" && factor.status === "unverified"
  );
}

export function selectPrimaryVerifiedTotpFactor(
  verifiedFactors: Factor[] | undefined
): Factor | null {
  const factors = verifiedFactors ?? [];
  if (factors.length === 0) {
    return null;
  }

  return [...factors].sort((left, right) =>
    left.created_at.localeCompare(right.created_at)
  )[0];
}

export function selectPrimaryUnverifiedTotpFactor(
  unverifiedFactors: Factor[]
): Factor | null {
  if (unverifiedFactors.length === 0) {
    return null;
  }

  return [...unverifiedFactors].sort((left, right) =>
    left.created_at.localeCompare(right.created_at)
  )[0];
}

export function formatTotpFactorCreatedAt(
  createdAt: string | null | undefined
): string | null {
  if (!createdAt) {
    return null;
  }

  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function validateTotpVerificationCode(
  code: string
):
  | { ok: false; code: TwoFactorAuthFailureCode; message: string }
  | { ok: true; code: string } {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    return {
      ok: false,
      code: "validation_error",
      message: "Enter the 6-digit code from your authenticator app.",
    };
  }

  return { ok: true, code: trimmed };
}

export async function loadTwoFactorAuthSnapshot(
  client: SupabaseClient
): Promise<
  | { ok: true; snapshot: TwoFactorAuthSnapshot }
  | { ok: false; code: "not_authenticated"; message: string }
> {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return {
      ok: false,
      code: "not_authenticated",
      message: "Please sign in again before managing two-factor authentication.",
    };
  }

  const assurance = await readMfaAssuranceState(client);
  const { data: factors, error } = await client.auth.mfa.listFactors();

  if (error) {
    return {
      ok: true,
      snapshot: {
        assurance,
        verifiedTotpFactors: [],
        unverifiedTotpFactors: [],
      },
    };
  }

  return {
    ok: true,
    snapshot: {
      assurance,
      verifiedTotpFactors: factors.totp ?? [],
      unverifiedTotpFactors: listUnverifiedTotpFactors(factors.all),
    },
  };
}

export async function beginTotpEnrollment(
  client: SupabaseClient
): Promise<BeginTotpEnrollmentResult> {
  const loaded = await loadTwoFactorAuthSnapshot(client);
  if (loaded.ok === false) {
    return loaded;
  }

  if (loaded.snapshot.unverifiedTotpFactors.length > 0) {
    return {
      ok: false,
      code: "incomplete_enrollment_exists",
      message: TWO_FACTOR_INCOMPLETE_ENROLLMENT_MESSAGE,
    };
  }

  const { data, error } = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "HTBF Authenticator",
  });

  if (error || !data || data.type !== "totp" || !data.totp) {
    return {
      ok: false,
      code: "auth_error",
      message: formatTwoFactorAuthError(error),
    };
  }

  return {
    ok: true,
    enrollment: {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      friendlyName: data.friendly_name,
    },
  };
}

export async function verifyTotpEnrollment(
  client: SupabaseClient,
  factorId: string,
  code: string
): Promise<TwoFactorOperationResult> {
  const validation = validateTotpVerificationCode(code);
  if (validation.ok === false) {
    return validation;
  }

  const loaded = await loadTwoFactorAuthSnapshot(client);
  if (loaded.ok === false) {
    return loaded;
  }

  const verifiedCode = validation.code;
  const verify = await verifyMfaTotpCode(client, factorId, verifiedCode);
  if (verify.ok === false) {
    return {
      ok: false,
      code: verify.sessionExpired ? "not_authenticated" : "auth_error",
      message: verify.message,
    };
  }

  const assurance = await readMfaAssuranceState(client);
  if (!assurance || !isMfaChallengeComplete(assurance)) {
    return {
      ok: false,
      code: "auth_error",
      message: "Two-factor authentication could not be confirmed. Please try again.",
    };
  }

  return { ok: true };
}

export async function cancelTotpEnrollment(
  client: SupabaseClient,
  factorId: string
): Promise<TwoFactorOperationResult> {
  const loaded = await loadTwoFactorAuthSnapshot(client);
  if (loaded.ok === false) {
    return loaded;
  }

  const target = loaded.snapshot.unverifiedTotpFactors.find(
    (factor) => factor.id === factorId
  );

  if (!target) {
    return {
      ok: false,
      code: "factor_not_found",
      message: "That incomplete authenticator setup is no longer available.",
    };
  }

  const { error } = await client.auth.mfa.unenroll({ factorId });

  if (error) {
    return {
      ok: false,
      code: "auth_error",
      message: formatTwoFactorAuthError(error),
    };
  }

  return { ok: true };
}

export async function stepUpTotpForDisable(
  client: SupabaseClient,
  factorId: string,
  code: string
): Promise<DisableTotpStepUpResult> {
  const validation = validateTotpVerificationCode(code);
  if (validation.ok === false) {
    return validation;
  }

  const verifiedCode = validation.code;
  const verify = await verifyMfaTotpCode(client, factorId, verifiedCode);
  if (verify.ok === false) {
    return {
      ok: false,
      code: verify.sessionExpired ? "not_authenticated" : "auth_error",
      message: verify.message,
    };
  }

  const assurance = await readMfaAssuranceState(client);
  if (!assurance || !isMfaChallengeComplete(assurance)) {
    return {
      ok: false,
      code: "insufficient_aal",
      message:
        "Verify your authenticator app again before disabling two-factor authentication.",
    };
  }

  return { ok: true, readyToDisable: true };
}

export async function disableVerifiedTotpFactor(
  client: SupabaseClient,
  factorId: string
): Promise<TwoFactorOperationResult> {
  const loaded = await loadTwoFactorAuthSnapshot(client);
  if (loaded.ok === false) {
    return loaded;
  }

  const target = loaded.snapshot.verifiedTotpFactors.find(
    (factor) => factor.id === factorId
  );

  if (!target) {
    return {
      ok: false,
      code: "factor_not_found",
      message: "That authenticator factor is no longer available.",
    };
  }

  const assurance = loaded.snapshot.assurance;
  if (!assurance || !isMfaChallengeComplete(assurance)) {
    return {
      ok: false,
      code: "insufficient_aal",
      message:
        "Verify your authenticator app again before disabling two-factor authentication.",
    };
  }

  const { error } = await client.auth.mfa.unenroll({ factorId });

  if (error) {
    const formatted = formatTwoFactorAuthError(error);
    const code = readAuthErrorCode(error).includes("insufficient_aal")
      ? "insufficient_aal"
      : "auth_error";

    return {
      ok: false,
      code,
      message: formatted,
    };
  }

  await client.auth.refreshSession();

  return { ok: true };
}
