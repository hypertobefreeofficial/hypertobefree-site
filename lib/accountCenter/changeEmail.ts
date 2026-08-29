import type { SupabaseClient } from "@supabase/supabase-js";

export const HTBF_MAX_EMAIL_LENGTH = 254;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailChangeValidationResult =
  | { ok: true; email: string }
  | { ok: false; message: string };

export type EmailChangeFailureCode =
  | "not_authenticated"
  | "validation_error"
  | "auth_error";

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

export function formatEmailUpdateError(error: unknown): string {
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
    message.includes("not authenticated")
  ) {
    return "Your session expired. Please sign in again before changing your email.";
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

  const { data, error } = await client.auth.updateUser(
    { email: validation.email },
    input.emailRedirectTo ? { emailRedirectTo: input.emailRedirectTo } : {}
  );

  if (error) {
    return {
      ok: false,
      code: "auth_error",
      message: formatEmailUpdateError(error),
    };
  }

  return resolveEmailChangeOutcome(validation.email, data?.user);
}
