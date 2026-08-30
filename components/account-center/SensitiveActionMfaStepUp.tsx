"use client";

type SensitiveActionMfaStepUpProps = {
  title?: string;
  description?: string;
  stepUpCode: string;
  onStepUpCodeChange: (value: string) => void;
  onVerify: () => void;
  verifying: boolean;
  verifyLabel?: string;
  onCancel?: () => void;
};

export default function SensitiveActionMfaStepUp({
  title = "Verify your authenticator app",
  description = "Enter the current 6-digit code from your authenticator app to continue.",
  stepUpCode,
  onStepUpCodeChange,
  onVerify,
  verifying,
  verifyLabel = "Verify and continue",
  onCancel,
}: SensitiveActionMfaStepUpProps) {
  return (
    <div className="rounded-[1.75rem] bg-white p-5 ring-1 ring-slate-200">
      <h3 className="text-base font-black text-[#062a57]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>

      <label className="mt-4 block">
        <div className="mb-2 text-sm font-black text-[#062a57]">
          Authenticator code
        </div>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={stepUpCode}
          onChange={(event) =>
            onStepUpCodeChange(
              event.target.value.replace(/\D/g, "").slice(0, 6)
            )
          }
          placeholder="000000"
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 tracking-[0.35em] outline-none focus:border-blue-200 focus:bg-white focus:ring-4 focus:ring-blue-50"
        />
      </label>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onVerify}
          disabled={verifying}
          className="inline-flex flex-1 items-center justify-center rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {verifying ? "Verifying..." : verifyLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={verifying}
            className="inline-flex flex-1 items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-[#0b63ce] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
