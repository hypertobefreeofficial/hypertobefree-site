"use client";

import { formatMobileNavBadge } from "../lib/navigation/mobileNavBadgeCounts";

type MobileNavUnreadBadgeProps = {
  count: number;
  visible: boolean;
  variant?: "default" | "video";
  testId?: string;
};

export default function MobileNavUnreadBadge({
  count,
  visible,
  variant = "default",
  testId,
}: MobileNavUnreadBadgeProps) {
  if (!visible || count <= 0) return null;

  const ringClass =
    variant === "video" ? "ring-black/40" : "ring-white";

  return (
    <span
      data-testid={testId ?? "mobile-nav-unread-badge"}
      data-badge-count={formatMobileNavBadge(count)}
      className={`absolute -right-3 -top-2 min-w-[1.15rem] rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-black leading-none text-white ring-2 ${ringClass}`}
      aria-hidden
    >
      {formatMobileNavBadge(count)}
    </span>
  );
}
