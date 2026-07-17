"use client";

import type { ReactNode } from "react";
import type { FeedReactionType } from "./types";
import styles from "../FreedomFeed.module.css";

const ENCOURAGEMENT_OPTIONS: {
  type: Exclude<FeedReactionType, "praying">;
  label: ReactNode;
  testId: string;
}[] = [
  { type: "amen", label: "Amen", testId: "feed-encouragement-amen" },
  {
    type: "praise_god",
    label: (
      <>
        <span className="sm:hidden">Praise</span>
        <span className="hidden sm:inline">Praise God</span>
      </>
    ),
    testId: "feed-encouragement-praise-god",
  },
  { type: "encouraged", label: "Encouraged", testId: "feed-encouragement-encouraged" },
];

type CommunityFeedInlineEncouragementProps = {
  storyId: string;
  userReactions: FeedReactionType[];
  pendingReactionKey?: string | null;
  onToggleReaction: (storyId: string, reactionType: FeedReactionType) => void;
};

function EncouragementButton({
  active,
  label,
  onClick,
  testId,
  disabled,
}: {
  active: boolean;
  label: ReactNode;
  onClick: () => void;
  testId: string;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-busy={disabled || undefined}
      className={`${styles.reactionButton} ${
        active ? styles.reactionActive : styles.reactionInactive
      } ${disabled ? styles.reactionPending : ""}`}
    >
      <span
        style={{
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {label}
      </span>
    </button>
  );
}

export default function CommunityFeedInlineEncouragement({
  storyId,
  userReactions,
  pendingReactionKey = null,
  onToggleReaction,
}: CommunityFeedInlineEncouragementProps) {
  return (
    <div className={styles.actionGridRow} data-testid="feed-encouragement-row">
      {ENCOURAGEMENT_OPTIONS.map((option) => {
        const pendingKey = `${storyId}:${option.type}`;
        const pending = pendingReactionKey === pendingKey;

        return (
          <EncouragementButton
            key={option.type}
            active={userReactions.includes(option.type)}
            label={option.label}
            testId={option.testId}
            disabled={pending}
            onClick={() => onToggleReaction(storyId, option.type)}
          />
        );
      })}
    </div>
  );
}
