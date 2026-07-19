"use client";

import {
  FLAGSHIP_DURATION_SECONDS,
  FLAGSHIP_MOMENTS,
} from "./creativeConcepts";
import styles from "./creativeLab.module.css";
import { formatTimelineLabel } from "../../../lib/demo-content/creativeLabTimeline";

type FlagshipDemoControlsProps = {
  currentTime: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onRestart: () => void;
  onScrub: (nextTime: number) => void;
};

export default function FlagshipDemoControls({
  currentTime,
  isPlaying,
  onPlayPause,
  onRestart,
  onScrub,
}: FlagshipDemoControlsProps) {
  const activeMoment =
    FLAGSHIP_MOMENTS.find(
      (moment) => currentTime >= moment.start && currentTime < moment.end
    ) ?? FLAGSHIP_MOMENTS[FLAGSHIP_MOMENTS.length - 1];

  return (
    <div className={styles.controls} aria-label="Flagship demo playback controls">
      <div className={styles.controlRow}>
        <button
          type="button"
          className={styles.controlButton}
          onClick={onPlayPause}
          aria-pressed={isPlaying}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className={`${styles.controlButton} ${styles.controlButtonSecondary}`}
          onClick={onRestart}
        >
          Restart
        </button>
        <span className={styles.timeLabel}>
          {formatTimelineLabel(currentTime)} /{" "}
          {formatTimelineLabel(FLAGSHIP_DURATION_SECONDS)}
        </span>
      </div>

      <input
        className={styles.scrubber}
        type="range"
        min={0}
        max={FLAGSHIP_DURATION_SECONDS}
        step={0.1}
        value={currentTime}
        onChange={(event) => onScrub(Number(event.target.value))}
        aria-valuemin={0}
        aria-valuemax={FLAGSHIP_DURATION_SECONDS}
        aria-valuenow={currentTime}
        aria-label="Scrub flagship demo timeline"
      />

      <div className={styles.momentRail} aria-hidden>
        {FLAGSHIP_MOMENTS.map((moment) => (
          <div
            key={moment.id}
            className={`${styles.momentTick} ${
              moment.id === activeMoment.id ? styles.momentTickActive : ""
            }`}
          />
        ))}
      </div>

      <p className={styles.timeLabel}>
        Current beat: <strong>{activeMoment.label}</strong>
      </p>
    </div>
  );
}
