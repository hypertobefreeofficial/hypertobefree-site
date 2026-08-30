import type { Factor, SupabaseClient } from "@supabase/supabase-js";
import {
  isMfaChallengeComplete,
  MFA_NO_VERIFIED_FACTOR_MESSAGE,
  readMfaAssuranceState,
  requiresMfaChallenge,
  selectVerifiedTotpFactor,
  verifyMfaTotpCode,
  type MfaAssuranceState,
} from "./mfaChallenge";

export const SENSITIVE_ACTION_STEP_UP_MESSAGE =
  "Verify your authenticator app before continuing with this account change.";

export const SENSITIVE_ACTION_ASSURANCE_UNAVAILABLE_MESSAGE =
  "Could not verify your sign-in security level. Please try again.";

export const SENSITIVE_ACTION_NOT_AUTHENTICATED_MESSAGE =
  "Please sign in again before continuing.";

export type SensitiveActionStepUpFailureCode =
  | "not_authenticated"
  | "validation_error"
  | "auth_error"
  | "insufficient_aal"
  | "factor_not_found";

export type SensitiveActionStepUpSnapshot = {
  assurance: MfaAssuranceState | null;
  verifiedTotpFactor: Factor | null;
  stepUpRequired: boolean;
};

export type SensitiveActionAalGateResult =
  | { ok: true }
  | { ok: false; code: SensitiveActionStepUpFailureCode; message: string };

export type SensitiveActionStepUpResult =
  | { ok: true; assurance: MfaAssuranceState }
  | { ok: false; code: SensitiveActionStepUpFailureCode; message: string };

function validateStepUpCode(
  code: string
):
  | { ok: false; code: "validation_error"; message: string }
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

export function requiresSensitiveActionStepUp(
  assurance: MfaAssuranceState | null
): boolean {
  return Boolean(assurance && requiresMfaChallenge(assurance));
}

export async function loadSensitiveActionStepUpSnapshot(
  client: SupabaseClient
): Promise<
  | { ok: true; snapshot: SensitiveActionStepUpSnapshot }
  | { ok: false; code: "not_authenticated"; message: string }
> {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return {
      ok: false,
      code: "not_authenticated",
      message: SENSITIVE_ACTION_NOT_AUTHENTICATED_MESSAGE,
    };
  }

  const assurance = await readMfaAssuranceState(client);
  const { data: factors, error } = await client.auth.mfa.listFactors();

  const verifiedTotpFactor =
    error || !factors
      ? null
      : selectVerifiedTotpFactor(factors);

  return {
    ok: true,
    snapshot: {
      assurance,
      verifiedTotpFactor,
      stepUpRequired: requiresSensitiveActionStepUp(assurance),
    },
  };
}

export async function assertAal2ForSensitiveAction(
  client: SupabaseClient
): Promise<SensitiveActionAalGateResult> {
  const loaded = await loadSensitiveActionStepUpSnapshot(client);

  if (loaded.ok === false) {
    return loaded;
  }

  const { assurance, verifiedTotpFactor, stepUpRequired } = loaded.snapshot;

  if (!assurance) {
    return {
      ok: false,
      code: "auth_error",
      message: SENSITIVE_ACTION_ASSURANCE_UNAVAILABLE_MESSAGE,
    };
  }

  if (!stepUpRequired) {
    return { ok: true };
  }

  if (!verifiedTotpFactor) {
    return {
      ok: false,
      code: "factor_not_found",
      message: MFA_NO_VERIFIED_FACTOR_MESSAGE,
    };
  }

  return {
    ok: false,
    code: "insufficient_aal",
    message: SENSITIVE_ACTION_STEP_UP_MESSAGE,
  };
}

export async function stepUpTotpForSensitiveAction(
  client: SupabaseClient,
  code: string,
  factorId?: string
): Promise<SensitiveActionStepUpResult> {
  const validation = validateStepUpCode(code);
  if (validation.ok === false) {
    return validation;
  }

  const loaded = await loadSensitiveActionStepUpSnapshot(client);
  if (loaded.ok === false) {
    return loaded;
  }

  const targetFactorId =
    factorId ?? loaded.snapshot.verifiedTotpFactor?.id ?? null;

  if (!targetFactorId) {
    return {
      ok: false,
      code: "factor_not_found",
      message: MFA_NO_VERIFIED_FACTOR_MESSAGE,
    };
  }

  const verify = await verifyMfaTotpCode(
    client,
    targetFactorId,
    validation.code
  );

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
      message: SENSITIVE_ACTION_STEP_UP_MESSAGE,
    };
  }

  return { ok: true, assurance };
}
