"use client";

import {
  HeartHandshake,
  Lock,
  MessageCircle,
  Video,
  X,
} from "lucide-react";
import type { PrayerInteractionPrefs } from "../../lib/prayer-connect/interactionPrefs";
import styles from "./PrayerConnect.module.css";

export type PrayerResponseChoice =
  | "public-video"
  | "private-message"
  | "private-video";

type PrayerResponseChooserProps = {
  open: boolean;
  prefs: PrayerInteractionPrefs;
  onClose: () => void;
  onChoose: (choice: PrayerResponseChoice) => void;
};

export default function PrayerResponseChooser({
  open,
  prefs,
  onClose,
  onChoose,
}: PrayerResponseChooserProps) {
  if (!open) return null;

  const publicOptions = [
    prefs.allowPublicVideo
      ? {
          id: "public-video" as const,
          title: "Send a public video prayer",
          detail: "Recorded or uploaded video attached to this request.",
          icon: Video,
        }
      : null,
  ].filter(Boolean);

  const privateOptions = [
    prefs.allowPrivateMessage
      ? {
          id: "private-message" as const,
          title: "Send a private message",
          detail: "Only the requester can read this in HTBF Messages.",
          icon: MessageCircle,
        }
      : null,
    prefs.allowPrivateVideo
      ? {
          id: "private-video" as const,
          title: "Send a private video prayer",
          detail: "A personal video delivered privately through Journey Inbox.",
          icon: Lock,
        }
      : null,
  ].filter(Boolean);

  return (
    <div className={styles.responseOverlay} onClick={onClose}>
      <div
        className={styles.responseSheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="response-chooser-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.responseSheetHeader}>
          <div>
            <p className={styles.eyebrow}>Respond with Prayer</p>
            <h2 id="response-chooser-title">Choose how you want to respond</h2>
          </div>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Close response options"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {!prefs.acceptsNewResponses ? (
          <p className={styles.responseNotice}>
            This request is no longer accepting new responses.
          </p>
        ) : null}

        {publicOptions.length > 0 ? (
          <div className={styles.responseGroup}>
            <h3>Public</h3>
            <p className={styles.responseGroupHint}>
              Public video prayers can be seen by other believers after
              approval.
            </p>
            <div className={styles.responseOptions}>
              {publicOptions.map((option) => {
                if (!option) return null;
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={styles.responseOption}
                    onClick={() => onChoose(option.id)}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                    <span>
                      <strong>{option.title}</strong>
                      <small>{option.detail}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {privateOptions.length > 0 ? (
          <div className={styles.responseGroup}>
            <h3>Private</h3>
            <p className={styles.responseGroupHint}>
              Only you and the requester can see these responses.
            </p>
            <div className={styles.responseOptions}>
              {privateOptions.map((option) => {
                if (!option) return null;
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={styles.responseOption}
                    onClick={() => onChoose(option.id)}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                    <span>
                      <strong>{option.title}</strong>
                      <small>{option.detail}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {publicOptions.length === 0 && privateOptions.length === 0 ? (
          <div className={styles.responseEmpty}>
            <HeartHandshake className="h-5 w-5" aria-hidden />
            <p>The requester has turned off written and private response options.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
