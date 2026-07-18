"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import styles from "../FreedomFeed.module.css";

type CommunityFeedPostOverflowPortalProps = {
  open: boolean;
  title: string;
  menuId: string;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: ReactNode;
};

function readCssLengthPx(variableName: string) {
  if (typeof window === "undefined") return 0;

  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.height = `var(${variableName})`;
  document.documentElement.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();

  return height;
}

export default function CommunityFeedPostOverflowPortal({
  open,
  title,
  menuId,
  triggerRef,
  onClose,
  children,
}: CommunityFeedPostOverflowPortalProps) {
  const [mounted, setMounted] = useState(false);
  const [isMobileSheet, setIsMobileSheet] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const menuRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef(false);
  const sheetTitleId = useId();

  const closeMenu = useCallback(() => {
    restoreFocusRef.current = true;
    onClose();
  }, [onClose]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsMobileSheet(media.matches);
    sync();
    media.addEventListener("change", sync);

    return () => media.removeEventListener("change", sync);
  }, []);

  const updateMenuPosition = useCallback(() => {
    if (!open || !triggerRef.current || isMobileSheet) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const menuHeightEstimate = 160;
    const viewportPadding = 12;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openBelow = spaceBelow >= menuHeightEstimate + viewportPadding;

    if (openBelow) {
      setMenuStyle({
        top: `${rect.bottom + 8}px`,
        left: `${Math.min(
          Math.max(viewportPadding, rect.right - 184),
          window.innerWidth - 184 - viewportPadding
        )}px`,
      });
      return;
    }

    setMenuStyle({
      top: `${Math.max(viewportPadding, rect.top - menuHeightEstimate - 8)}px`,
      left: `${Math.min(
        Math.max(viewportPadding, rect.right - 184),
        window.innerWidth - 184 - viewportPadding
      )}px`,
    });
  }, [isMobileSheet, open, triggerRef]);

  useLayoutEffect(() => {
    updateMenuPosition();
  }, [open, isMobileSheet, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;

    updateMenuPosition();

    const previousOverflow = document.body.style.overflow;
    if (isMobileSheet) {
      document.body.style.overflow = "hidden";
    }

    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    requestAnimationFrame(() => {
      firstItem?.focus();
    });

    function handlePointerDown(event: Event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      closeMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
    }

    const pointerTimer = window.setTimeout(() => {
      document.addEventListener("mousedown", handlePointerDown);
      document.addEventListener("touchstart", handlePointerDown);
    }, 0);

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(pointerTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenu, isMobileSheet, open, triggerRef, updateMenuPosition]);

  useEffect(() => {
    if (open || !restoreFocusRef.current) return;

    restoreFocusRef.current = false;
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, [open, triggerRef]);

  if (!mounted || !open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <>
      {isMobileSheet ? (
        <>
          <button
            type="button"
            className={styles.postOverflowBackdrop}
            aria-label="Close post options"
            onClick={closeMenu}
          />
          <div
            ref={menuRef}
            id={menuId}
            className={styles.postOverflowSheet}
            role="menu"
            aria-labelledby={sheetTitleId}
            style={{
              paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
            }}
          >
            <div className={styles.postOverflowSheetHandle} aria-hidden />
            <div className={styles.postOverflowSheetHeader}>
              <div id={sheetTitleId} className={styles.postOverflowSheetTitle}>
                {title}
              </div>
              <button
                type="button"
                className={styles.postOverflowSheetClose}
                aria-label="Close post options"
                onClick={closeMenu}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className={styles.postOverflowSheetBody}>{children}</div>
          </div>
        </>
      ) : (
        <div
          ref={menuRef}
          id={menuId}
          className={styles.postOverflowMenuPortal}
          role="menu"
          aria-label={title}
          style={menuStyle}
        >
          {children}
        </div>
      )}
    </>,
    document.body
  );
}
