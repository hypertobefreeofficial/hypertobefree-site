"use client";

import { useEffect, useRef } from "react";

type UseDialogFocusTrapOptions = {
  open: boolean;
  onClose: () => void;
  restoreFocus?: boolean;
};

export function useDialogFocusTrap({
  open,
  onClose,
  restoreFocus = true,
}: UseDialogFocusTrapOptions) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    triggerRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    if (!panel) return;

    const focusables = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusables[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (restoreFocus) {
        triggerRef.current?.focus();
      }
    };
  }, [open, onClose, restoreFocus]);

  return panelRef;
}
