import type { SupabaseClient } from "@supabase/supabase-js";
import { assertAal2ForSensitiveAction } from "../auth/mfaStepUp";

export const HTBF_PASSWORD_MIN_LENGTH = 8;

export type PasswordChangeValidationResult =
  | { ok: true; password: string }
  | { ok: false; message: string };

export type PasswordUpdateFailureCode =
  | "not_authenticated"
  | "validation_error"
  | "auth_error"
  | "insufficient_aal"
  | "factor_not_found";

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

export function formatPasswordUpdateError(error: unknown): string {
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
    return "Your session expired. Please sign in again before changing your password.";
  }

  if (code.includes("insufficient_aal")) {
    return "Verify your authenticator app before changing your password.";
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

  const aalGate = await assertAal2ForSensitiveAction(client);
  if (aalGate.ok === false) {
    return aalGate;
  }

  const { error } = await client.auth.updateUser({
    password: validation.password,
  });

  if (error) {
    const formatted = formatPasswordUpdateError(error);
    const code = readAuthErrorCode(error).includes("insufficient_aal")
      ? "insufficient_aal"
      : "auth_error";

    return {
      ok: false,
      code,
      message: formatted,
    };
  }

  return { ok: true };
}
