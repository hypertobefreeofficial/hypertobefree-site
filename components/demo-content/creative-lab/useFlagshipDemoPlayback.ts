"use client";

import { useCallback, useEffect, useState } from "react";
import {
  advancePlayback,
  restartPlayback,
  resolveMomentAtTime,
  seekPlayback,
  togglePlayback,
  type PlaybackState,
} from "../../../lib/demo-content/creativeLabTimeline";

export function useReducedMotionPreference(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

export function useFlagshipDemoPlayback() {
  const [state, setState] = useState<PlaybackState>({
    currentTime: 0,
    isPlaying: false,
  });

  const snapshot = resolveMomentAtTime(state.currentTime);

  useEffect(() => {
    if (!state.isPlaying) {
      return;
    }

    let frameId = 0;
    let previous = performance.now();

    const tick = (now: number) => {
      const deltaSeconds = (now - previous) / 1000;
      previous = now;
      setState((current) => advancePlayback(current, deltaSeconds));
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [state.isPlaying]);

  const playPause = useCallback(() => {
    setState((current) => togglePlayback(current));
  }, []);

  const restart = useCallback(() => {
    setState(restartPlayback());
  }, []);

  const scrub = useCallback((nextTime: number) => {
    setState((current) => seekPlayback(current, nextTime));
  }, []);

  return {
    currentTime: state.currentTime,
    isPlaying: state.isPlaying,
    activeMomentId: snapshot.moment.id,
    globalProgress: snapshot.globalProgress,
    playPause,
    restart,
    scrub,
  };
}
