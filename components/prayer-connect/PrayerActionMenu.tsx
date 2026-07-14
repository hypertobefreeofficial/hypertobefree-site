"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { useIsMobile } from "./useIsMobile";
import PrayerMobileSheet from "./PrayerMobileSheet";
import styles from "./PrayerConnect.module.css";

export type PrayerActionItem = {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

type PrayerActionMenuProps = {
  items: PrayerActionItem[];
  triggerLabel?: string;
  sheetTitle?: string;
  buttonClassName?: string;
  /** Desktop anchor edge. */
  align?: "left" | "right";
  size?: "sm" | "md";
};

export default function PrayerActionMenu({
  items,
  triggerLabel = "More options",
  sheetTitle = "Options",
  buttonClassName,
  align = "right",
  size = "md",
}: PrayerActionMenuProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null
  );
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const close = () => setOpen(false);

  const positionMenu = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 216;
    const left =
      align === "right"
        ? Math.max(8, rect.right - menuWidth)
        : Math.min(window.innerWidth - menuWidth - 8, rect.left);
    setCoords({ top: rect.bottom + 6, left });
  };

  // Position the desktop dropdown against the trigger before paint.
  useLayoutEffect(() => {
    if (open && !isMobile) positionMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isMobile]);

  // Desktop: close on outside click / scroll / resize / escape and return focus.
  useEffect(() => {
    if (!open || isMobile) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onDismiss() {
      setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onDismiss, true);
    window.addEventListener("resize", onDismiss);

    const first = menuRef.current?.querySelector<HTMLButtonElement>(
      "button:not([disabled])"
    );
    const timer = window.setTimeout(() => first?.focus(), 0);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("resize", onDismiss);
      window.clearTimeout(timer);
    };
  }, [open, isMobile]);

  function runItem(item: PrayerActionItem) {
    if (item.disabled) return;
    setOpen(false);
    // Let the menu unmount before the handler (which may open another dialog).
    requestAnimationFrame(() => item.onSelect());
  }

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      className={`${styles.actionMenuTrigger} ${
        size === "sm" ? styles.actionMenuTriggerSm : ""
      } ${buttonClassName ?? ""}`}
      aria-label={triggerLabel}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={(event) => {
        event.stopPropagation();
        setOpen((value) => !value);
      }}
    >
      <MoreHorizontal className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} aria-hidden />
    </button>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <PrayerMobileSheet
          open={open}
          onClose={close}
          side="bottom"
          ariaLabel={sheetTitle}
          portal
        >
          <div className={styles.mobileSheetHandle} aria-hidden />
          <h2 className={styles.mobileSheetTitle}>{sheetTitle}</h2>
          <div className={styles.actionMenuList} role="menu">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  className={`${styles.actionMenuItem} ${
                    item.danger ? styles.actionMenuItemDanger : ""
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    runItem(item);
                  }}
                >
                  {Icon ? <Icon className="h-5 w-5" /> : null}
                  {item.label}
                </button>
              );
            })}
          </div>
        </PrayerMobileSheet>
      </>
    );
  }

  return (
    <div className={styles.actionMenuWrap}>
      {trigger}
      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={sheetTitle}
              className={styles.actionMenuDropdown}
              style={{ top: coords.top, left: coords.left }}
              onClick={(event) => event.stopPropagation()}
            >
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    className={`${styles.actionMenuItem} ${
                      item.danger ? styles.actionMenuItemDanger : ""
                    }`}
                    onClick={(event) => {
                      event.stopPropagation();
                      runItem(item);
                    }}
                  >
                    {Icon ? <Icon className="h-4 w-4" /> : null}
                    {item.label}
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
