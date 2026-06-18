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

type LoggedInBottomNavProps = {
  variant?: "default" | "video";
  hapticsEnabled?: boolean;
  onToggleHaptics?: () => void;
  onNavTap?: () => void;
};

const hiddenNavPaths = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/forgot-username",
  "/reset-password",
  "/privacy",
  "/terms",
  "/content-rules",
  "/copyright",
];

export default function LoggedInBottomNav({
  variant = "default",
  hapticsEnabled = false,
  onToggleHaptics,
  onNavTap,
}: LoggedInBottomNavProps) {
  const pathname = usePathname();

  const shouldHideNav =
    hiddenNavPaths.includes(pathname) ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api");

  if (shouldHideNav) return null;

  const isVideo = variant === "video";

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-50 border-t backdrop-blur-xl ${
        isVideo
          ? "border-white/10 bg-black/20"
          : "border-slate-200 bg-white/95"
      }`}
    >
      {isVideo && (
        <div className="mx-auto flex max-w-3xl justify-end px-3 pt-2">
          <button
            type="button"
            onClick={onToggleHaptics}
            className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black text-white ring-1 ring-white/20"
          >
            Haptics {hapticsEnabled ? "On" : "Off"}
          </button>
        </div>
      )}

      <div className="mx-auto grid max-w-3xl grid-cols-6 px-2 py-2">
        <NavItem href="/feed" label="Home" active={pathname === "/feed"} icon={<Home />} onNavTap={onNavTap} isVideo={isVideo} />
        <NavItem href="/video-feed" label="Videos" active={pathname === "/video-feed"} icon={<Video />} onNavTap={onNavTap} isVideo={isVideo} />
        <NavItem href="/prayer" label="Prayer" active={pathname === "/prayer"} icon={<HeartHandshake />} onNavTap={onNavTap} isVideo={isVideo} />
        <NavItem href="/journey" label="Journey" active={pathname === "/journey"} icon={<Sparkles />} onNavTap={onNavTap} isVideo={isVideo} />
        <NavItem href="/search" label="Search" active={pathname === "/search"} icon={<Search />} onNavTap={onNavTap} isVideo={isVideo} />
        <NavItem href="/profile" label="Profile" active={pathname === "/profile"} icon={<UserCircle />} onNavTap={onNavTap} isVideo={isVideo} />
      </div>
    </nav>
  );
}

function NavItem({
  href,
  label,
  icon,
  active = false,
  onNavTap,
  isVideo,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  onNavTap?: () => void;
  isVideo?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onNavTap}
      className={`flex flex-col items-center justify-center rounded-2xl px-1 py-2 text-[11px] font-black ${
        isVideo
          ? active
            ? "text-white"
            : "text-white/60 hover:bg-white/10 hover:text-white"
          : active
            ? "text-[#0b63ce]"
            : "text-slate-500 hover:bg-slate-50"
      }`}
    >
      <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <span className="mt-1">{label}</span>
    </Link>
  );
}
