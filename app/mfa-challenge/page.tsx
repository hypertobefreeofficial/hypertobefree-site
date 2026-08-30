"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import {
  consumeMfaReturnPath,
  formatMfaVerifyError,
  isMfaChallengeComplete,
  MFA_NO_VERIFIED_FACTOR_MESSAGE,
  MFA_SESSION_EXPIRED_MESSAGE,
  readMfaAssuranceState,
  requiresMfaChallenge,
  selectVerifiedTotpFactor,
  signOutLocalFromMfaChallenge,
  verifyMfaTotpCode,
} from "../../lib/auth/mfaChallenge";
import { supabase } from "../../lib/supabaseClient";

type ChallengeState =
  | "loading"
  | "ready"
  | "missing_factor"
  | "session_expired";

export default function MfaChallengePage() {
  const [state, setState] = useState<ChallengeState>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [factorLabel, setFactorLabel] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function initializeChallenge() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const assurance = await readMfaAssuranceState(supabase);
      if (cancelled) {
        return;
      }

      if (!assurance) {
        setState("session_expired");
        setMessage(MFA_SESSION_EXPIRED_MESSAGE);
        return;
      }

      if (isMfaChallengeComplete(assurance)) {
        window.location.href = consumeMfaReturnPath(sessionStorage);
        return;
      }

      if (!requiresMfaChallenge(assurance)) {
        window.location.href = consumeMfaReturnPath(sessionStorage);
        return;
      }

      const { data: factors, error: factorsError } =
        await supabase.auth.mfa.listFactors();

      if (cancelled) {
        return;
      }

      if (factorsError) {
        setState("session_expired");
        setMessage(formatMfaVerifyError(factorsError));
        return;
      }

      const selectedFactor = selectVerifiedTotpFactor(factors);
      if (!selectedFactor) {
        setState("missing_factor");
        setMessage(MFA_NO_VERIFIED_FACTOR_MESSAGE);
        return;
      }

      setFactorId(selectedFactor.id);
      setFactorLabel(selectedFactor.friendly_name?.trim() || null);
      setState("ready");
    }

    void initializeChallenge();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleVerify() {
    if (!factorId || submitting) {
      return;
    }

    const trimmedCode = verifyCode.trim();
    if (!trimmedCode) {
      setMessage(
        "Enter the 6-digit code from your authenticator app to continue."
      );
      return;
    }

    setSubmitting(true);
    setMessage("");

    const result = await verifyMfaTotpCode(supabase, factorId, trimmedCode);
    if (result.ok === false) {
      setMessage(result.message);
      if (result.sessionExpired) {
        setState("session_expired");
      }
      setSubmitting(false);
      return;
    }

    const assurance = await readMfaAssuranceState(supabase);
    if (!assurance || !isMfaChallengeComplete(assurance)) {
      setMessage(MFA_SESSION_EXPIRED_MESSAGE);
      setState("session_expired");
      setSubmitting(false);
      return;
    }

    window.location.href = consumeMfaReturnPath(sessionStorage);
  }

  async function handleSignOut() {
    if (signingOut) {
      return;
    }

    setSigningOut(true);
    setMessage("");
    await signOutLocalFromMfaChallenge(supabase, sessionStorage);
    window.location.href = "/login";
  }

  if (state === "loading") {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-xl rounded-[2rem] bg-white p-8 shadow-sm">
          Checking your sign-in security...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] px-6 py-12 text-slate-900">
      <section className="mx-auto max-w-xl">
        <Link
          href="/login"
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[#0b63ce] hover:text-[#084f9f]"
          onClick={(event) => {
            event.preventDefault();
            void handleSignOut();
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Sign In
        </Link>

        <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-[#0b63ce]">
            <ShieldCheck className="h-4 w-4" />
            Two-Factor Verification
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57]">
            Confirm it&apos;s you.
          </h1>

          <p className="mt-4 leading-7 text-slate-600">
            Enter the 6-digit code from your authenticator app to finish signing
            in.
          </p>

          {factorLabel && (
            <p className="mt-3 text-sm font-semibold text-slate-500">
              Authenticator: {factorLabel}
            </p>
          )}

          {state === "ready" && (
            <div className="mt-8 grid gap-5">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Authenticator code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 tracking-[0.35em] outline-none focus:border-[#0b63ce] focus:bg-white"
                  placeholder="000000"
                  value={verifyCode}
                  onChange={(event) =>
                    setVerifyCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
              </div>

              {message && (
                <div className="rounded-2xl bg-blue-50 p-4 text-sm font-semibold leading-6 text-[#082f63]">
                  {message}
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleVerify()}
                disabled={submitting || signingOut}
                className="inline-flex w-full items-center justify-center rounded-full bg-[#0b63ce] px-6 py-4 text-base font-bold text-white shadow-sm hover:bg-[#084f9f] disabled:opacity-60"
              >
                {submitting ? "Verifying..." : "Continue"}
              </button>

              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={submitting || signingOut}
                className="text-sm font-bold text-[#0b63ce] hover:text-[#084f9f] disabled:opacity-60"
              >
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          )}

          {(state === "missing_factor" || state === "session_expired") && (
            <div className="mt-8 grid gap-5">
              {message && (
                <div className="rounded-2xl bg-blue-50 p-4 text-sm font-semibold leading-6 text-[#082f63]">
                  {message}
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className="inline-flex w-full items-center justify-center rounded-full bg-[#0b63ce] px-6 py-4 text-base font-bold text-white shadow-sm hover:bg-[#084f9f] disabled:opacity-60"
              >
                {signingOut ? "Signing out..." : "Sign out and return to login"}
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
