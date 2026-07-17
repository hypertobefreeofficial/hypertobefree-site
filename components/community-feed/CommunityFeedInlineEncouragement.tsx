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
  onToggleReaction: (storyId: string, reactionType: FeedReactionType) => void;
};

function EncouragementButton({
  active,
  label,
  onClick,
  testId,
}: {
  active: boolean;
  label: ReactNode;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-pressed={active}
      className={`${styles.reactionButton} ${
        active ? styles.reactionActive : styles.reactionInactive
      }`}
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
  onToggleReaction,
}: CommunityFeedInlineEncouragementProps) {
  return (
    <div className={styles.actionGridRow} data-testid="feed-encouragement-row">
      {ENCOURAGEMENT_OPTIONS.map((option) => (
        <EncouragementButton
          key={option.type}
          active={userReactions.includes(option.type)}
          label={option.label}
          testId={option.testId}
          onClick={() => onToggleReaction(storyId, option.type)}
        />
      ))}
    </div>
  );
}
