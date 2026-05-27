"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, LogIn, UserPlus } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    async function checkExistingSession() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        window.location.href = "/dashboard";
        return;
      }

      setCheckingSession(false);
    }

    checkExistingSession();
  }, []);

  async function handleSubmit() {
    setLoading(true);
    setMessage("");

    if (!email || !password) {
      setMessage("Please enter your email and password.");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
      } else {
        setMessage(
          "Account created. Check your email to confirm your account, then sign in."
        );
      }
    }

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
      } else {
        window.location.href = "/dashboard";
      }
    }

    setLoading(false);
  }

  if (checkingSession) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-xl rounded-[2rem] bg-white p-8 shadow-sm">
          Checking your sign-in status...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] text-slate-900">
      <section className="mx-auto max-w-xl px-6 py-12">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[#0b63ce] hover:text-[#084f9f]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-[#0b63ce]">
            {mode === "login" ? (
              <LogIn className="h-4 w-4" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {mode === "login" ? "Sign In" : "Create Account"}
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57]">
            {mode === "login"
              ? "Welcome back."
              : "Create your Hyper to Be Free account."}
          </h1>

          <p className="mt-4 leading-7 text-slate-600">
            Once your account is created, your browser can keep you signed in so
            you can start posting without logging in every time.
          </p>

          <div className="mt-8 grid gap-5">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Email
              </label>
              <input
                type="email"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-[#0b63ce] focus:bg-white"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Password
              </label>
              <input
                type="password"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-[#0b63ce] focus:bg-white"
                placeholder="At least 6 characters"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            {message && (
              <div className="rounded-2xl bg-blue-50 p-4 text-sm font-semibold leading-6 text-[#082f63]">
                {message}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-full bg-[#0b63ce] px-6 py-4 text-base font-bold text-white shadow-sm hover:bg-[#084f9f] disabled:opacity-60"
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                ? "Sign In"
                : "Create Account"}
            </button>

            <button
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setMessage("");
              }}
              className="text-sm font-bold text-[#0b63ce] hover:text-[#084f9f]"
            >
              {mode === "login"
                ? "Need an account? Create one"
                : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
