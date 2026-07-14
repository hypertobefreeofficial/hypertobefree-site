"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./PrayerConnect.module.css";

type PrayerMobileSheetProps = {
  open: boolean;
  onClose: () => void;
  side?: "bottom" | "left";
  ariaLabel?: string;
  labelledBy?: string;
  className?: string;
  /**
   * Render into <body>. Use when the sheet may be mounted inside an element
   * with a transform/filter (e.g. a card), which would otherwise trap the
   * fixed-position overlay. Content should not rely on page-scoped CSS vars.
   */
  portal?: boolean;
  children: ReactNode;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export default function PrayerMobileSheet({
  open,
  onClose,
  side = "bottom",
  ariaLabel,
  labelledBy,
  className = "",
  portal = false,
  children,
}: PrayerMobileSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFirst = () => {
      const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE);
      (focusable && focusable[0] ? focusable[0] : panel)?.focus();
    };
    const timer = window.setTimeout(focusFirst, 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const panelClass =
    side === "left" ? styles.mobileSidePanel : styles.mobileBottomPanel;
  const overlayClass =
    side === "left" ? styles.mobileSideOverlay : styles.mobileSheetOverlay;

  const content = (
    <div className={overlayClass} onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`${panelClass} ${className}`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );

  // When requested, portal to <body> so the fixed-position overlay is never
  // trapped by an ancestor with a transform/filter (e.g. a card's hover/focus
  // transform). Portaled content must use concrete colors, not page-scoped vars.
  return portal ? createPortal(content, document.body) : content;
}
