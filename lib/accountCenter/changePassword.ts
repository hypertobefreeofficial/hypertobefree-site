import type { SupabaseClient } from "@supabase/supabase-js";

export const HTBF_PASSWORD_MIN_LENGTH = 8;

export type PasswordChangeValidationResult =
  | { ok: true; password: string }
  | { ok: false; message: string };

export type PasswordUpdateFailureCode =
  | "not_authenticated"
  | "validation_error"
  | "auth_error";

export type PasswordUpdateResult =
  | { ok: true }
  | { ok: false; code: PasswordUpdateFailureCode; message: string };

export function validatePasswordChangeInput(
  password: string,
  confirmPassword: string
): PasswordChangeValidationResult {
  if (!password) {
    return { ok: false, message: "Please enter a new password." };
  }

  if (!confirmPassword) {
    return { ok: false, message: "Please confirm your new password." };
  }

  if (password.length < HTBF_PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      message: `Please use at least ${HTBF_PASSWORD_MIN_LENGTH} characters for your new password.`,
    };
  }

  if (password !== confirmPassword) {
    return { ok: false, message: "The passwords do not match." };
  }

  return { ok: true, password };
}

export function formatPasswordUpdateError(error: unknown): string {
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
    return "Your session expired. Please sign in again before changing your password.";
  }

  return "Could not update your password right now. Please try again.";
}

export async function updateAuthenticatedUserPassword(
  client: SupabaseClient,
  input: {
    password: string;
    confirmPassword: string;
  }
): Promise<PasswordUpdateResult> {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return {
      ok: false,
      code: "not_authenticated",
      message: "Please sign in again before changing your password.",
    };
  }

  const validation = validatePasswordChangeInput(
    input.password,
    input.confirmPassword
  );

  if (validation.ok === false) {
    return {
      ok: false,
      code: "validation_error",
      message: validation.message,
    };
  }

  const { error } = await client.auth.updateUser({
    password: validation.password,
  });

  if (error) {
    return {
      ok: false,
      code: "auth_error",
      message: formatPasswordUpdateError(error),
    };
  }

  return { ok: true };
}
