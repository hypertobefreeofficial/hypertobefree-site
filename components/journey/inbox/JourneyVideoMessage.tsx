"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import styles from "./JourneyInbox.module.css";

type JourneyVideoMessageProps = {
  messageId: string;
  videoReference: string;
  title?: string;
};

type PlaybackState = "loading" | "ready" | "error";

export default function JourneyVideoMessage({
  messageId,
  videoReference,
  title,
}: JourneyVideoMessageProps) {
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("loading");
  const [playbackError, setPlaybackError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function resolvePlaybackUrl() {
      setPlaybackState("loading");
      setPlaybackError("");
      setPlaybackUrl(null);

      const trimmedReference = videoReference.trim();
      if (!trimmedReference) {
        setPlaybackState("error");
        setPlaybackError("This video is unavailable.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        if (!cancelled) {
          setPlaybackState("error");
          setPlaybackError("Please sign in to watch this private video.");
        }
        return;
      }

      try {
        const response = await fetch(
          `/api/journey/inbox/media?messageId=${encodeURIComponent(messageId)}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            cache: "no-store",
          }
        );

        const payload = (await response.json()) as {
          ok?: boolean;
          signedUrl?: string;
          error?: string;
        };

        if (!response.ok || !payload.ok || !payload.signedUrl) {
          if (!cancelled) {
            setPlaybackState("error");
            setPlaybackError(
              payload.error ?? "Could not load this private video."
            );
          }
          return;
        }

        if (!cancelled) {
          setPlaybackUrl(payload.signedUrl);
          setPlaybackState("ready");
        }
      } catch (error) {
        console.error("Could not resolve Journey Inbox video:", error);
        if (!cancelled) {
          setPlaybackState("error");
          setPlaybackError("Could not load this private video.");
        }
      }
    }

    void resolvePlaybackUrl();

    return () => {
      cancelled = true;
    };
  }, [messageId, videoReference]);

  return (
    <div className={styles.videoWrap}>
      {playbackState === "loading" ? (
        <p className={styles.videoStatus} aria-live="polite">
          Loading private video…
        </p>
      ) : null}

      {playbackState === "error" ? (
        <p className={styles.videoStatus} role="alert">
          {playbackError || "Could not load this private video."}
        </p>
      ) : null}

      {playbackState === "ready" && playbackUrl ? (
        <video
          key={playbackUrl}
          src={playbackUrl}
          controls
          playsInline
          preload="metadata"
          className={styles.videoPlayer}
          aria-label={title ? `${title} video` : "Inbox video message"}
        />
      ) : null}

      <p className={styles.privacyNote} style={{ padding: "0.5rem 0.75rem" }}>
        Private prayer videos are visible only within your Journey Inbox.
      </p>
    </div>
  );
}
