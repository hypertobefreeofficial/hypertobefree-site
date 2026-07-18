"use client";

import { useState } from "react";
import { Play, Video, Volume2, VolumeX } from "lucide-react";
import { FEED_MEDIA_EL_CLASS } from "../../lib/feedMediaClasses";
import {
  FEED_PREVIEW_VIDEO_ATTR,
  useViewportVideoAutoplay,
} from "../../hooks/useViewportVideoAutoplay";
import styles from "../FreedomFeed.module.css";

type FeedScrollVideoPreviewProps = {
  videoUrl?: string | null;
  posterUrl?: string | null;
  fallbackLabel: string;
  frameClassName: string;
  onClick: () => void;
  ariaLabel: string;
  overlay?: React.ReactNode;
  autoplayEnabled?: boolean;
};

export default function FeedScrollVideoPreview({
  videoUrl,
  posterUrl,
  fallbackLabel,
  frameClassName,
  onClick,
  ariaLabel,
  overlay,
  autoplayEnabled = true,
}: FeedScrollVideoPreviewProps) {
  const [posterFailed, setPosterFailed] = useState(false);
  const [posterLoaded, setPosterLoaded] = useState(false);
  const [userMuted, setUserMuted] = useState(true);
  const showPoster = Boolean(posterUrl) && !posterFailed;

  const { frameRef, videoRef, shouldLoad, isPlaying, setIsPlaying } =
    useViewportVideoAutoplay({
      videoUrl: videoUrl ?? "",
      enabled: Boolean(videoUrl) && autoplayEnabled,
    });

  function handleOpen(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onClick();
  }

  function handleToggleMute(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    const nextMuted = !userMuted;
    video.muted = nextMuted;
    setUserMuted(nextMuted);
  }

  function handleTogglePlayback(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      void video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      return;
    }

    video.pause();
    setIsPlaying(false);
  }

  return (
    <div
      ref={frameRef}
      className={`${styles.mediaBleed} ${styles.feedVideoPreviewRoot}`}
    >
      <div className={frameClassName}>
        {videoUrl && shouldLoad ? (
          <video
            ref={videoRef}
            src={videoUrl}
            muted={userMuted}
            loop
            playsInline
            preload="metadata"
            {...{ [FEED_PREVIEW_VIDEO_ATTR]: "true" }}
            className={`${FEED_MEDIA_EL_CLASS} ${styles.videoPosterImage}`}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              video.muted = userMuted;
              video.defaultMuted = userMuted;
              video.playsInline = true;
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        ) : showPoster && !posterLoaded ? (
          <div className={styles.videoPosterSkeleton} aria-hidden />
        ) : null}

        {(!videoUrl || !shouldLoad) && showPoster ? (
          <img
            src={posterUrl ?? undefined}
            alt=""
            className={`${FEED_MEDIA_EL_CLASS} ${styles.videoPosterImage}`}
            onLoad={() => setPosterLoaded(true)}
            onError={() => setPosterFailed(true)}
          />
        ) : null}

        {!videoUrl && !showPoster ? (
          <div className={styles.videoFallback} aria-hidden>
            <Video className="h-8 w-8 text-white/80" />
            <span>{fallbackLabel}</span>
          </div>
        ) : null}

        {videoUrl ? (
          <div className={styles.feedVideoPreviewControls}>
            <button
              type="button"
              className={styles.feedVideoPreviewControl}
              aria-label={isPlaying ? "Pause video preview" : "Play video preview"}
              onClick={handleTogglePlayback}
            >
              <Play
                className={`h-4 w-4 fill-current ${isPlaying ? "opacity-40" : ""}`}
                aria-hidden
              />
            </button>
            <button
              type="button"
              className={styles.feedVideoPreviewControl}
              aria-label={userMuted ? "Unmute video preview" : "Mute video preview"}
              onClick={handleToggleMute}
            >
              {userMuted ? (
                <VolumeX className="h-4 w-4" aria-hidden />
              ) : (
                <Volume2 className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
        ) : null}

        {!isPlaying ? (
          <span className={styles.videoPlayControl} aria-hidden>
            <Play className="h-7 w-7 fill-white text-white" />
          </span>
        ) : null}

        <button
          type="button"
          onClick={handleOpen}
          className={styles.feedVideoOpenOverlay}
          aria-label={ariaLabel}
        />

        {overlay}
      </div>
    </div>
  );
}
