"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowLeft, Mail, Send, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  async function sendResetEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setMessage("Please enter the email address connected to your HTBF account.");
      return;
    }

    setSending(true);

    const redirectTo = `${window.location.origin}/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo,
    });

    setSending(false);

    if (error) {
      setMessage(`Could not send password reset email: ${error.message}`);
      return;
    }

    setMessage(
      "If an HTBF account exists for that email, a password reset link has been sent."
    );
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
            Account Recovery
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57]">
            Reset your password.
          </h1>

          <p className="mt-3 leading-7 text-slate-600">
            Enter the email address you used for HTBF. We’ll send you a secure
            link to create a new password.
          </p>

          <form onSubmit={sendResetEmail} className="mt-6 space-y-4">
            <label className="block">
              <div className="mb-2 text-sm font-black text-[#062a57]">
                Email address
              </div>

              <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-blue-200 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-50">
                <Mail className="h-4 w-4 text-slate-400" />

                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-transparent px-3 py-3 outline-none"
                />
              </div>
            </label>

            {message && (
              <div className="rounded-2xl bg-blue-50 p-4 text-sm font-bold leading-6 text-[#082f63] ring-1 ring-blue-100">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={sending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-6 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:opacity-60"
            >
              {sending ? "Sending..." : "Send Reset Link"}
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
