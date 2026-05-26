"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, LogOut, Send, UserCircle } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

export default function DashboardPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setEmail(user.email ?? null);
      setLoading(false);
    }

    loadUser();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-4xl rounded-[2rem] bg-white p-8 shadow-sm">
          Loading your dashboard...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] text-slate-900">
      <section className="mx-auto max-w-5xl px-6 py-12">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[#0b63ce] hover:text-[#084f9f]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm md:p-12">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-[#0b63ce]">
            <UserCircle className="h-4 w-4" />
            My Account
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57] md:text-5xl">
            Welcome to your Hyper to Be Free dashboard.
          </h1>

          <p className="mt-4 leading-7 text-slate-600">
            Signed in as{" "}
            <span className="font-bold text-[#0b63ce]">{email}</span>
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <h2 className="text-2xl font-black text-[#062a57]">
                Share a story
              </h2>
              <p className="mt-3 leading-7 text-slate-600">
                Submit a testimony, praise report, prayer encouragement, or
                video story for review.
              </p>

              <Link
                href="/share-your-story"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#0b63ce] px-6 py-3.5 text-base font-bold text-white shadow-sm hover:bg-[#084f9f]"
              >
                Share Your Story <Send className="h-4 w-4" />
              </Link>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <h2 className="text-2xl font-black text-[#062a57]">
                My submissions
              </h2>
              <p className="mt-3 leading-7 text-slate-600">
                Soon, this area will show your submitted stories, videos, and
                review status.
              </p>

              <div className="mt-6 rounded-2xl bg-white p-4 text-sm font-semibold text-slate-500">
                No submissions connected yet.
              </div>
            </div>
          </div>

          <button
            onClick={signOut}
            className="mt-10 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3.5 text-base font-bold text-[#082f63] shadow-sm hover:bg-slate-50"
          >
            Sign Out <LogOut className="h-4 w-4" />
          </button>
        </div>
      </section>
    </main>
  );
}
