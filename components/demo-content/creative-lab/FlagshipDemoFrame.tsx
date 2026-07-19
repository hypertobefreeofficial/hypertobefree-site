"use client";

import type { ReactNode } from "react";
import styles from "./creativeLab.module.css";
import { SAMPLE_DEMO_LABEL } from "./creativeConcepts";

type FlagshipDemoFrameProps = {
  children: ReactNode;
  showBadge?: boolean;
};

export default function FlagshipDemoFrame({
  children,
  showBadge = true,
}: FlagshipDemoFrameProps) {
  return (
    <div className={styles.phoneStage}>
      <div className={styles.frameOuter}>
        <div className={styles.frameInner}>
          {showBadge ? (
            <div className={styles.sampleBadge} aria-label={SAMPLE_DEMO_LABEL}>
              {SAMPLE_DEMO_LABEL}
            </div>
          ) : null}
          <img
            src="/images/htbf-logo.png"
            alt=""
            aria-hidden
            className={styles.frameLogo}
          />
          {children}
        </div>
      </div>
    </div>
  );
}
