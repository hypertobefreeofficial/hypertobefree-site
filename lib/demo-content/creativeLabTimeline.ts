import {
  FLAGSHIP_DURATION_SECONDS,
  FLAGSHIP_MOMENTS,
  type FlagshipMoment,
  type FlagshipMomentId,
} from "../../components/demo-content/creative-lab/creativeConcepts";

export type PlaybackState = {
  currentTime: number;
  isPlaying: boolean;
};

export type MomentSnapshot = {
  moment: FlagshipMoment;
  momentProgress: number;
  globalProgress: number;
};

export function clampTimelineTime(time: number): number {
  return Math.min(Math.max(time, 0), FLAGSHIP_DURATION_SECONDS);
}

export function resolveMomentAtTime(time: number): MomentSnapshot {
  const clamped = clampTimelineTime(time);
  const moment =
    FLAGSHIP_MOMENTS.find(
      (entry) => clamped >= entry.start && clamped < entry.end
    ) ?? FLAGSHIP_MOMENTS[FLAGSHIP_MOMENTS.length - 1];

  const span = Math.max(moment.end - moment.start, 0.001);
  const momentProgress = (clamped - moment.start) / span;

  return {
    moment,
    momentProgress,
    globalProgress: clamped / FLAGSHIP_DURATION_SECONDS,
  };
}

export function restartPlayback(): PlaybackState {
  return { currentTime: 0, isPlaying: true };
}

export function togglePlayback(state: PlaybackState): PlaybackState {
  return { ...state, isPlaying: !state.isPlaying };
}

export function seekPlayback(state: PlaybackState, nextTime: number): PlaybackState {
  return { ...state, currentTime: clampTimelineTime(nextTime) };
}

export function advancePlayback(
  state: PlaybackState,
  deltaSeconds: number
): PlaybackState {
  const nextTime = state.currentTime + deltaSeconds;
  if (nextTime >= FLAGSHIP_DURATION_SECONDS) {
    return { currentTime: FLAGSHIP_DURATION_SECONDS, isPlaying: false };
  }
  return { ...state, currentTime: nextTime };
}

export function formatTimelineLabel(seconds: number): string {
  const whole = Math.floor(seconds);
  const tenths = Math.floor((seconds - whole) * 10);
  return `${whole}.${tenths}s`;
}

export function listRequiredMomentIds(): FlagshipMomentId[] {
  return FLAGSHIP_MOMENTS.map((moment) => moment.id);
}

export function prefersReducedMotion(
  mediaQueryMatches: boolean | undefined
): boolean {
  return mediaQueryMatches === true;
}
