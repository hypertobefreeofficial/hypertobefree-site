"use client";

import Link from "next/link";
import {
  HandHeart,
  Home,
  Search,
  Sparkles,
  UserRound,
  Video,
} from "lucide-react";

const navItems = [
  { href: "/feed", label: "Feed", icon: Home },
  { href: "/video-feed", label: "Videos", icon: Video },
  { href: "/prayer", label: "Prayer", icon: HandHeart },
  { href: "/journey", label: "Journey", icon: Sparkles },
  { href: "/search", label: "Search", icon: Search },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export default function LoggedInBottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="mx-auto grid max-w-lg grid-cols-6 gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-black text-slate-500 transition hover:bg-slate-50 hover:text-[#0b63ce]"
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
