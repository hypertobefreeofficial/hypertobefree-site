"use client";

import Link from "next/link";
import { Home, Video, PlusSquare, HeartHandshake, UserCircle } from "lucide-react";
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

export default function LoggedInBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="mx-auto grid max-w-3xl grid-cols-5 px-2 pb-[env(safe-area-inset-bottom)] pt-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href !== "/feed" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs font-black transition ${
                active
                  ? "text-[#0b63ce]"
                  : "text-slate-500 hover:bg-blue-50 hover:text-[#0b63ce]"
              }`}
            >
              <Icon
                className={`h-6 w-6 ${
                  active ? "fill-[#0b63ce]/10" : ""
                }`}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
