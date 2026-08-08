"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isLoggedInNavItemActive,
  loggedInNavItems,
} from "../lib/navigation/loggedInNavItems";
import { getMobileNavBadgeCountForHref } from "../lib/navigation/mobileNavBadgeCounts";
import { buildMobileNavItemAriaLabel } from "../lib/navigation/mobileNavBadgeAccessibility";
import { useMobileNavBadgeContext } from "./MobileNavBadgeProvider";
import MobileNavUnreadBadge from "./MobileNavUnreadBadge";

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
  const { prayerCount, inboxCount, isLoading } = useMobileNavBadgeContext();
  const badgesVisible = !isLoading;
  const badgeCounts = { prayerCount, inboxCount };

  void onToggleHaptics;

  if (pathname?.startsWith("/video-feed") || pathname?.startsWith("/videos")) {
    return null;
  }

  if (variant === "video") {
    return (
      <nav
        aria-label="Primary"
        className="logged-in-bottom-nav fixed inset-x-0 bottom-0 z-40 bg-transparent px-3 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2 lg:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-6 gap-1">
          {loggedInNavItems.map((item) => {
            const Icon = item.icon;
            const badgeCount = getMobileNavBadgeCountForHref(item.href, badgeCounts);
            const linkLabel = buildMobileNavItemAriaLabel(
              item.href,
              item.label,
              badgeCount,
              badgesVisible
            );

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onNavTap?.()}
                aria-label={linkLabel}
                className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-transparent px-2 py-2 text-[10px] font-black text-white/70 ring-1 ring-transparent transition hover:bg-white/[0.08] hover:text-white hover:ring-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  <MobileNavUnreadBadge
                    count={badgeCount}
                    visible={badgesVisible}
                    variant="video"
                  />
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
    <nav
      aria-label="Primary"
      className="logged-in-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-6 gap-1">
        {loggedInNavItems.map((item) => {
          const Icon = item.icon;
          const active = isLoggedInNavItemActive(pathname, item.href);
          const badgeCount = getMobileNavBadgeCountForHref(item.href, badgeCounts);
          const linkLabel = buildMobileNavItemAriaLabel(
            item.href,
            item.label,
            badgeCount,
            badgesVisible
          );

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onNavTap?.()}
              aria-current={active ? "page" : undefined}
              aria-label={linkLabel}
              className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b63ce] ${
                active
                  ? "bg-[#0b63ce]/10 text-[#0b63ce]"
                  : "text-slate-500 hover:bg-slate-50 hover:text-[#0b63ce]"
              }`}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                <MobileNavUnreadBadge
                  count={badgeCount}
                  visible={badgesVisible}
                />
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
