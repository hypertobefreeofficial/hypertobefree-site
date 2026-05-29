"use client";

import Link from "next/link";
import {
  Home,
  Video,
  PlusSquare,
  HeartHandshake,
  UserCircle,
} from "lucide-react";
import { usePathname } from "next/navigation";

const navItems = [
  {
    label: "Home",
    href: "/feed",
    icon: Home,
  },
  {
    label: "Videos",
    href: "/videos",
    icon: Video,
  },
  {
    label: "Post",
    href: "/share-your-story",
    icon: PlusSquare,
  },
  {
    label: "Prayer",
    href: "/prayer",
    icon: HeartHandshake,
  },
  {
    label: "Profile",
    href: "/account",
    icon: UserCircle,
  },
];

const appRoutes = [
  "/feed",
  "/videos",
  "/share-your-story",
  "/prayer",
  "/account",
];

export default function LoggedInBottomNav() {
  const pathname = usePathname();

  const shouldShow = appRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  if (!shouldShow) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[9999] border-t border-slate-200 bg-white shadow-[0_-6px_20px_rgba(15,23,42,0.10)]">
      <div className="mx-auto grid max-w-3xl grid-cols-5 px-1 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-2">
        {navItems.map((item) => {
          const Icon = item.icon;

          const active =
            pathname === item.href ||
            (item.href !== "/feed" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5"
            >
              <div
                className={`flex h-9 w-12 items-center justify-center rounded-2xl transition ${
                  active ? "bg-blue-50" : "bg-transparent"
                }`}
              >
                <Icon
                  className={`h-6 w-6 stroke-[2.4] ${
                    active ? "text-[#0b63ce]" : "text-slate-600"
                  }`}
                />
              </div>

              <span
                className={`text-[11px] font-black leading-none ${
                  active ? "text-[#0b63ce]" : "text-slate-600"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
