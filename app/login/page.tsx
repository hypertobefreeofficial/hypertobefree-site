"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { ArrowLeft, LogIn, UserPlus, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [location, setLocation] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    async function checkExistingSession() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await ensureProfileExists(user);
        window.location.href = "/feed";
        return;
      }

      setCheckingSession(false);
    }

    checkExistingSession();
  }, []);

  function cleanUsername(value: string) {
    return value
      .toLowerCase()
      .replace("@", "")
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9._]/g, "");
  }

  async function ensureProfileExists(user: User) {
    const metadata = user.user_metadata || {};

    const savedDisplayName =
      metadata.display_name || metadata.displayName || displayName || null;

    const savedUsername =
      metadata.username || cleanUsername(username) || null;

    const savedLocation = metadata.location || location || null;

    const now = new Date().toISOString();

    await supabase.from("profiles").upsert({
      id: user.id,
      email: user.email ?? null,
      display_name: savedDisplayName,
      username: savedUsername,
      location: savedLocation,
      age_confirmed: metadata.age_confirmed ?? ageConfirmed ?? false,
      terms_accepted_at: metadata.terms_accepted_at ?? now,
      privacy_accepted_at: metadata.privacy_accepted_at ?? now,
      guidelines_accepted_at: metadata.guidelines_accepted_at ?? now,
      profile_status: "active",
      role: "user",
      updated_at: now,
    });
  }

  async function usernameAlreadyExists(cleanedUsername: string) {
    if (!cleanedUsername) return false;

    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", cleanedUsername)
      .maybeSingle();

    return Boolean(data);
  }

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
      const cleanedUsername = cleanUsername(username);

      if (!displayName.trim()) {
        setMessage("Please enter a display name.");
        setLoading(false);
        return;
      }

      if (!cleanedUsername) {
        setMessage("Please choose a username.");
        setLoading(false);
        return;
      }

      if (!ageConfirmed) {
        setMessage("Please confirm you are at least 13 years old.");
        setLoading(false);
        return;
      }

      if (!termsAccepted) {
        setMessage(
          "Please agree to the Terms of Use, Privacy Policy, and Community Guidelines."
        );
        setLoading(false);
        return;
      }

      const usernameTaken = await usernameAlreadyExists(cleanedUsername);

      if (usernameTaken) {
        setMessage("That username is already taken. Please choose another one.");
        setLoading(false);
        return;
      }

      const now = new Date().toISOString();

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName.trim(),
            username: cleanedUsername,
            location: location.trim() || null,
            age_confirmed: true,
            terms_accepted_at: now,
            privacy_accepted_at: now,
            guidelines_accepted_at: now,
          },
    emailRedirectTo: `https://hypertobefree-site.vercel.app/profile-setup`,
        },
      });

      if (error) {
        setMessage(error.message);
      } else {
        setMessage(
          "Account created. Check your email to confirm your account, then you can start posting."
        );
      }

      setLoading(false);
      return;
    }

    if (mode === "login") {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      if (data.user) {
        await ensureProfileExists(data.user);
      }

      window.location.href = "/feed";
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
            Create your account once, confirm your email, and your profile info
            can be saved so future testimony posts are quicker to submit.
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

            {mode === "signup" && (
              <>
                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    Display name
                  </label>
                  <input
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-[#0b63ce] focus:bg-white"
                    placeholder="Example: Ashley"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    Username
                  </label>
                  <input
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-[#0b63ce] focus:bg-white"
                    placeholder="Example: faithwalker"
                    value={username}
                    onChange={(event) =>
                      setUsername(cleanUsername(event.target.value))
                    }
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Your public handle will show as @{cleanUsername(username) || "username"}.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    Location, optional
                  </label>
                  <input
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-[#0b63ce] focus:bg-white"
                    placeholder="City, State or Country"
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                  />
                </div>

                <label className="flex gap-3 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={ageConfirmed}
                    onChange={(event) => setAgeConfirmed(event.target.checked)}
                  />
                  <span>I confirm I am at least 13 years old.</span>
                </label>

                <label className="flex gap-3 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={termsAccepted}
                    onChange={(event) => setTermsAccepted(event.target.checked)}
                  />
                  <span>
                    By creating an account, I agree to Hyper to Be Free&apos;s{" "}
                    <Link href="/terms" className="font-bold text-[#0b63ce]">
                      Terms of Use
                    </Link>
                    ,{" "}
                    <Link href="/privacy" className="font-bold text-[#0b63ce]">
                      Privacy Policy
                    </Link>
                    , and{" "}
                    <Link
                      href="/community-guidelines"
                      className="font-bold text-[#0b63ce]"
                    >
                      Community Guidelines
                    </Link>
                    .
                  </span>
                </label>

                <div className="rounded-2xl bg-blue-50 p-4 text-sm leading-6 text-[#082f63]">
                  <div className="mb-1 flex items-center gap-2 font-black">
                    <ShieldCheck className="h-4 w-4" />
                    Reviewed before posting
                  </div>
                  Testimony posts, stories, and videos may be reviewed before
                  appearing publicly.
                </div>
              </>
            )}

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
