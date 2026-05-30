"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import FreedomFeed from "../../components/FreedomFeed";
import LoggedInBottomNav from "../../components/LoggedInBottomNav";

export default function FeedPage() {
  const [checkingUser, setCheckingUser] = useState(true);

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setCheckingUser(false);
    }

    checkUser();
  }, []);

  if (checkingUser) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-8 shadow-sm ring-1 ring-slate-200">
          Loading Feed...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] pb-28 text-slate-900">
      <div className="mx-auto max-w-3xl px-4 pt-6">
        <FreedomFeed />
      </div>

      <LoggedInBottomNav />
    </main>
  );
}
