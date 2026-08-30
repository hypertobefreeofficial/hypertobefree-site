import type { SupabaseClient } from "@supabase/supabase-js";
import { assertAal2ForSensitiveAction } from "../auth/mfaStepUp";

export const HTBF_MAX_EMAIL_LENGTH = 254;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailChangeValidationResult =
  | { ok: true; email: string }
  | { ok: false; message: string };

export type EmailChangeFailureCode =
  | "not_authenticated"
  | "validation_error"
  | "auth_error"
  | "insufficient_aal"
  | "factor_not_found";

export type EmailChangeSuccess = {
  ok: true;
  /**
   * Supabase keeps the old sign-in email active until the change is confirmed,
   * so the UI must not claim the address already switched.
   */
  verificationRequired: boolean;
  pendingEmail: string;
};

export type EmailChangeResult =
  | EmailChangeSuccess
  | { ok: false; code: EmailChangeFailureCode; message: string };

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export const EMAIL_CHANGE_DUAL_CONFIRMATION_NOTE =
  "HTBF sends verification links to both your current sign-in email and your new email address. You must confirm the change from both addresses before your sign-in email will update.";

export function formatEmailChangeVerificationMessage(
  pendingEmail: string
): string {
  return `We sent verification links to your current sign-in email and to ${pendingEmail}. You must confirm the change from both email addresses before your sign-in email will update. Until then, keep signing in with your current email.`;
}

export function validateEmailChangeInput(input: {
  currentEmail: string | null | undefined;
  newEmail: string;
  confirmEmail: string;
}): EmailChangeValidationResult {
  const newEmail = normalizeEmail(input.newEmail);
  const confirmEmail = normalizeEmail(input.confirmEmail);

  if (!newEmail) {
    return { ok: false, message: "Please enter your new email address." };
  }

  if (!confirmEmail) {
    return { ok: false, message: "Please confirm your new email address." };
  }

  if (newEmail.length > HTBF_MAX_EMAIL_LENGTH) {
    return { ok: false, message: "That email address is too long." };
  }

  if (!EMAIL_PATTERN.test(newEmail)) {
    return { ok: false, message: "Please enter a valid email address." };
  }

  if (newEmail !== confirmEmail) {
    return { ok: false, message: "The email addresses do not match." };
  }

  if (normalizeEmail(input.currentEmail ?? "") === newEmail) {
    return {
      ok: false,
      message: "That is already your current sign-in email.",
    };
  }

  return { ok: true, email: newEmail };
}

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

export function formatEmailUpdateError(error: unknown): string {
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
    message.includes("not authenticated")
  ) {
    return "Your session expired. Please sign in again before changing your email.";
  }

  if (code.includes("insufficient_aal")) {
    return "Verify your authenticator app before changing your email.";
  }

  if (
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("already exists") ||
    message.includes("duplicate")
  ) {
    return "That email address cannot be used for HTBF. Please try a different one.";
  }

  if (message.includes("rate limit") || message.includes("too many")) {
    return "Too many email change attempts. Please wait a few minutes and try again.";
  }

  return "Could not start your email change right now. Please try again.";
}

/**
 * Supabase only reports the new address as active once it has been confirmed,
 * so this reads the returned user rather than assuming the change completed.
 */
export function resolveEmailChangeOutcome(
  requestedEmail: string,
  user: { email?: string | null; new_email?: string | null } | null | undefined
): EmailChangeSuccess {
  const activeEmail = normalizeEmail(user?.email ?? "");
  const pendingEmail = normalizeEmail(user?.new_email ?? "");

  if (activeEmail === requestedEmail && !pendingEmail) {
    return {
      ok: true,
      verificationRequired: false,
      pendingEmail: requestedEmail,
    };
  }

  return {
    ok: true,
    verificationRequired: true,
    pendingEmail: pendingEmail || requestedEmail,
  };
}

export async function requestAuthenticatedEmailChange(
  client: SupabaseClient,
  input: {
    newEmail: string;
    confirmEmail: string;
    emailRedirectTo?: string;
  }
): Promise<EmailChangeResult> {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return {
      ok: false,
      code: "not_authenticated",
      message: "Please sign in again before changing your email.",
    };
  }

  const validation = validateEmailChangeInput({
    currentEmail: user.email,
    newEmail: input.newEmail,
    confirmEmail: input.confirmEmail,
  });

  if (validation.ok === false) {
    return {
      ok: false,
      code: "validation_error",
      message: validation.message,
    };
  }

  const aalGate = await assertAal2ForSensitiveAction(client);
  if (aalGate.ok === false) {
    return aalGate;
  }

  const { data, error } = await client.auth.updateUser(
    { email: validation.email },
    input.emailRedirectTo ? { emailRedirectTo: input.emailRedirectTo } : {}
  );

  if (error) {
    const formatted = formatEmailUpdateError(error);
    const code = readAuthErrorCode(error).includes("insufficient_aal")
      ? "insufficient_aal"
      : "auth_error";

    return {
      ok: false,
      code,
      message: formatted,
    };
  }

  return resolveEmailChangeOutcome(validation.email, data?.user);
}
