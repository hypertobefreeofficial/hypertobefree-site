import type { SupabaseClient } from "@supabase/supabase-js";
import { assertAal2ForSensitiveAction } from "../auth/mfaStepUp";
import {
  HTBF_PASSWORD_MIN_LENGTH,
  validatePasswordChangeInput,
  formatPasswordUpdateError,
} from "./changePassword";

export type RecoveryPasswordUpdateFailureCode =
  | "not_authenticated"
  | "validation_error"
  | "auth_error"
  | "insufficient_aal"
  | "factor_not_found";

export type RecoveryPasswordUpdateResult =
  | { ok: true }
  | {
      ok: false;
      code: RecoveryPasswordUpdateFailureCode;
      message: string;
    };

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

function mapRecoveryPasswordUpdateError(error: unknown): {
  code: RecoveryPasswordUpdateFailureCode;
  message: string;
} {
  const code = readAuthErrorCode(error);

  if (code.includes("insufficient_aal")) {
    return {
      code: "insufficient_aal",
      message:
        "Verify your authenticator app before resetting your password.",
    };
  }

  return {
    code: "auth_error",
    message: formatPasswordUpdateError(error),
  };
}

export async function updateRecoveryPassword(
  client: SupabaseClient,
  input: {
    password: string;
    confirmPassword: string;
  }
): Promise<RecoveryPasswordUpdateResult> {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return {
      ok: false,
      code: "not_authenticated",
      message: "Your password reset session expired. Please request a new reset link.",
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
    const mapped = mapRecoveryPasswordUpdateError(error);
    return { ok: false, ...mapped };
  }

  return { ok: true };
}

export { HTBF_PASSWORD_MIN_LENGTH };
