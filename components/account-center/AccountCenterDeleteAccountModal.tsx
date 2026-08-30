"use client";

import { useEffect, useState } from "react";
import {
  cancelAccountDeletionRequest,
  fetchOpenAccountDeletionRequest,
  getAccountDeletionRequestUserStatusLabel,
  canUserCancelAccountDeletionRequest,
  isOpenAccountDeletionRequest,
  submitAccountDeletionRequest,
  type AccountDeletionRequest,
} from "../../lib/accountCenter/accountDeletionRequest";
import { isMfaChallengeComplete } from "../../lib/auth/mfaChallenge";
import {
  loadSensitiveActionStepUpSnapshot,
  stepUpTotpForSensitiveAction,
  type SensitiveActionStepUpSnapshot,
} from "../../lib/auth/mfaStepUp";
import SensitiveActionMfaStepUp from "./SensitiveActionMfaStepUp";
import { supabase } from "../../lib/supabaseClient";

type ModalView =
  | "loading"
  | "confirm"
  | "mfa_step_up"
  | "submitting"
  | "success"
  | "open_request"
  | "cancelling"
  | "cancelled"
  | "error"
  | "unauthenticated";

type AccountCenterDeleteAccountModalProps = {
  open: boolean;
  onClose: () => void;
};

function formatRequestDate(value: string | null) {
  if (!value) {
    return "date unavailable";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "date unavailable";
  }

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AccountCenterDeleteAccountModal({
  open,
  onClose,
}: AccountCenterDeleteAccountModalProps) {
  const [view, setView] = useState<ModalView>("loading");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [stepUpCode, setStepUpCode] = useState("");
  const [stepUpVerifying, setStepUpVerifying] = useState(false);
  const [stepUpSnapshot, setStepUpSnapshot] =
    useState<SensitiveActionStepUpSnapshot | null>(null);
  const [openRequest, setOpenRequest] = useState<AccountDeletionRequest | null>(
    null
  );
  const [submittedRequest, setSubmittedRequest] =
    useState<AccountDeletionRequest | null>(null);

  async function refreshStepUpSnapshot() {
    const loaded = await loadSensitiveActionStepUpSnapshot(supabase);
    if (loaded.ok === false) {
      setStepUpSnapshot(null);
      return null;
    }

    setStepUpSnapshot(loaded.snapshot);
    return loaded.snapshot;
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadDeletionState() {
      setView("loading");
      setMessage("");
      setReason("");
      setStepUpCode("");
      setSubmittedRequest(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) {
        return;
      }

      if (!user) {
        setView("unauthenticated");
        return;
      }

      setUserId(user.id);
      setEmail(user.email ?? null);

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();

      if (!cancelled) {
        setUsername(
          typeof profile?.username === "string" ? profile.username : null
        );
      }

      const { request, error } = await fetchOpenAccountDeletionRequest(
        supabase,
        user.id
      );

      if (cancelled) {
        return;
      }

      if (error) {
        setMessage(
          "Could not check your account deletion request status right now. You can try again in a moment."
        );
        setView("error");
        return;
      }

      if (request && isOpenAccountDeletionRequest(request)) {
        setOpenRequest(request);
        setView("open_request");
        return;
      }

      setOpenRequest(null);
      await refreshStepUpSnapshot();
      setView("confirm");
    }

    void loadDeletionState();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const stepUpRequired = Boolean(stepUpSnapshot?.stepUpRequired);
  const atAal2 = Boolean(
    stepUpSnapshot?.assurance && isMfaChallengeComplete(stepUpSnapshot.assurance)
  );
  const canCancel = canUserCancelAccountDeletionRequest(openRequest);

  async function submitDeletionRequest() {
    if (!userId || view === "submitting") {
      return;
    }

    setView("submitting");
    setMessage("");

    const result = await submitAccountDeletionRequest(supabase, {
      authenticatedUserId: userId,
      submission: {
        userId,
        email,
        username,
        reason,
      },
      openRequest,
    });

    if (result.ok === false) {
      if (result.code === "already_requested") {
        setView("open_request");
        return;
      }

      if (result.code === "insufficient_aal") {
        await refreshStepUpSnapshot();
        setView("mfa_step_up");
        setMessage(result.message);
        return;
      }

      setMessage(result.message);
      setView("error");
      return;
    }

    setSubmittedRequest(result.request);
    setOpenRequest(result.request);
    setView("success");
  }

  async function handleSubmitRequest() {
    if (!userId || view === "submitting" || stepUpVerifying) {
      return;
    }

    if (stepUpRequired && !atAal2) {
      setMessage("");
      setView("mfa_step_up");
      return;
    }

    await submitDeletionRequest();
  }

  async function handleCancelRequest() {
    if (!userId || !openRequest || view === "cancelling") {
      return;
    }

    setView("cancelling");
    setMessage("");

    const result = await cancelAccountDeletionRequest(supabase, {
      authenticatedUserId: userId,
      request: openRequest,
    });

    if (result.ok === false) {
      setMessage(result.message);
      setView("open_request");
      return;
    }

    setOpenRequest(null);
    setView("cancelled");
  }

  async function handleMfaStepUp() {
    if (stepUpVerifying || view === "submitting") {
      return;
    }

    setMessage("");
    setStepUpVerifying(true);

    const result = await stepUpTotpForSensitiveAction(supabase, stepUpCode);

    setStepUpVerifying(false);

    if (result.ok === false) {
      if (result.code === "not_authenticated") {
        setView("unauthenticated");
        return;
      }

      setMessage(result.message);
      return;
    }

    setStepUpCode("");
    await refreshStepUpSnapshot();
    await submitDeletionRequest();
  }

  if (!open) {
    return null;
  }

  const displayedRequest = submittedRequest ?? openRequest;

  return (
    <div className="fixed inset-0 z-[90] flex items-end bg-black/60 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
      <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 text-slate-900 shadow-2xl">
        <div className="text-xs font-black uppercase tracking-[0.18em] text-red-700">
          HYPER TO BE FREE
        </div>

        {view === "loading" && (
          <>
            <h2 className="mt-2 text-2xl font-black text-[#062a57]">
              Delete account?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Checking your account deletion request status...
            </p>
          </>
        )}

        {view === "unauthenticated" && (
          <>
            <h2 className="mt-2 text-2xl font-black text-[#062a57]">
              Sign in required
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Please sign in before requesting account deletion.
            </p>
            <div className="mt-5">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700"
              >
                Close
              </button>
            </div>
          </>
        )}

        {view === "confirm" && (
          <>
            <h2 className="mt-2 text-2xl font-black text-[#062a57]">
              Request account deletion?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This submits an account deletion request to HTBF for review. Your
              account will not be deleted instantly. If approved and processed,
              your access, uploads, messages, and prayer activity may be
              permanently removed.
            </p>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-black text-[#062a57]">
                Optional reason
              </span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Tell us why you want to delete your account. You can leave this blank."
                className="min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 outline-none focus:border-red-200 focus:bg-white focus:ring-4 focus:ring-red-50"
              />
            </label>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700"
              >
                Not Yet
              </button>
              <button
                type="button"
                onClick={() => void handleSubmitRequest()}
                className="flex-1 rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white"
              >
                Submit Request
              </button>
            </div>
          </>
        )}

        {view === "mfa_step_up" && (
          <>
            <h2 className="mt-2 text-2xl font-black text-[#062a57]">
              Verify before submitting
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This account uses two-factor authentication. Verify your
              authenticator app before HTBF can submit your deletion request.
            </p>

            <div className="mt-5">
              <SensitiveActionMfaStepUp
                stepUpCode={stepUpCode}
                onStepUpCodeChange={setStepUpCode}
                onVerify={() => void handleMfaStepUp()}
                verifying={stepUpVerifying}
                verifyLabel="Verify and submit request"
                onCancel={() => {
                  setStepUpCode("");
                  setMessage("");
                  setView("confirm");
                }}
              />
            </div>

            {message ? (
              <p className="mt-4 text-sm font-semibold leading-6 text-red-700">
                {message}
              </p>
            ) : null}
          </>
        )}

        {view === "submitting" && (
          <>
            <h2 className="mt-2 text-2xl font-black text-[#062a57]">
              Submitting request...
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Please wait while HTBF records your account deletion request.
            </p>
          </>
        )}

        {view === "success" && (
          <>
            <h2 className="mt-2 text-2xl font-black text-[#062a57]">
              Request submitted
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Your account deletion request was submitted on{" "}
              {formatRequestDate(displayedRequest?.created_at ?? null)}.{" "}
              {getAccountDeletionRequestUserStatusLabel(displayedRequest)}
            </p>
            <div className="mt-5">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white"
              >
                Close
              </button>
            </div>
          </>
        )}

        {(view === "open_request" || view === "cancelling") && (
          <>
            <h2 className="mt-2 text-2xl font-black text-[#062a57]">
              Deletion request in progress
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Your account deletion request was submitted on{" "}
              {formatRequestDate(displayedRequest?.created_at ?? null)}.{" "}
              {getAccountDeletionRequestUserStatusLabel(displayedRequest)}
            </p>

            {canCancel ? (
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => void handleCancelRequest()}
                  disabled={view === "cancelling"}
                  className="flex-1 rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
                >
                  {view === "cancelling" ? "Cancelling..." : "Cancel Request"}
                </button>
              </div>
            ) : (
              <div className="mt-5">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700"
                >
                  Close
                </button>
              </div>
            )}

            {message ? (
              <p className="mt-4 text-sm font-semibold leading-6 text-red-700">
                {message}
              </p>
            ) : null}
          </>
        )}

        {view === "cancelled" && (
          <>
            <h2 className="mt-2 text-2xl font-black text-[#062a57]">
              Request cancelled
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Your account deletion request was cancelled. Your HTBF account
              remains active.
            </p>
            <div className="mt-5">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white"
              >
                Close
              </button>
            </div>
          </>
        )}

        {view === "error" && (
          <>
            <h2 className="mt-2 text-2xl font-black text-[#062a57]">
              Could not submit request
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => setView("confirm")}
                className="flex-1 rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white"
              >
                Try Again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
