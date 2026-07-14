"use client";

import { useEffect, useRef } from "react";
import styles from "./PrayerConnect.module.css";

type PrayerConfirmDialogProps = {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function PrayerConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  loading = false,
  errorMessage = null,
  onCancel,
  onConfirm,
}: PrayerConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => cancelRef.current?.focus(), 0);
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) {
        event.preventDefault();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className={styles.modalOverlay}
      onClick={loading ? undefined : onCancel}
    >
      <div
        className={styles.modalCard}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="prayer-confirm-title"
        aria-describedby={body ? "prayer-confirm-body" : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="prayer-confirm-title">{title}</h2>
        {body ? (
          <p id="prayer-confirm-body" className={styles.detailMeta}>
            {body}
          </p>
        ) : null}
        {errorMessage ? (
          <p className={styles.modalError} role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className={styles.emptyActions}>
          <button
            ref={cancelRef}
            type="button"
            className={styles.secondaryButton}
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? styles.dangerButton : styles.primaryButton}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className={styles.buttonSpinner} aria-hidden />
                Working…
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
