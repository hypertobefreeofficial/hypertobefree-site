"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const FEED_PREVIEW_VIDEO_ATTR = "data-freedom-feed-preview-video";
export const FEED_PREVIEW_VIDEO_SELECTOR = `[${FEED_PREVIEW_VIDEO_ATTR}="true"]`;

const PLAY_THRESHOLD = 0.6;
const NEAR_VIEWPORT_MARGIN = "120px 0px";
const PLAY_ATTEMPT_COOLDOWN_MS = 320;

type IntersectionSnapshot = {
  isIntersecting: boolean;
  intersectionRatio: number;
};

let activeFeedPreviewVideo: HTMLVideoElement | null = null;
let feedAutoplaySuspended = false;
const resumeCallbacks = new Set<() => void>();

export function pauseAllFeedPreviewVideos(except?: HTMLVideoElement | null) {
  if (typeof document === "undefined") return;

  document
    .querySelectorAll<HTMLVideoElement>(FEED_PREVIEW_VIDEO_SELECTOR)
    .forEach((video) => {
      if (video !== except) {
        video.pause();
      }
    });

  if (!except || activeFeedPreviewVideo !== except) {
    activeFeedPreviewVideo = except ?? null;
  }
}

export function suspendFeedVideoAutoplay() {
  feedAutoplaySuspended = true;
  pauseAllFeedPreviewVideos(null);
}

export function resumeFeedVideoAutoplay() {
  feedAutoplaySuspended = false;
  for (const callback of resumeCallbacks) {
    callback();
  }
}

function prefersReducedMotionAutoplay() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function prefersSaveDataAutoplay() {
  if (typeof navigator === "undefined") return false;
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  return connection?.saveData === true;
}

export type UseViewportVideoAutoplayOptions = {
  videoUrl: string;
  enabled?: boolean;
};

export function useViewportVideoAutoplay({
  videoUrl,
  enabled = true,
}: UseViewportVideoAutoplayOptions) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const lastPlayAttemptRef = useRef(0);
  const snapshotRef = useRef<IntersectionSnapshot>({
    isIntersecting: false,
    intersectionRatio: 0,
  });

  const evaluatePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || !enabled || !videoUrl) return;

    const blockAutoplay =
      prefersReducedMotionAutoplay() || prefersSaveDataAutoplay();
    const snapshot = snapshotRef.current;
    const isPlayable =
      snapshot.isIntersecting && snapshot.intersectionRatio >= PLAY_THRESHOLD;

    if (!isPlayable || feedAutoplaySuspended || blockAutoplay) {
      video.pause();
      if (activeFeedPreviewVideo === video) {
        activeFeedPreviewVideo = null;
      }
      setIsPlaying(false);
      return;
    }

    const now = Date.now();
    if (now - lastPlayAttemptRef.current < PLAY_ATTEMPT_COOLDOWN_MS) {
      return;
    }
    lastPlayAttemptRef.current = now;

    pauseAllFeedPreviewVideos(video);
    activeFeedPreviewVideo = video;

    void video
      .play()
      .then(() => {
        setIsPlaying(true);
      })
      .catch(() => {
        setIsPlaying(false);
      });
  }, [enabled, videoUrl]);

  useEffect(() => {
    if (!enabled || !videoUrl) return;

    const frame = frameRef.current;
    if (!frame) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        snapshotRef.current = {
          isIntersecting: entry.isIntersecting,
          intersectionRatio: entry.intersectionRatio,
        };

        if (entry.isIntersecting) {
          setShouldLoad(true);
        }

        evaluatePlayback();
      },
      {
        root: null,
        rootMargin: NEAR_VIEWPORT_MARGIN,
        threshold: [0, 0.35, 0.6, 0.75, 1],
      }
    );

    observer.observe(frame);

    return () => {
      observer.disconnect();
      const video = videoRef.current;
      if (video) {
        video.pause();
        if (activeFeedPreviewVideo === video) {
          activeFeedPreviewVideo = null;
        }
      }
    };
  }, [enabled, evaluatePlayback, videoUrl]);

  useEffect(() => {
    if (!shouldLoad) return;
    evaluatePlayback();
  }, [shouldLoad, evaluatePlayback]);

  useEffect(() => {
    resumeCallbacks.add(evaluatePlayback);
    return () => {
      resumeCallbacks.delete(evaluatePlayback);
    };
  }, [evaluatePlayback]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (!document.hidden) return;
      pauseAllFeedPreviewVideos(null);
      setIsPlaying(false);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return {
    frameRef,
    videoRef,
    shouldLoad,
    isPlaying,
    setIsPlaying,
  };
}
