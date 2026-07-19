"use client";

import { FLAGSHIP_STORY } from "./creativeConcepts";
import { ConceptLayer } from "./ConceptLayer";
import styles from "./creativeLab.module.css";
import type { FlagshipMomentId } from "./creativeConcepts";

type CinematicDawnConceptProps = {
  activeMomentId: FlagshipMomentId;
  reducedMotion: boolean;
};

export default function CinematicDawnConcept({
  activeMomentId,
  reducedMotion,
}: CinematicDawnConceptProps) {
  return (
    <div className={styles.dawnRoot} aria-hidden={false}>
      <div
        className={[
          styles.dawnSun,
          reducedMotion ? "" : styles.animateDawnDriftReverse,
        ]
          .filter(Boolean)
          .join(" ")}
      />
      <div
        className={`${styles.dawnCloud} ${styles.dawnCloudOne} ${
          reducedMotion ? "" : styles.animateDawnDrift
        }`}
      />
      <div
        className={`${styles.dawnCloud} ${styles.dawnCloudTwo} ${
          reducedMotion ? "" : styles.animateDawnDriftReverse
        }`}
      />
      <div
        className={`${styles.dawnCloud} ${styles.dawnCloudThree} ${
          reducedMotion ? "" : styles.animateDawnDrift
        }`}
      />

      <div className={styles.safeContent}>
        <ConceptLayer
          momentId="opening"
          activeMomentId={activeMomentId}
          reducedMotion={reducedMotion}
        >
          <div className={styles.dawnCopy}>
            <p className={styles.dawnEyebrow}>Fictional HTBF flagship sample</p>
            <h2 className={styles.dawnHeadline}>Prayer → Support → God Did It</h2>
            <p className={styles.dawnBody}>
              A cinematic preview of how HTBF carries a prayer from request to
              celebration.
            </p>
          </div>
        </ConceptLayer>

        <ConceptLayer
          momentId="prayer-request"
          activeMomentId={activeMomentId}
          reducedMotion={reducedMotion}
        >
          <div className={styles.dawnCopy}>
            <p className={styles.dawnEyebrow}>Prayer request</p>
            <h2 className={styles.dawnHeadline}>Waiting for peace</h2>
            <p className={styles.dawnBody}>{FLAGSHIP_STORY.prayerRequest}</p>
          </div>
        </ConceptLayer>

        <ConceptLayer
          momentId="praying-support"
          activeMomentId={activeMomentId}
          reducedMotion={reducedMotion}
        >
          <div className={styles.dawnCopy}>
            <p className={styles.dawnEyebrow}>Community support</p>
            <h2 className={styles.dawnHeadline}>{FLAGSHIP_STORY.imPrayingLabel}</h2>
            <p className={styles.dawnBody}>{FLAGSHIP_STORY.encouragementSupport}</p>
            <span className={styles.dawnSupportChip}>🙏 Standing together</span>
          </div>
        </ConceptLayer>

        <ConceptLayer
          momentId="public-response"
          activeMomentId={activeMomentId}
          reducedMotion={reducedMotion}
        >
          <div className={styles.dawnCopy}>
            <p className={styles.dawnEyebrow}>Public response</p>
            <h2 className={styles.dawnHeadline}>Encouragement arrives</h2>
            <p className={styles.dawnBody}>{FLAGSHIP_STORY.publicResponse}</p>
          </div>
        </ConceptLayer>

        <ConceptLayer
          momentId="god-did-it"
          activeMomentId={activeMomentId}
          reducedMotion={reducedMotion}
        >
          <div className={styles.dawnCopy}>
            <p className={styles.dawnEyebrow}>Answered prayer</p>
            <h2 className={styles.dawnHeadline}>God Did It</h2>
            <p className={styles.dawnBody}>{FLAGSHIP_STORY.godDidIt}</p>
          </div>
        </ConceptLayer>

        <ConceptLayer
          momentId="final-invitation"
          activeMomentId={activeMomentId}
          reducedMotion={reducedMotion}
        >
          <div className={styles.dawnCopy}>
            <p className={styles.dawnEyebrow}>Your HTBF journey</p>
            <h2 className={styles.dawnHeadline}>{FLAGSHIP_STORY.finalInvitation}</h2>
            <p className={styles.dawnBody}>
              Fictional sample only — designed to show the emotional arc HTBF
              will carry in production.
            </p>
          </div>
        </ConceptLayer>
      </div>
    </div>
  );
}
