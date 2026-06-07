"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowLeft, Lock, Save, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (password.length < 8) {
      setMessage("Please use at least 8 characters for your new password.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setSaving(false);

    if (error) {
      setMessage(`Could not update password: ${error.message}`);
      return;
    }

    setPassword("");
    setConfirmPassword("");
    setMessage("Your password was updated. You can now sign in with your new password.");
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] px-4 py-10 text-slate-900">
      <section className="mx-auto max-w-xl">
        <Link
          href="/login"
          className="mb-8 inline-flex items-center gap-2 text-sm font-black text-[#0b63ce]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Sign In
        </Link>

        <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-[#0b63ce]">
            <ShieldCheck className="h-4 w-4" />
            Password Reset
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57]">
            Create a new password.
          </h1>

          <p className="mt-3 leading-7 text-slate-600">
            Enter your new HTBF password below.
          </p>

          <form onSubmit={updatePassword} className="mt-6 space-y-4">
            <label className="block">
              <div className="mb-2 text-sm font-black text-[#062a57]">
                New password
              </div>

              <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-blue-200 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-50">
                <Lock className="h-4 w-4 text-slate-400" />

                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full bg-transparent px-3 py-3 outline-none"
                />
              </div>
            </label>

            <label className="block">
              <div className="mb-2 text-sm font-black text-[#062a57]">
                Confirm new password
              </div>

              <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-blue-200 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-50">
                <Lock className="h-4 w-4 text-slate-400" />

                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full bg-transparent px-3 py-3 outline-none"
                />
              </div>
            </label>

            {message && (
              <div
                className={`rounded-2xl p-4 text-sm font-bold leading-6 ring-1 ${
                  message.includes("updated")
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                    : "bg-red-50 text-red-700 ring-red-100"
                }`}
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-6 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:opacity-60"
            >
              {saving ? "Saving..." : "Update Password"}
              <Save className="h-4 w-4" />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
