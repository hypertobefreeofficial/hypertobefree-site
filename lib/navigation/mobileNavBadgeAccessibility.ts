import {
  formatMobileNavBadge,
  type MobileNavBadgeCounts,
  computeTotalNavUnreadCount,
} from "./mobileNavBadgeCounts";

export function buildDesktopNotificationBellAriaLabel(
  counts: MobileNavBadgeCounts,
  badgesVisible: boolean
): string {
  if (!badgesVisible) {
    return "Notifications";
  }

  const total = computeTotalNavUnreadCount(counts);

  if (total <= 0) {
    return "Notifications";
  }

  return `Notifications, ${formatMobileNavBadge(total)} unread`;
}

export function buildMobileNavItemAriaLabel(
  href: string,
  label: string,
  badgeCount: number,
  badgesVisible: boolean
): string {
  if (!badgesVisible || badgeCount <= 0) {
    return label;
  }

  const formatted = formatMobileNavBadge(badgeCount);

  if (href === "/prayer") {
    return `Prayer, ${formatted} unread`;
  }

  if (href === "/journey") {
    const noun =
      badgeCount === 1 ? "unread conversation" : "unread conversations";
    return `Journey, ${formatted} ${noun}`;
  }

  return label;
}
