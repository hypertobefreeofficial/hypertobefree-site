"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  HandHeart,
  Home,
  Search,
  Sparkles,
  UserRound,
  Video,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const navItems = [
  { href: "/feed", label: "Feed", icon: Home },
  { href: "/video-feed", label: "Videos", icon: Video },
  { href: "/prayer", label: "Prayer", icon: HandHeart },
  { href: "/journey", label: "Journey", icon: Sparkles },
  { href: "/search", label: "Search", icon: Search },
  { href: "/profile", label: "Profile", icon: UserRound },
];

type LoggedInBottomNavProps = {
  variant?: "default" | "video";
  hapticsEnabled?: boolean;
  onToggleHaptics?: () => void;
  onNavTap?: () => void;
};

function formatUnreadBadge(count: number) {
  return count > 99 ? "99+" : String(count);
}

export default function LoggedInBottomNav({
  variant = "default",
  hapticsEnabled = false,
  onToggleHaptics,
  onNavTap,
}: LoggedInBottomNavProps) {
  const [journeyUnreadCount, setJourneyUnreadCount] = useState(0);
  const isVideoVariant = variant === "video";

  useEffect(() => {
    let active = true;
    let unreadPoll: ReturnType<typeof window.setInterval> | null = null;

    async function loadJourneyUnreadCount() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active || !user) {
        if (active) setJourneyUnreadCount(0);
        return;
      }

      const { count, error } = await supabase
        .from("inbox_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false)
        .is("hidden_at", null);

      if (!active || error) return;

      setJourneyUnreadCount(count ?? 0);
    }

    void loadJourneyUnreadCount();

    unreadPoll = window.setInterval(() => {
      void loadJourneyUnreadCount();
    }, 30000);

    return () => {
      active = false;

      if (unreadPoll) {
        window.clearInterval(unreadPoll);
      }
    };
  }, []);

  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl ${
        isVideoVariant
          ? "border-t border-white/[0.08] bg-black/[0.04] shadow-none"
          : "border-t border-slate-200/80 bg-white/95 shadow-[0_-10px_30px_rgba(15,23,42,0.08)]"
      }`}
    >
      {isVideoVariant && onToggleHaptics && (
        <div className="mx-auto mb-1 flex max-w-lg justify-end">
          <button
            type="button"
            onClick={() => onToggleHaptics?.()}
            className={`rounded-full px-3 py-1.5 text-[11px] font-black ring-1 backdrop-blur-md transition ${
              hapticsEnabled
                ? "bg-white/80 text-[#0b63ce] ring-white/50"
                : "bg-black/10 text-white/75 ring-white/10 hover:bg-white/10 hover:text-white"
            }`}
            aria-pressed={hapticsEnabled}
            aria-label="Toggle haptics"
          >
            Haptics {hapticsEnabled ? "On" : "Off"}
          </button>
        </div>
      )}

      <div className="mx-auto grid max-w-lg grid-cols-6 gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const showJourneyBadge =
            item.href === "/journey" && journeyUnreadCount > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onNavTap?.()}
              className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-black transition ${
                isVideoVariant
                  ? "bg-transparent text-white/70 ring-1 ring-transparent hover:bg-white/[0.08] hover:text-white hover:ring-white/10"
                  : "text-slate-500 hover:bg-slate-50 hover:text-[#0b63ce]"
              }`}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                {showJourneyBadge && (
                  <span className="absolute -right-3 -top-2 min-w-[1.15rem] rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-black leading-none text-white ring-2 ring-white">
                    {formatUnreadBadge(journeyUnreadCount)}
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
