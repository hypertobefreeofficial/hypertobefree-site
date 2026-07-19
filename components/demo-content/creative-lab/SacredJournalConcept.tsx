"use client";

import { FLAGSHIP_STORY } from "./creativeConcepts";
import { ConceptLayer } from "./ConceptLayer";
import styles from "./creativeLab.module.css";
import type { FlagshipMomentId } from "./creativeConcepts";

type SacredJournalConceptProps = {
  activeMomentId: FlagshipMomentId;
  reducedMotion: boolean;
};

export default function SacredJournalConcept({
  activeMomentId,
  reducedMotion,
}: SacredJournalConceptProps) {
  return (
    <div className={styles.journalRoot}>
      <div className={styles.journalPaper}>
        <div className={styles.journalMargin} />
        <div className={styles.journalGlow} />

        <div className={styles.journalCopy}>
          <ConceptLayer
            momentId="opening"
            activeMomentId={activeMomentId}
            reducedMotion={reducedMotion}
          >
            <p className={styles.journalHand}>Sample entry — not a real member</p>
            <h2 className={styles.journalTitle}>Prayer → Support → God Did It</h2>
            <p className={styles.journalBody}>
              A sacred-journal preview of HTBF&apos;s flagship fictional journey.
            </p>
            <span className={styles.journalStamp}>Fictional sample</span>
          </ConceptLayer>

          <ConceptLayer
            momentId="prayer-request"
            activeMomentId={activeMomentId}
            reducedMotion={reducedMotion}
          >
            <p className={styles.journalHand}>Prayer request</p>
            <h2 className={styles.journalTitle}>A family season in waiting</h2>
            <p className={styles.journalBody}>{FLAGSHIP_STORY.prayerRequest}</p>
          </ConceptLayer>

          <ConceptLayer
            momentId="praying-support"
            activeMomentId={activeMomentId}
            reducedMotion={reducedMotion}
          >
            <p className={styles.journalHand}>Community standing with you</p>
            <h2 className={styles.journalTitle}>{FLAGSHIP_STORY.imPrayingLabel}</h2>
            <p className={styles.journalBody}>{FLAGSHIP_STORY.encouragementSupport}</p>
            <span className={styles.journalStamp}>Encouragement</span>
          </ConceptLayer>

          <ConceptLayer
            momentId="public-response"
            activeMomentId={activeMomentId}
            reducedMotion={reducedMotion}
          >
            <p className={styles.journalHand}>Written response</p>
            <h2 className={styles.journalTitle}>Words of peace</h2>
            <p className={styles.journalBody}>{FLAGSHIP_STORY.publicResponse}</p>
          </ConceptLayer>

          <ConceptLayer
            momentId="god-did-it"
            activeMomentId={activeMomentId}
            reducedMotion={reducedMotion}
          >
            <p className={styles.journalHand}>God Did It</p>
            <h2 className={styles.journalTitle}>Peace before the door opened</h2>
            <p className={styles.journalBody}>{FLAGSHIP_STORY.godDidIt}</p>
          </ConceptLayer>

          <ConceptLayer
            momentId="final-invitation"
            activeMomentId={activeMomentId}
            reducedMotion={reducedMotion}
          >
            <p className={styles.journalHand}>Invitation</p>
            <h2 className={styles.journalTitle}>{FLAGSHIP_STORY.finalInvitation}</h2>
            <p className={styles.journalBody}>
              Fictional devotional sample for owner review — not a live testimony.
            </p>
          </ConceptLayer>
        </div>
      </div>
    </div>
  );
}
