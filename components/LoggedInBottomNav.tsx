"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

type LoggedInBottomNavProps = {
  variant?: "default" | "video";
  hapticsEnabled?: boolean;
  onToggleHaptics?: () => void;
  onNavTap?: () => void;
};

export default function LoggedInBottomNav({
  variant = "default",
  onToggleHaptics,
  onNavTap,
}: LoggedInBottomNavProps) {
  const pathname = usePathname();

  void onToggleHaptics;

  if (pathname?.startsWith("/video-feed")) return null;

  if (variant === "video") {
    return (
      <nav className="fixed inset-x-0 bottom-0 z-50 bg-transparent px-3 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2 lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-6 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onNavTap?.()}
                className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-transparent px-2 py-2 text-[10px] font-black text-white/70 ring-1 ring-transparent transition hover:bg-white/[0.08] hover:text-white hover:ring-white/10"
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-6 gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname?.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onNavTap?.()}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-black transition ${
                active
                  ? "bg-[#0b63ce]/10 text-[#0b63ce]"
                  : "text-slate-500 hover:bg-slate-50 hover:text-[#0b63ce]"
              }`}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
