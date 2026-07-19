"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import FlagshipDemoPlayer from "./FlagshipDemoPlayer";
import {
  CREATIVE_DIRECTIONS,
  SAMPLE_DEMO_LABEL,
  type CreativeDirectionId,
} from "./creativeConcepts";
import styles from "./creativeLab.module.css";

export default function DemoCreativeLab() {
  const [activeDirectionId, setActiveDirectionId] =
    useState<CreativeDirectionId>("cinematic-dawn");

  const activeDirection = useMemo(
    () => CREATIVE_DIRECTIONS.find((direction) => direction.id === activeDirectionId)!,
    [activeDirectionId]
  );

  return (
    <div className={styles.labShell}>
      <header className={styles.labHeader}>
        <p className={styles.labEyebrow}>Owner review only · {SAMPLE_DEMO_LABEL}</p>
        <h1 className={styles.labTitle}>HTBF Flagship Demo — Creative Lab</h1>
        <p className={styles.labDescription}>
          Three in-browser prototypes for the fictional flagship journey{" "}
          <strong>Prayer → Support → God Did It</strong>. All content is clearly
          labeled {SAMPLE_DEMO_LABEL} and does not represent a real HTBF member.
          No video files, database writes, or external services are used in this phase.
        </p>
        <p className={styles.labDescription}>
          <Link href="/admin">← Back to Admin</Link>
        </p>
      </header>

      <div className={styles.labGrid}>
        <aside className={styles.directionPanel}>
          {CREATIVE_DIRECTIONS.map((direction) => (
            <button
              key={direction.id}
              type="button"
              className={`${styles.directionButton} ${
                direction.id === activeDirectionId
                  ? styles.directionButtonActive
                  : ""
              }`}
              onClick={() => setActiveDirectionId(direction.id)}
              aria-pressed={direction.id === activeDirectionId}
            >
              <p className={styles.directionTitle}>{direction.title}</p>
              <p className={styles.directionSubtitle}>{direction.subtitle}</p>
              <div className={styles.directionMeta}>
                {direction.palette.map((color) => (
                  <span
                    key={color}
                    className={styles.paletteSwatch}
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                ))}
              </div>
            </button>
          ))}

          <section className={styles.audioPanel} aria-label="Future audio direction">
            <h3>Recommended audio treatment (future phase)</h3>
            <dl>
              <div>
                <dt>Narration</dt>
                <dd>{activeDirection.audio.narrationStyle}</dd>
              </div>
              <div>
                <dt>Music mood</dt>
                <dd>{activeDirection.audio.musicMood}</dd>
              </div>
              <div>
                <dt>Sound design</dt>
                <dd>{activeDirection.audio.soundDesign}</dd>
              </div>
              <div>
                <dt>Text-only preference</dt>
                <dd>
                  {activeDirection.audio.textOnlyPreferred ? "Yes" : "No"} —{" "}
                  {activeDirection.audio.textOnlyRationale}
                </dd>
              </div>
              <div>
                <dt>Accessibility transcript</dt>
                <dd>{activeDirection.audio.accessibilityTranscript}</dd>
              </div>
            </dl>
          </section>
        </aside>

        <section className={styles.stagePanel} aria-live="polite">
          <FlagshipDemoPlayer directionId={activeDirectionId} />
        </section>
      </div>
    </div>
  );
}
