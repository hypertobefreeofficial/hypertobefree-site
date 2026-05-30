"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LogOut, UserCircle } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import FreedomFeed from "../../components/FreedomFeed";
import LoggedInBottomNav from "../../components/LoggedInBottomNav";

export default function FeedPage() {
  const [checkingUser, setCheckingUser] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setEmail(user.email ?? null);
      setCheckingUser(false);
    }

    checkUser();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (checkingUser) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-8 shadow-sm">
          Loading Freedom Feed...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
      <div className="inline-flex items-center gap-2 text-sm font-black text-[#082f63]">
  HTBF
</div>

          <div className="flex items-center gap-3">
            <Link
              href="/account"
              className="hidden items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200 sm:inline-flex"
            >
              <UserCircle className="h-4 w-4" />
              Account
            </Link>

            <button
              onClick={signOut}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <span className="hidden sm:inline">Sign Out</span>
              <LogOut className="h-4 w-4 sm:hidden" />
            </button>
          </div>
        </div>

        {email && (
          <div className="mx-auto max-w-7xl px-4 pb-3 text-xs font-semibold text-slate-500 sm:px-6">
            Signed in as {email}
          </div>
        )}
      </header>

    <div className="pb-24">
  <FreedomFeed />
</div>

<LoggedInBottomNav />
    </main>
  );
}
