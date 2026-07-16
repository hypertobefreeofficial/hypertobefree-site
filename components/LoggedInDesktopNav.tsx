"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isLoggedInNavItemActive,
  loggedInNavItems,
} from "../lib/navigation/loggedInNavItems";

type LoggedInDesktopNavProps = {
  onNavTap?: () => void;
};

export default function LoggedInDesktopNav({
  onNavTap,
}: LoggedInDesktopNavProps) {
  const pathname = usePathname();

  if (pathname?.startsWith("/video-feed")) return null;

  return (
    <nav
      aria-label="Primary"
      className="logged-in-desktop-nav sticky top-0 z-[60] hidden border-b border-slate-200/70 bg-white/95 backdrop-blur-xl supports-[padding:max(0px)]:pt-[env(safe-area-inset-top)] lg:block"
    >
      <div className="mx-auto flex h-[var(--app-desktop-nav-height)] max-w-[760px] items-center justify-between gap-4 px-4 md:px-5">
        <Link
          href="/feed"
          className="shrink-0 text-sm font-black text-[#082f63] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b63ce]"
        >
          HTBF
        </Link>

        <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 overflow-x-auto">
          {loggedInNavItems.map((item) => {
            const Icon = item.icon;
            const active = isLoggedInNavItemActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onNavTap?.()}
                aria-current={active ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b63ce] ${
                  active
                    ? "bg-[#0b63ce]/10 text-[#0b63ce]"
                    : "text-slate-600 hover:bg-slate-50 hover:text-[#0b63ce]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
