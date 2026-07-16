"use client";

import {
  HeartHandshake,
  Lock,
  MessageCircle,
  Video,
  X,
} from "lucide-react";
import type { FeedReactionType } from "../community-feed/types";
import type {
  ResponseChoice,
  ResponseContextLabels,
} from "../../lib/responses/responseContext";
import type { PrayerInteractionPrefs } from "../../lib/prayer-connect/interactionPrefs";
import styles from "../prayer-connect/PrayerConnect.module.css";

const REACTION_OPTIONS: {
  type: Exclude<FeedReactionType, "praying">;
  label: string;
  emoji: string;
}[] = [
  { type: "amen", label: "Amen", emoji: "🙏" },
  { type: "praise_god", label: "Praise God", emoji: "✨" },
  { type: "encouraged", label: "Encouraged", emoji: "💙" },
];

export type PostResponseChooserProps = {
  open: boolean;
  prefs: PrayerInteractionPrefs;
  labels: ResponseContextLabels;
  onClose: () => void;
  onChoose: (choice: ResponseChoice) => void;
  showReactions?: boolean;
  userReactions?: FeedReactionType[];
  onToggleReaction?: (reactionType: FeedReactionType) => void;
};

export default function PostResponseChooser({
  open,
  prefs,
  labels,
  onClose,
  onChoose,
  showReactions = false,
  userReactions = [],
  onToggleReaction,
}: PostResponseChooserProps) {
  if (!open) return null;

  const publicOptions = [
    prefs.allowPublicVideo
      ? {
          id: "public-video" as const,
          title: labels.publicVideoTitle,
          detail: labels.publicVideoDetail,
          icon: Video,
        }
      : null,
  ].filter(Boolean);

  const privateOptions = [
    prefs.allowPrivateMessage
      ? {
          id: "private-message" as const,
          title: labels.privateMessageTitle,
          detail: labels.privateMessageDetail,
          icon: MessageCircle,
        }
      : null,
    prefs.allowPrivateVideo
      ? {
          id: "private-video" as const,
          title: labels.privateVideoTitle,
          detail: labels.privateVideoDetail,
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
            <p className={styles.eyebrow}>{labels.sheetEyebrow}</p>
            <h2 id="response-chooser-title">{labels.sheetTitle}</h2>
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
          <p className={styles.responseNotice}>{labels.notAcceptingResponses}</p>
        ) : null}

        {publicOptions.length > 0 ? (
          <div className={styles.responseGroup}>
            <h3>Public</h3>
            <p className={styles.responseGroupHint}>{labels.publicGroupHint}</p>
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
            <p className={styles.responseGroupHint}>{labels.privateGroupHint}</p>
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
            <p>No response options are available for this post right now.</p>
          </div>
        ) : null}

        {showReactions && onToggleReaction ? (
          <div className={styles.responseGroup}>
            <h3>Quick encouragement</h3>
            <div className={styles.responseOptions}>
              {REACTION_OPTIONS.map((option) => {
                const active = userReactions.includes(option.type);
                return (
                  <button
                    key={option.type}
                    type="button"
                    className={styles.responseOption}
                    aria-pressed={active}
                    onClick={() => onToggleReaction(option.type)}
                  >
                    <span aria-hidden>{option.emoji}</span>
                    <span>
                      <strong>{option.label}</strong>
                      <small>{active ? "Selected" : "Tap to react"}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
