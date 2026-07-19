"use client";

import { FLAGSHIP_STORY } from "./creativeConcepts";
import { ConceptLayer } from "./ConceptLayer";
import styles from "./creativeLab.module.css";
import type { FlagshipMomentId } from "./creativeConcepts";

type LivingTestimonyConceptProps = {
  activeMomentId: FlagshipMomentId;
  reducedMotion: boolean;
  globalProgress: number;
};

export default function LivingTestimonyConcept({
  activeMomentId,
  reducedMotion,
  globalProgress,
}: LivingTestimonyConceptProps) {
  return (
    <div className={styles.livingRoot}>
      <div className={styles.livingBackdrop} />

      <div className={styles.safeContent}>
        <ConceptLayer
          momentId="opening"
          activeMomentId={activeMomentId}
          reducedMotion={reducedMotion}
        >
          <div className={styles.livingCard}>
            <p className={styles.livingKicker}>Fictional flagship sample</p>
            <h2 className={styles.livingHeadline}>How HTBF carries a prayer</h2>
            <p className={styles.livingBody}>
              Prayer → Support → God Did It — a premium community story arc.
            </p>
          </div>
        </ConceptLayer>

        <ConceptLayer
          momentId="prayer-request"
          activeMomentId={activeMomentId}
          reducedMotion={reducedMotion}
        >
          <div className={styles.livingCard}>
            <p className={styles.livingKicker}>Prayer request</p>
            <h2 className={styles.livingHeadline}>Share the need</h2>
            <p className={styles.livingBody}>{FLAGSHIP_STORY.prayerRequest}</p>
          </div>
        </ConceptLayer>

        <ConceptLayer
          momentId="praying-support"
          activeMomentId={activeMomentId}
          reducedMotion={reducedMotion}
        >
          <div className={styles.livingCard}>
            <p className={styles.livingKicker}>Community support</p>
            <h2 className={styles.livingHeadline}>{FLAGSHIP_STORY.imPrayingLabel}</h2>
            <p className={styles.livingBody}>{FLAGSHIP_STORY.encouragementSupport}</p>
            <div className={styles.livingReactionRow}>
              <span className={`${styles.livingReaction} ${styles.livingReactionActive}`}>
                🙏 I&apos;m Praying
              </span>
              <span className={styles.livingReaction}>Encourage</span>
              <span className={styles.livingReaction}>Stand with you</span>
            </div>
          </div>
        </ConceptLayer>

        <ConceptLayer
          momentId="public-response"
          activeMomentId={activeMomentId}
          reducedMotion={reducedMotion}
        >
          <div className={styles.livingCard}>
            <p className={styles.livingKicker}>Public response</p>
            <h2 className={styles.livingHeadline}>Community speaks peace</h2>
            <p className={styles.livingBody}>{FLAGSHIP_STORY.publicResponse}</p>
          </div>
        </ConceptLayer>

        <ConceptLayer
          momentId="god-did-it"
          activeMomentId={activeMomentId}
          reducedMotion={reducedMotion}
        >
          <div className={styles.livingCard}>
            <p className={styles.livingKicker}>God Did It</p>
            <h2 className={styles.livingHeadline}>Celebrate the answer</h2>
            <p className={styles.livingBody}>{FLAGSHIP_STORY.godDidIt}</p>
          </div>
        </ConceptLayer>

        <ConceptLayer
          momentId="final-invitation"
          activeMomentId={activeMomentId}
          reducedMotion={reducedMotion}
        >
          <div className={styles.livingCard}>
            <p className={styles.livingKicker}>Your journey on HTBF</p>
            <h2 className={styles.livingHeadline}>{FLAGSHIP_STORY.finalInvitation}</h2>
            <p className={styles.livingBody}>
              Fictional sample — shows how HTBF community interaction feels in motion.
            </p>
          </div>
        </ConceptLayer>
      </div>

      <div className={styles.livingProgressBar} aria-hidden>
        <div
          className={styles.livingProgressFill}
          style={{ width: `${Math.round(globalProgress * 100)}%` }}
        />
      </div>
    </div>
  );
}
