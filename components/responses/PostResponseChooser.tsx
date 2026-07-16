"use client";

import { HeartHandshake, Lock, MessageCircle, Video, X } from "lucide-react";
import type { FeedReactionType } from "../community-feed/types";
import type {
  ResponseChoice,
  ResponseContextLabels,
} from "../../lib/responses/responseContext";
import type { PrayerInteractionPrefs } from "../../lib/prayer-connect/interactionPrefs";
import styles from "./PostResponseChooser.module.css";

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

  const primaryOptions = [
    prefs.allowPublicVideo
      ? {
          id: "public-video" as const,
          title: labels.publicVideoTitle,
          icon: Video,
          testId: "feed-response-public-video",
        }
      : null,
    prefs.allowPrivateMessage
      ? {
          id: "private-message" as const,
          title: labels.privateMessageTitle,
          icon: MessageCircle,
          testId: "feed-response-private-message",
        }
      : null,
    prefs.allowPrivateVideo
      ? {
          id: "private-video" as const,
          title: labels.privateVideoTitle,
          icon: Lock,
          testId: "feed-response-private-video",
        }
      : null,
  ].filter(Boolean);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="response-chooser-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>{labels.sheetEyebrow}</p>
            <h2 id="response-chooser-title" className={styles.title}>
              {labels.sheetTitle}
            </h2>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Close response options"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {!prefs.acceptsNewResponses ? (
          <p className={styles.notice}>{labels.notAcceptingResponses}</p>
        ) : null}

        {primaryOptions.length > 0 ? (
          <div className={styles.primaryOptions}>
            {primaryOptions.map((option) => {
              if (!option) return null;
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  data-testid={option.testId}
                  className={styles.primaryOption}
                  onClick={() => onChoose(option.id)}
                >
                  <span className={styles.primaryOptionIcon} aria-hidden>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className={styles.primaryOptionLabel}>{option.title}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <HeartHandshake className="h-5 w-5" aria-hidden />
            <p>No response options are available for this post right now.</p>
          </div>
        )}

        {showReactions && onToggleReaction ? (
          <>
            <div className={styles.reactionsDivider} aria-hidden />
            <h3 className={styles.reactionsHeading}>Quick encouragement</h3>
            <div className={styles.reactionOptions}>
              {REACTION_OPTIONS.map((option) => {
                const active = userReactions.includes(option.type);
                return (
                  <button
                    key={option.type}
                    type="button"
                    className={styles.reactionOption}
                    aria-pressed={active}
                    onClick={() => onToggleReaction(option.type)}
                  >
                    <span aria-hidden>{option.emoji}</span>
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
