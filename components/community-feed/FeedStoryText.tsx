"use client";

import { useState } from "react";
import styles from "../FreedomFeed.module.css";

type FeedStoryTextProps = {
  text: string | null;
  variant?: "default" | "testimony" | "praise" | "prayer";
  onOpen?: () => void;
  className?: string;
};

export default function FeedStoryText({
  text,
  variant = "default",
  onOpen,
  className = "",
}: FeedStoryTextProps) {
  const [expanded, setExpanded] = useState(false);
  const cleanText = text?.trim();

  if (!cleanText) return null;

  const isLong = cleanText.length > 180;
  const visibleText =
    !isLong || expanded ? cleanText : `${cleanText.slice(0, 180).trim()}...`;

  const variantClass =
    variant === "testimony"
      ? styles.testimonyEditorial
      : variant === "praise"
        ? styles.praiseOpening
        : variant === "prayer"
          ? styles.prayerStatement
          : "";

  return (
    <div className={`${styles.postInset} ${styles.postBody} ${className}`.trim()}>
      <p className={`${styles.postCaption} ${variantClass}`.trim()}>{visibleText}</p>

      {isLong && onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className={styles.readMoreButton}
        >
          Read more
        </button>
      ) : null}

      {isLong && !onOpen ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className={styles.readMoreButton}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

export function FeedStoryLead({
  text,
  variant = "default",
}: {
  text: string | null;
  variant?: "default" | "testimony" | "praise" | "prayer";
}) {
  const cleanText = text?.trim();
  if (!cleanText) return null;

  const firstSentence = cleanText.split(/(?<=[.!?])\s+/)[0]?.trim() ?? cleanText;
  const lead =
    firstSentence.length > 90
      ? `${firstSentence.slice(0, 90).trim()}…`
      : firstSentence;

  const variantClass =
    variant === "testimony"
      ? styles.testimonyLead
      : variant === "praise"
        ? styles.praiseLead
        : variant === "prayer"
          ? styles.prayerLead
          : styles.postLead;

  return (
    <div className={`${styles.postInset} ${styles.postLeadWrap}`}>
      <p className={variantClass}>{lead}</p>
    </div>
  );
}
