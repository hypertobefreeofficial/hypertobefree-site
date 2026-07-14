"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { submitContentReport } from "../../lib/prayer-connect/submitContentReport";
import styles from "./PrayerConnect.module.css";

export type PrayerReportContentType =
  | "prayer_request"
  | "video_response"
  | "written_response"
  | "profile";

type PrayerReportTarget = {
  contentType: PrayerReportContentType;
  reportedUserId: string | null;
  storyId?: string | null;
  responseId?: string | null;
  /** Neutral label of what is being reported, for the heading. */
  subjectLabel: string;
};

type PrayerReportModalProps = {
  open: boolean;
  target: PrayerReportTarget | null;
  onClose: () => void;
  /** Offered after a successful report (optional). */
  onBlock?: () => void;
  onHide?: () => void;
};

const REPORT_REASONS: { id: string; label: string }[] = [
  { id: "harassment_bullying", label: "Harassment or bullying" },
  { id: "sexual_content", label: "Inappropriate sexual content" },
  { id: "hate_abusive", label: "Hate or abusive content" },
  { id: "threats_dangerous", label: "Threats or dangerous content" },
  { id: "spam_scam", label: "Spam or scam" },
  { id: "impersonation", label: "Impersonation" },
  { id: "privacy_concern", label: "Privacy or personal-information concern" },
  { id: "self_harm", label: "Self-harm concern" },
  { id: "other", label: "Other" },
];

const MAX_EXPLANATION = 1000;

export default function PrayerReportModal({
  open,
  target,
  onClose,
  onBlock,
  onHide,
}: PrayerReportModalProps) {
  const [reason, setReason] = useState<string>("");
  const [explanation, setExplanation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setExplanation("");
    setSubmitting(false);
    setError(null);
    setDone(false);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => closeRef.current?.focus(), 0);
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !target) return null;

  async function submit() {
    if (!target) return;
    if (!reason) {
      setError("Please choose a reason.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setError("Please sign in to submit a report.");
        setSubmitting(false);
        return;
      }

      const result = await submitContentReport({
        accessToken,
        contentType: target.contentType,
        reason,
        details: explanation.trim() || undefined,
        storyId: target.storyId ?? null,
        responseId: target.responseId ?? null,
        reportedUserId: target.reportedUserId,
      });

      if (result.ok !== true) {
        setError(result.error);
        setSubmitting(false);
        return;
      }

      setDone(true);
    } catch (err) {
      console.error("Prayer report failed:", err);
      setError("We couldn't submit your report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={styles.modalOverlay}
      onClick={submitting ? undefined : onClose}
    >
      <div
        className={`${styles.modalCard} ${styles.responseModalCard}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prayer-report-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.responseModalHeader}>
          <h2 id="prayer-report-title">
            {done ? "Report received" : `Report ${target.subjectLabel}`}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className={styles.iconButton}
            aria-label="Close"
            onClick={onClose}
            disabled={submitting}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {done ? (
          <div className={styles.responseModalBody}>
            <p className={styles.detailMeta}>
              Thank you. HTBF will review this privately.
            </p>
            <p className={styles.reportPrivacyNote}>
              HTBF will review this privately. The other person will not be told
              who submitted the report.
            </p>
            <div className={styles.actionMenuList}>
              {onBlock && target.reportedUserId ? (
                <button
                  type="button"
                  className={`${styles.actionMenuItem} ${styles.actionMenuItemDanger}`}
                  onClick={() => {
                    onClose();
                    onBlock();
                  }}
                >
                  Block user
                </button>
              ) : null}
              {onHide ? (
                <button
                  type="button"
                  className={styles.actionMenuItem}
                  onClick={() => {
                    onClose();
                    onHide();
                  }}
                >
                  Hide this prayer
                </button>
              ) : null}
              <button
                type="button"
                className={styles.actionMenuItem}
                onClick={onClose}
              >
                Keep viewing
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.responseModalBody}>
              <fieldset className={styles.reportReasons}>
                <legend className={styles.sheetLabel}>
                  Why are you reporting this?
                </legend>
                {REPORT_REASONS.map((item) => (
                  <label key={item.id} className={styles.reportReasonRow}>
                    <input
                      type="radio"
                      name="prayer-report-reason"
                      value={item.id}
                      checked={reason === item.id}
                      onChange={() => setReason(item.id)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </fieldset>

              <label className={styles.sheetLabel} htmlFor="prayer-report-details">
                Add an explanation (optional)
              </label>
              <textarea
                id="prayer-report-details"
                className={styles.composerTextarea}
                rows={3}
                value={explanation}
                maxLength={MAX_EXPLANATION}
                placeholder="Share anything that helps our team understand."
                onChange={(event) => setExplanation(event.target.value)}
              />
              <p className={styles.composerHelp}>
                {explanation.length}/{MAX_EXPLANATION}
              </p>

              <p className={styles.reportPrivacyNote}>
                HTBF will review this privately. The other person will not be
                told who submitted the report.
              </p>

              {error ? (
                <p className={styles.modalError} role="alert">
                  {error}
                </p>
              ) : null}
            </div>

            <div className={styles.responseModalFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void submit()}
                disabled={submitting || !reason}
              >
                {submitting ? (
                  <>
                    <span className={styles.buttonSpinner} aria-hidden />
                    Submitting…
                  </>
                ) : (
                  "Submit report"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
