"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FeedReactionType } from "./types";
import styles from "../FreedomFeed.module.css";

const REACTION_OPTIONS: {
  type: Exclude<FeedReactionType, "praying">;
  label: string;
  emoji: string;
}[] = [
  { type: "amen", label: "Amen", emoji: "🙏" },
  { type: "praise_god", label: "Praise God", emoji: "✨" },
  { type: "encouraged", label: "Encouraged", emoji: "💙" },
];

type CommunityFeedReactionSelectorProps = {
  storyId: string;
  userReactions: FeedReactionType[];
  onToggleReaction: (storyId: string, reactionType: FeedReactionType) => void;
};

export default function CommunityFeedReactionSelector({
  storyId,
  userReactions,
  onToggleReaction,
}: CommunityFeedReactionSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const activeReaction = REACTION_OPTIONS.find((option) =>
    userReactions.includes(option.type)
  );

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: Event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={styles.reactionSelectorRoot}
      data-feed-reaction-selector-root="true"
    >
      <button
        type="button"
        className={`${styles.primaryActionButton} ${
          activeReaction ? styles.primaryActionButtonActive : ""
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        {activeReaction
          ? `${activeReaction.emoji} ${activeReaction.label}`
          : "React"}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className={styles.reactionSelectorBackdrop}
            aria-label="Close reaction menu"
            onClick={() => setOpen(false)}
          />
          <div
            id={menuId}
            className={styles.reactionSelectorMenu}
            role="menu"
            aria-label="Choose a reaction"
          >
            {REACTION_OPTIONS.map((option) => {
              const active = userReactions.includes(option.type);
              return (
                <button
                  key={option.type}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  className={`${styles.reactionSelectorOption} ${
                    active ? styles.reactionSelectorOptionActive : ""
                  }`}
                  onClick={() => {
                    onToggleReaction(storyId, option.type);
                    setOpen(false);
                  }}
                >
                  <span aria-hidden>{option.emoji}</span>
                  {option.label}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
