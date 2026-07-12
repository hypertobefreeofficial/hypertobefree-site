"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Film, RefreshCw } from "lucide-react";
import type { JourneyUpload } from "../../../lib/journey/uploads/types";
import {
  getUploadImageSource,
  getUploadPosterSource,
  getUploadVideoSource,
} from "../../../lib/journey/uploads/media";
import styles from "./JourneyUploads.module.css";

type JourneyUploadMediaProps = {
  upload: JourneyUpload;
  autoStart?: boolean;
  compact?: boolean;
};

export default function JourneyUploadMedia({
  upload,
  autoStart = false,
  compact = false,
}: JourneyUploadMediaProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [playing, setPlaying] = useState(autoStart);
  const [retryKey, setRetryKey] = useState(0);
  const statusId = useId();

  const videoSrc = getUploadVideoSource(upload);
  const poster = getUploadPosterSource(upload);
  const imageSrc = getUploadImageSource(upload);
  const hasVideo = Boolean(videoSrc);

  useEffect(() => {
    setImageFailed(false);
    setVideoFailed(false);
    setPlaying(autoStart);
    setRetryKey((key) => key + 1);
  }, [upload.id, videoSrc, imageSrc, poster, autoStart]);

  useEffect(() => {
    if (!playing || !videoRef.current) return;
    const playPromise = videoRef.current.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        /* user gesture / browser policy — controls remain available */
      });
    }
  }, [playing, retryKey]);

  if (hasVideo) {
    if (videoFailed || !videoSrc) {
      return (
        <div
          className={`${styles.mediaFrame} ${compact ? styles.mediaFrameCompact : ""}`}
          role="status"
          aria-live="polite"
          aria-labelledby={statusId}
        >
          <div className={styles.mediaFallback}>
            <AlertCircle className="h-6 w-6" aria-hidden />
            <p id={statusId} className={styles.mediaFallbackTitle}>
              {videoSrc ? "Video unavailable" : "Video removed from storage"}
            </p>
            <p className={styles.mediaFallbackBody}>
              Playback is not available right now. You can still review details
              for this upload.
            </p>
            {videoSrc ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setVideoFailed(false);
                  setRetryKey((key) => key + 1);
                  setPlaying(true);
                }}
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Retry
              </button>
            ) : null}
          </div>
        </div>
      );
    }

    if (!playing) {
      return (
        <div
          className={`${styles.mediaFrame} ${compact ? styles.mediaFrameCompact : ""}`}
        >
          <button
            type="button"
            className={styles.mediaPlaySurface}
            onClick={() => setPlaying(true)}
            aria-label="Play video"
          >
            {poster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={poster}
                alt=""
                className={styles.mediaPoster}
                loading="lazy"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <div className={styles.mediaPosterFallback}>
                <Film className="h-8 w-8" aria-hidden />
                <span>Video</span>
              </div>
            )}
            {imageFailed && poster ? (
              <div className={styles.mediaPosterFallback}>
                <Film className="h-8 w-8" aria-hidden />
                <span>Video</span>
              </div>
            ) : null}
            <span className={styles.mediaPlayControl} aria-hidden>
              Play
            </span>
          </button>
        </div>
      );
    }

    return (
      <div
        className={`${styles.mediaFrame} ${compact ? styles.mediaFrameCompact : ""}`}
      >
        <video
          key={`${upload.id}-${retryKey}`}
          ref={videoRef}
          className={styles.mediaVideo}
          src={videoSrc}
          poster={poster || undefined}
          controls
          playsInline
          preload="metadata"
          onError={() => setVideoFailed(true)}
        >
          <track kind="captions" />
        </video>
      </div>
    );
  }

  if (imageSrc && !imageFailed) {
    return (
      <div
        className={`${styles.mediaFrame} ${styles.mediaFrameImage} ${
          compact ? styles.mediaFrameCompact : ""
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt=""
          className={styles.mediaImage}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  if (imageSrc && imageFailed) {
    return (
      <div
        className={`${styles.mediaFrame} ${compact ? styles.mediaFrameCompact : ""}`}
        role="status"
        aria-live="polite"
      >
        <div className={styles.mediaFallback}>
          <AlertCircle className="h-6 w-6" aria-hidden />
          <p className={styles.mediaFallbackTitle}>Image unavailable</p>
          <p className={styles.mediaFallbackBody}>
            This image could not be loaded right now.
          </p>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setImageFailed(false)}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return null;
}
