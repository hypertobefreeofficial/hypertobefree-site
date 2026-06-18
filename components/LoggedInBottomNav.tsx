"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  HandHeart,
  Home,
  PlusCircle,
  Search,
  Sparkles,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const navItems = [
  { href: "/feed", label: "Feed", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/share-your-story", label: "Share", icon: PlusCircle },
  { href: "/prayer", label: "Prayer", icon: HandHeart },
  { href: "/journey", label: "Journey", icon: Sparkles },
];

function formatUnreadBadge(count: number) {
  return count > 99 ? "99+" : String(count);
}

export default function LoggedInBottomNav() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadUnreadCount() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active || !user) {
        if (active) setUnreadCount(0);
        return;
      }

      const { count, error } = await supabase
        .from("inbox_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false)
        .is("hidden_at", null);

      if (!active) return;

      if (!error) {
        setUnreadCount(count ?? 0);
      }
    }

    void loadUnreadCount();

    const channel = supabase
      .channel("bottom-nav-inbox-unread")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inbox_messages",
        },
        () => {
          void loadUnreadCount();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const showJourneyBadge = item.href === "/journey" && unreadCount > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-black text-slate-500 transition hover:bg-slate-50 hover:text-[#0b63ce]"
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                {showJourneyBadge && (
                  <span className="absolute -right-3 -top-2 min-w-[1.15rem] rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-black leading-none text-white ring-2 ring-white">
                    {formatUnreadBadge(unreadCount)}
                  </span>
                )}
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
