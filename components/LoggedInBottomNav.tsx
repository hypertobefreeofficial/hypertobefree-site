"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HeartHandshake,
  Home,
  Search,
  Sparkles,
  UserCircle,
  Video,
} from "lucide-react";

export default function LoggedInBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto grid max-w-3xl grid-cols-6 px-2 py-2">
        <NavItem
          href="/feed"
          label="Home"
          active={pathname === "/feed"}
          icon={<Home />}
        />

        <NavItem
          href="/videos"
          label="Videos"
          active={pathname === "/videos"}
          icon={<Video />}
        />

        <NavItem
          href="/prayer"
          label="Prayer"
          active={pathname === "/prayer"}
          icon={<HeartHandshake />}
        />

        <NavItem
          href="/journey"
          label="Journey"
          active={pathname === "/journey"}
          icon={<Sparkles />}
        />

        <NavItem
          href="/search"
          label="Search"
          active={pathname === "/search"}
          icon={<Search />}
        />

        <NavItem
          href="/account"
          label="Profile"
          active={pathname === "/account"}
          icon={<UserCircle />}
        />
      </div>
    </nav>
  );
}

function NavItem({
  href,
  label,
  icon,
  active = false,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center rounded-2xl px-1 py-2 text-[11px] font-black ${
        active ? "text-[#0b63ce]" : "text-slate-500 hover:bg-slate-50"
      }`}
    >
      <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <span className="mt-1">{label}</span>
    </Link>
  );
}
