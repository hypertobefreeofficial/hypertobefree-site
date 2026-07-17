"use client";

import styles from "./PublicVideoResponses.module.css";

type PublicVideoResponseStatusPanelProps = {
  status: string;
  aiReviewStatus?: string | null;
  onClose?: () => void;
};

function stageState(current: string, target: string) {
  const order = ["submitted", "automated", "human", "approved", "rejected"];
  const currentIndex = order.indexOf(current);
  const targetIndex = order.indexOf(target);
  if (currentIndex < 0 || targetIndex < 0) return "upcoming";
  if (targetIndex < currentIndex) return "complete";
  if (targetIndex === currentIndex) return "active";
  return "upcoming";
}

function resolveStage(status: string, aiReviewStatus?: string | null) {
  if (status === "approved") return "approved";
  if (status === "rejected" || status === "removed") return "rejected";
  if (aiReviewStatus === "completed") return "human";
  if (status === "submitted") return "automated";
  return "submitted";
}

export default function PublicVideoResponseStatusPanel({
  status,
  aiReviewStatus = null,
  onClose,
}: PublicVideoResponseStatusPanelProps) {
  const stage = resolveStage(status, aiReviewStatus);

  const steps = [
    {
      id: "submitted",
      label: "Submitted",
      copy: "Your response was received.",
    },
    {
      id: "automated",
      label: "Automated review",
      copy: "Our safety systems are reviewing the submitted text and metadata.",
    },
    {
      id: "human",
      label: "Human review",
      copy: "A member of the HTBF team will review the video before publication.",
    },
    {
      id: "approved",
      label: "Approved and live",
      copy: "Your response is now visible beneath the original post.",
    },
  ];

  if (stage === "rejected") {
    return (
      <section className={styles.statusPanel} aria-live="polite">
        <h2 className={styles.viewerTitle}>Response status</h2>
        <p className={styles.statusCopy}>
          This response could not be published. Review the reason and available
          actions in your account tools or submit a new response when appropriate.
        </p>
        {onClose ? (
          <button type="button" className={styles.pendingButton} onClick={onClose}>
            Close
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className={styles.statusPanel} aria-live="polite">
      <h2 className={styles.viewerTitle}>Response status</h2>
      {steps.map((step) => {
        const state = stageState(stage, step.id);
        const dotClass =
          state === "complete"
            ? styles.statusDotActive
            : state === "active"
              ? styles.statusDotPending
              : styles.statusDot;
        return (
          <div key={step.id} className={styles.statusStep}>
            <div className={dotClass} aria-hidden>
              {state === "complete" ? "✓" : state === "active" ? "•" : ""}
            </div>
            <div>
              <div className={styles.statusLabel}>{step.label}</div>
              {state !== "upcoming" ? (
                <p className={styles.statusCopy}>{step.copy}</p>
              ) : null}
            </div>
          </div>
        );
      })}
      <p className={styles.statusCopy}>
        Automated review evaluates text and metadata only. Video frames, audio,
        and transcripts are not analyzed unless HTBF adds that capability.
      </p>
      {onClose ? (
        <button type="button" className={styles.pendingButton} onClick={onClose}>
          Close
        </button>
      ) : null}
    </section>
  );
}
