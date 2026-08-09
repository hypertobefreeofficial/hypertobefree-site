"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell, HandHeart, Sparkles } from "lucide-react";
import { useMobileNavBadgeContext } from "./MobileNavBadgeProvider";
import {
  computeTotalNavUnreadCount,
  formatMobileNavBadge,
} from "../lib/navigation/mobileNavBadgeCounts";
import { buildDesktopNotificationBellAriaLabel } from "../lib/navigation/mobileNavBadgeAccessibility";

type DesktopNotificationBellProps = {
  onNavTap?: () => void;
};

export default function DesktopNotificationBell({
  onNavTap,
}: DesktopNotificationBellProps) {
  const popoverId = useId();
  const { prayerCount, inboxCount, isLoading } = useMobileNavBadgeContext();
  const badgesVisible = !isLoading;
  const counts = { prayerCount, inboxCount };
  const totalUnread = computeTotalNavUnreadCount(counts);

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null
  );
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const ignoreNextOutsideCloseRef = useRef(false);

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const positionPopover = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const popoverWidth = 288;
    const left = Math.max(
      8,
      Math.min(rect.right - popoverWidth, window.innerWidth - popoverWidth - 8)
    );

    setCoords({ top: rect.bottom + 8, left });
  };

  useLayoutEffect(() => {
    if (open) positionPopover();
  }, [open]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (ignoreNextOutsideCloseRef.current) {
        ignoreNextOutsideCloseRef.current = false;
        return;
      }

      const target = event.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      close();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        triggerRef.current?.focus();
      }
    }

    function onDismiss() {
      close();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onDismiss, true);
    window.addEventListener("resize", onDismiss);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("resize", onDismiss);
    };
  }, [open]);

  const ariaLabel = buildDesktopNotificationBellAriaLabel(counts, badgesVisible);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="desktop-notification-bell"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={popoverId}
        aria-haspopup="dialog"
        onClick={() => {
          if (open) {
            close();
            return;
          }
          ignoreNextOutsideCloseRef.current = true;
          const trigger = triggerRef.current;
          if (trigger) {
            const rect = trigger.getBoundingClientRect();
            const popoverWidth = 288;
            const left = Math.max(
              8,
              Math.min(
                rect.right - popoverWidth,
                window.innerWidth - popoverWidth - 8
              )
            );
            setCoords({ top: rect.bottom + 8, left });
          }
          setOpen(true);
        }}
        className="relative inline-flex shrink-0 items-center justify-center overflow-visible rounded-full p-2 text-slate-600 transition hover:bg-slate-50 hover:text-[#0b63ce] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b63ce] aria-expanded:bg-[#0b63ce]/10 aria-expanded:text-[#0b63ce]"
      >
        <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center overflow-visible">
          <Bell className="h-4 w-4 shrink-0" aria-hidden />
          {badgesVisible && totalUnread > 0 ? (
            <span
              data-testid="desktop-notification-bell-badge"
              data-badge-count={formatMobileNavBadge(totalUnread)}
              className="absolute -right-2.5 top-0 min-w-[1.15rem] translate-y-px rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-black leading-none text-white ring-2 ring-white"
              aria-hidden
            >
              {formatMobileNavBadge(totalUnread)}
            </span>
          ) : null}
        </span>
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={popoverRef}
            id={popoverId}
            role="dialog"
            aria-label="Notifications"
            data-testid="desktop-notification-popover"
            className="fixed z-[80] w-72 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xl shadow-slate-900/10"
            style={
              coords
                ? { top: coords.top, left: coords.left }
                : undefined
            }
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-slate-900">
                  Notifications
                </h2>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {badgesVisible
                    ? totalUnread > 0
                      ? `${formatMobileNavBadge(totalUnread)} unread`
                      : "You're all caught up"
                    : "Loading…"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Link
                href="/prayer"
                onClick={() => {
                  onNavTap?.();
                  close();
                }}
                className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b63ce]"
              >
                <span className="inline-flex items-center gap-2">
                  <HandHeart className="h-4 w-4 text-[#0b63ce]" aria-hidden />
                  Prayer
                </span>
                <span className="tabular-nums text-slate-500">
                  {badgesVisible ? formatMobileNavBadge(prayerCount) : "—"}
                </span>
              </Link>

              <Link
                href="/journey"
                onClick={() => {
                  onNavTap?.();
                  close();
                }}
                className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b63ce]"
              >
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#0b63ce]" aria-hidden />
                  Journey
                </span>
                <span className="tabular-nums text-slate-500">
                  {badgesVisible ? formatMobileNavBadge(inboxCount) : "—"}
                </span>
              </Link>
            </div>

            <div className="mt-3 border-t border-slate-100 pt-3">
              <Link
                href="/notifications"
                onClick={() => {
                  onNavTap?.();
                  close();
                }}
                data-testid="desktop-notification-view-all"
                className="inline-flex w-full items-center justify-center rounded-xl bg-[#0b63ce]/10 px-3 py-2.5 text-sm font-black text-[#0b63ce] transition hover:bg-[#0b63ce]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b63ce]"
              >
                View all notifications
              </Link>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
