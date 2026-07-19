"use client";

import CinematicDawnConcept from "./CinematicDawnConcept";
import LivingTestimonyConcept from "./LivingTestimonyConcept";
import SacredJournalConcept from "./SacredJournalConcept";
import FlagshipDemoControls from "./FlagshipDemoControls";
import FlagshipDemoFrame from "./FlagshipDemoFrame";
import type { CreativeDirectionId } from "./creativeConcepts";
import {
  useFlagshipDemoPlayback,
  useReducedMotionPreference,
} from "./useFlagshipDemoPlayback";

type FlagshipDemoPlayerProps = {
  directionId: CreativeDirectionId;
};

export default function FlagshipDemoPlayer({ directionId }: FlagshipDemoPlayerProps) {
  const reducedMotion = useReducedMotionPreference();
  const {
    currentTime,
    isPlaying,
    activeMomentId,
    globalProgress,
    playPause,
    restart,
    scrub,
  } = useFlagshipDemoPlayback();

  return (
    <>
      <FlagshipDemoFrame>
        {directionId === "cinematic-dawn" ? (
          <CinematicDawnConcept
            activeMomentId={activeMomentId}
            reducedMotion={reducedMotion}
          />
        ) : null}
        {directionId === "sacred-journal" ? (
          <SacredJournalConcept
            activeMomentId={activeMomentId}
            reducedMotion={reducedMotion}
          />
        ) : null}
        {directionId === "living-testimony" ? (
          <LivingTestimonyConcept
            activeMomentId={activeMomentId}
            reducedMotion={reducedMotion}
            globalProgress={globalProgress}
          />
        ) : null}
      </FlagshipDemoFrame>

      <FlagshipDemoControls
        currentTime={currentTime}
        isPlaying={isPlaying}
        onPlayPause={playPause}
        onRestart={restart}
        onScrub={scrub}
      />
    </>
  );
}
