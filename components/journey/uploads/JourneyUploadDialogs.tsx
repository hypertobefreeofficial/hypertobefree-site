"use client";

import { useEffect, useId, useRef } from "react";
import styles from "./JourneyUploads.module.css";

type DialogProps = {
  title: string;
  body: string;
  primaryLabel: string;
  primaryDanger?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children?: React.ReactNode;
};

export function JourneyUploadDialog({
  title,
  body,
  primaryLabel,
  primaryDanger = false,
  loading = false,
  onCancel,
  onConfirm,
  children,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) onCancel();
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [loading, onCancel]);

  return (
    <div className={styles.modalOverlay}>
      <div
        className={styles.modalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h2 id={titleId} className={styles.modalTitle}>
          {title}
        </h2>
        <p id={descriptionId} className={styles.modalBody}>
          {body}
        </p>
        {children}
        <div className={styles.modalActions}>
          <button
            ref={cancelRef}
            type="button"
            className={styles.secondaryButton}
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className={primaryDanger ? styles.quietDanger : styles.primaryButton}
            style={
              primaryDanger
                ? { background: "#be123c", color: "#fff", borderColor: "#be123c" }
                : undefined
            }
            onClick={onConfirm}
            disabled={loading}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function JourneyUploadEditDialog({
  storyType,
  statusLabel,
  value,
  loading,
  onChange,
  onCancel,
  onSave,
}: {
  storyType: string;
  statusLabel: string;
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const titleId = useId();
  const textareaId = useId();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) onCancel();
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [loading, onCancel]);

  return (
    <div className={styles.modalOverlay}>
      <div
        className={styles.modalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.eyebrow}>Edit Upload</div>
        <h2 id={titleId} className={styles.modalTitle}>
          Update your story text
        </h2>
        <p className={styles.modalBody}>
          {storyType} · {statusLabel}
        </p>
        <label htmlFor={textareaId} className="sr-only">
          Upload story text
        </label>
        <textarea
          id={textareaId}
          className={styles.textarea}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Update your testimony, praise report, prayer request, or video description..."
        />
        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onSave}
            disabled={loading}
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
